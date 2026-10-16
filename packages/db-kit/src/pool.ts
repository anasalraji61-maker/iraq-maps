/**
 * Enhanced connection pool management for Iraq Maps.
 *
 * Wraps the existing ConnectionPool with:
 *  - Explicit min/max sizing (10 min connections kept warm, 50 max)
 *  - Pool metrics exposed in Prometheus-compatible format
 *  - Slow query logging (threshold configurable via env SLOW_QUERY_MS; default 500)
 *  - Graceful shutdown on SIGTERM/SIGINT: stop accepting new connections,
 *    drain in-flight queries, then close the pool
 *  - Health check method for readiness probes
 *  - Query wrapper that records duration and triggers slow-query logging
 *
 * Environment variables:
 *  DATABASE_URL           PostgreSQL connection string (required)
 *  DB_POOL_MIN            Minimum pool size. Default: 10
 *  DB_POOL_MAX            Maximum pool size. Default: 50
 *  DB_IDLE_TIMEOUT_MS     Idle connection timeout. Default: 30 000
 *  DB_ACQUIRE_TIMEOUT_MS  Connection acquire timeout. Default: 5 000
 *  DB_HEALTH_INTERVAL_MS  Periodic health log interval. Default: 60 000
 *  SLOW_QUERY_MS          Log a warning for queries exceeding this. Default: 500
 */

import pg from 'pg';
import { createLogger } from '@iraq-maps/observability';

const log = createLogger({ name: 'db:pool' });

// ── Config ─────────────────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
  const v = parseInt(process.env[key] ?? '', 10);
  return isNaN(v) ? fallback : v;
}

export interface PoolConfig {
  /** PostgreSQL connection string. */
  url: string;
  /** Minimum connections to keep open. Default: 10. */
  minConnections?: number;
  /** Maximum pool size. Default: 50. */
  maxConnections?: number;
  /** Idle connection timeout in ms. Default: 30 000. */
  idleTimeoutMs?: number;
  /** Connection acquire timeout in ms. Default: 5 000. */
  acquireTimeoutMs?: number;
  /** Periodic health-log interval in ms. 0 to disable. Default: 60 000. */
  healthIntervalMs?: number;
  /** Queries slower than this (ms) produce a warning log. Default: 500. */
  slowQueryMs?: number;
  /** Optional Prometheus-style metric callback for pool stats. */
  onPoolStats?: (stats: PoolStats) => void;
}

export interface PoolStats {
  /** Pool name (defaults to 'default'). */
  name: string;
  /** Total connections (idle + active). */
  total: number;
  /** Idle connections. */
  idle: number;
  /** Requests waiting for a connection. */
  waiting: number;
  /** Pool utilization ratio: (total - idle) / max. */
  utilizationRatio: number;
}

export interface PoolHealthResult {
  healthy: boolean;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  /** Round-trip latency of SELECT 1 in ms. null if check failed. */
  latencyMs: number | null;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number | null;
  durationMs: number;
}

// ── ManagedPool ────────────────────────────────────────────────────────────

/**
 * Production-grade PostgreSQL connection pool with metrics, slow-query logging
 * and graceful SIGTERM handling built in.
 *
 * @example
 *   const pool = new ManagedPool({ url: process.env.DATABASE_URL! });
 *   await pool.start();
 *   // ... use pool.query() ...
 *   await pool.shutdown(); // or let SIGTERM handle it
 */
export class ManagedPool {
  private readonly pool: pg.Pool;
  private readonly maxConnections: number;
  private readonly slowQueryMs: number;
  private readonly name: string;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownCalled = false;
  private readonly signalHandlers: Array<() => void> = [];

  constructor(
    private readonly config: PoolConfig,
    name = 'default',
  ) {
    this.name = name;
    this.maxConnections = config.maxConnections ?? envInt('DB_POOL_MAX', 50);
    this.slowQueryMs = config.slowQueryMs ?? envInt('SLOW_QUERY_MS', 500);

    this.pool = new pg.Pool({
      connectionString: config.url,
      min: config.minConnections ?? envInt('DB_POOL_MIN', 10),
      max: this.maxConnections,
      idleTimeoutMillis: config.idleTimeoutMs ?? envInt('DB_IDLE_TIMEOUT_MS', 30_000),
      connectionTimeoutMillis: config.acquireTimeoutMs ?? envInt('DB_ACQUIRE_TIMEOUT_MS', 5_000),
    });

    this.pool.on('error', (err: Error & { code?: string }) => {
      log.warn({ pool: this.name, pgCode: err.code }, 'idle pg client error');
    });

    this.pool.on('connect', () => {
      log.debug(
        { pool: this.name, total: this.pool.totalCount, idle: this.pool.idleCount },
        'client connected',
      );
      this.emitPoolStats();
    });

    this.pool.on('remove', () => {
      log.debug(
        { pool: this.name, total: this.pool.totalCount, idle: this.pool.idleCount },
        'client removed',
      );
      this.emitPoolStats();
    });
  }

  // ── Start ──────────────────────────────────────────────────────────────

  /**
   * Starts the periodic health check and registers SIGTERM/SIGINT handlers.
   * Call once at application startup.
   */
  start(): void {
    const interval = this.config.healthIntervalMs ?? envInt('DB_HEALTH_INTERVAL_MS', 60_000);
    if (interval > 0) {
      this.healthTimer = setInterval(() => {
        void this.healthCheck().then((h) => {
          const fn = h.healthy ? 'debug' : 'warn';
          log[fn]({ pool: this.name, health: h }, h.healthy ? 'pool health ok' : 'pool health degraded');
          this.emitPoolStats();
        });
      }, interval);
      this.healthTimer.unref();
    }

    const onSignal = () => {
      log.info({ pool: this.name }, 'signal received — draining pool');
      void this.shutdown();
    };

    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
    this.signalHandlers.push(onSignal);
  }

