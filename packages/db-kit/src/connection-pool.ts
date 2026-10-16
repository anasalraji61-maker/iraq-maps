import pg from 'pg';
import { createLogger } from '@iraq-maps/observability';

const log = createLogger({ name: 'db:pool' });

export interface PoolHealthResult {
  healthy: boolean;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  latencyMs: number | null;
}

export interface ConnectionPoolOptions {
  url: string;
  /** Maximum pool size. Default: 20. */
  maxConnections?: number;
  /** Idle connection timeout in ms. Default: 30_000 (30 s). */
  idleTimeoutMs?: number;
  /** Connection acquire timeout in ms. Default: 5_000 (5 s). */
  acquireTimeoutMs?: number;
  /** How often to check pool health for logging, in ms. Default: 60_000 (1 min). Disable: 0. */
  healthCheckIntervalMs?: number;
}

/**
 * Managed connection pool with:
 * - structured error logging (SQLSTATE only, never query text or values)
 * - periodic health check logging
 * - explicit `healthCheck()` for readiness probes
 * - graceful `close()` that drains all connections
 */
export class ConnectionPool {
  private readonly pool: pg.Pool;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: ConnectionPoolOptions) {
    this.pool = new pg.Pool({
      connectionString: opts.url,
      max: opts.maxConnections ?? 20,
      idleTimeoutMillis: opts.idleTimeoutMs ?? 30_000,
      connectionTimeoutMillis: opts.acquireTimeoutMs ?? 5_000,
    });

    this.pool.on('error', (err: Error & { code?: string }) => {
      log.warn({ pgCode: err.code }, 'idle pg client error');
    });

    this.pool.on('connect', () => {
      log.debug({ total: this.pool.totalCount, idle: this.pool.idleCount }, 'pg client connected');
    });

    this.pool.on('remove', () => {
      log.debug({ total: this.pool.totalCount, idle: this.pool.idleCount }, 'pg client removed');
    });

    const interval = opts.healthCheckIntervalMs ?? 60_000;
    if (interval > 0) {
      this.healthTimer = setInterval(() => {
        void this.healthCheck().then((h) => {
          if (!h.healthy) {
            log.warn({ health: h }, 'connection pool unhealthy');
          } else {
            log.debug({ health: h }, 'connection pool health');
          }
        });
      }, interval);
      // Don't prevent process exit
      this.healthTimer.unref();
    }
  }

  /** The underlying `pg.Pool` — pass to `drizzle()`. */
  get native(): pg.Pool {
    return this.pool;
  }

  /** Pool statistics snapshot. */
  get stats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  /**
   * Runs a lightweight `SELECT 1` to verify connectivity.
   * Returns timing and pool stats; never throws.
   */
  async healthCheck(): Promise<PoolHealthResult> {
    const start = Date.now();
    let healthy = false;
    let latencyMs: number | null = null;

    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        latencyMs = Date.now() - start;
        healthy = true;
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      log.warn({ pgCode: code }, 'pool health check failed');
    }

    return {
      healthy,
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      latencyMs,
    };
  }

  /**
   * Gracefully drains all pool connections.
   * Waits for in-flight queries; blocks new acquires.
   */
  async close(): Promise<void> {
    if (this.healthTimer !== null) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    await this.pool.end();
    log.info('connection pool closed');
  }
}