  // ── Raw pool accessor ──────────────────────────────────────────────────

  /** The underlying `pg.Pool`. Pass to `drizzle()`. */
  get native(): pg.Pool {
    return this.pool;
  }

  // ── Stats ──────────────────────────────────────────────────────────────

  getStats(): PoolStats {
    const total = this.pool.totalCount;
    const idle = this.pool.idleCount;
    const waiting = this.pool.waitingCount;
    const active = total - idle;
    return {
      name: this.name,
      total,
      idle,
      waiting,
      utilizationRatio: this.maxConnections > 0 ? active / this.maxConnections : 0,
    };
  }

  private emitPoolStats(): void {
    if (this.config.onPoolStats) {
      this.config.onPoolStats(this.getStats());
    }
  }

  // ── Health check ───────────────────────────────────────────────────────

  /**
   * Executes a lightweight `SELECT 1` to verify DB connectivity.
   * Never throws; errors are captured in the result.
   */
  async healthCheck(): Promise<PoolHealthResult> {
    const start = Date.now();
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return {
          healthy: true,
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount,
          latencyMs: Date.now() - start,
        };
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      log.warn({ pool: this.name, pgCode: (err as { code?: string }).code }, 'health check failed');
      return {
        healthy: false,
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
        latencyMs: null,
      };
    }
  }

  // ── Query execution ────────────────────────────────────────────────────

  /**
   * Executes a parameterized query and returns typed rows.
   * Logs a warning if the query exceeds the slow-query threshold.
   *
   * IMPORTANT: Never put sensitive values in `label`.
   * @param label  Logical name for logging (e.g. 'places.search'). No user data.
   * @param sql    Parameterized SQL string.
   * @param params Bound parameter values.
   */
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    label: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (this.shutdownCalled) {
      throw new Error('Pool is shutting down');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query<T>(sql, params);
      const durationMs = Date.now() - start;

      if (durationMs >= this.slowQueryMs) {
        log.warn(
          { pool: this.name, label, durationMs, slowQueryMs: this.slowQueryMs },
          'slow query',
        );
      } else {
        log.debug({ pool: this.name, label, durationMs }, 'query ok');
      }

      return { rows: result.rows, rowCount: result.rowCount, durationMs };
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      log.warn(
        { pool: this.name, label, durationMs, pgCode: (err as { code?: string }).code },
        'query error',
      );
      throw err;
    }
  }

  /**
   * Acquires a client for multi-statement transactions.
   * Always use try/finally to release the client.
   *
   * @example
   *   const client = await pool.connect();
   *   try {
   *     await client.query('BEGIN');
   *     // ...
   *     await client.query('COMMIT');
   *   } catch {
   *     await client.query('ROLLBACK');
   *   } finally {
   *     client.release();
   *   }
   */
  async connect(): Promise<pg.PoolClient> {
    if (this.shutdownCalled) {
      throw new Error('Pool is shutting down');
    }
    return this.pool.connect();
  }

  // ── Graceful shutdown ──────────────────────────────────────────────────

  /**
   * Stops accepting new connections, waits for in-flight queries to finish,
   * then closes the pool.
   *
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  async shutdown(): Promise<void> {
    if (this.shutdownCalled) return;
    this.shutdownCalled = true;

    if (this.healthTimer !== null) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    // Remove signal listeners to avoid double shutdown
    for (const fn of this.signalHandlers) {
      process.off('SIGTERM', fn);
      process.off('SIGINT', fn);
    }
    this.signalHandlers.length = 0;

    log.info(
      { pool: this.name, total: this.pool.totalCount, waiting: this.pool.waitingCount },
      'draining connection pool',
    );

    await this.pool.end();
    log.info({ pool: this.name }, 'pool closed');
  }

  // ── Prometheus text export ─────────────────────────────────────────────

  /** Returns Prometheus text for this pool's metrics. */
  toPrometheusText(): string {
    const stats = this.getStats();
    const n = this.name;
    return [
      `# HELP db_pool_connections_total Total connections in pool "${n}"`,
      `# TYPE db_pool_connections_total gauge`,
      `db_pool_connections_total{pool="${n}"} ${stats.total}`,
      `# HELP db_pool_connections_idle Idle connections in pool "${n}"`,
      `# TYPE db_pool_connections_idle gauge`,
      `db_pool_connections_idle{pool="${n}"} ${stats.idle}`,
      `# HELP db_pool_connections_waiting Requests waiting for a connection from pool "${n}"`,
      `# TYPE db_pool_connections_waiting gauge`,
      `db_pool_connections_waiting{pool="${n}"} ${stats.waiting}`,
      `# HELP db_pool_utilization_ratio Active/max utilization of pool "${n}"`,
      `# TYPE db_pool_utilization_ratio gauge`,
      `db_pool_utilization_ratio{pool="${n}"} ${stats.utilizationRatio.toFixed(4)}`,
    ].join('\n') + '\n';
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates and starts a ManagedPool from environment variables.
 *
 * @param url  Override DATABASE_URL (required if env var is absent)
 * @param name Pool name, used in logs and metrics
 */
export function createManagedPool(url?: string, name = 'default'): ManagedPool {
  const connectionUrl = url ?? process.env['DATABASE_URL'];
  if (!connectionUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const pool = new ManagedPool({ url: connectionUrl }, name);
  pool.start();
  return pool;
}
