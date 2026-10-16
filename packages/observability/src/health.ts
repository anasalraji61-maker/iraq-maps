/**
 * Health check service for Iraq Maps API.
 *
 * Checks:
 *  - PostgreSQL connectivity (SELECT 1)
 *  - Redis connectivity (PING)
 *  - Heap memory usage vs. threshold
 *  - Disk space at a configurable path (default: process.cwd())
 *
 * Exposes three HTTP endpoints (register with Fastify):
 *  GET /health        — overall status: 200 ok, 207 degraded, 503 down
 *  GET /health/ready  — readiness: 200 if all critical checks pass, 503 otherwise
 *  GET /health/live   — liveness: always 200 unless SIGTERM received
 *
 * Environment variables:
 *  HEALTH_MAX_HEAP_MB      Heap threshold in MB; default 512
 *  HEALTH_DISK_PATH        Path to check; default process.cwd()
 *  HEALTH_MIN_DISK_MB      Min free disk in MB; default 100
 */

import { statfs } from 'node:fs/promises';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ── Types ──────────────────────────────────────────────────────────────────

export type CheckStatus = 'ok' | 'degraded' | 'down';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  /** Human-readable detail; omit PII and secrets. */
  detail?: string;
  /** Round-trip or operation latency, if measured. */
  latencyMs?: number;
  /** Whether this check failing makes the whole service 'down' (vs. 'degraded'). */
  critical: boolean;
}

export interface HealthResult {
  status: CheckStatus;
  /** ISO timestamp of when the check was performed. */
  checkedAt: string;
  uptimeSeconds: number;
  checks: CheckResult[];
}

export interface DbPing {
  ping(): Promise<void>;
}

export interface RedisPing {
  ping(): Promise<'PONG' | string>;
}

export interface HealthServiceOptions {
  db?: DbPing;
  redis?: RedisPing;
  /** Max heap usage in MB before reporting degraded. Default: 512. */
  maxHeapMb?: number;
  /** Filesystem path to check for free space. Default: process.cwd(). */
  diskPath?: string;
  /** Min free disk in MB before reporting degraded. Default: 100. */
  minDiskMb?: number;
  /** Timeout for each I/O check in ms. Default: 3000. */
  checkTimeoutMs?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const startedAt = Date.now();
let terminating = false;

process.once('SIGTERM', () => {
  terminating = true;
});

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// ── Check implementations ──────────────────────────────────────────────────

async function checkDb(db: DbPing, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withTimeout(db.ping(), timeoutMs, 'db');
    return { name: 'postgres', status: 'ok', latencyMs: Date.now() - start, critical: true };
  } catch (err) {
    return {
      name: 'postgres',
      status: 'down',
      detail: err instanceof Error ? err.message : 'unknown error',
      critical: true,
    };
  }
}

async function checkRedis(redis: RedisPing, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await withTimeout(redis.ping(), timeoutMs, 'redis');
    const ok = res === 'PONG';
    return {
      name: 'redis',
      status: ok ? 'ok' : 'degraded',
      detail: ok ? undefined : `unexpected response: ${res}`,
      latencyMs: Date.now() - start,
      critical: false,
    };
  } catch (err) {
    return {
      name: 'redis',
      status: 'degraded',
      detail: err instanceof Error ? err.message : 'unknown error',
      critical: false,
    };
  }
}

function checkMemory(maxHeapMb: number): CheckResult {
  const heap = process.memoryUsage();
  const usedMb = heap.heapUsed / 1024 / 1024;
  const totalMb = heap.heapTotal / 1024 / 1024;
  const rss = heap.rss / 1024 / 1024;
  const ok = usedMb < maxHeapMb;
  return {
    name: 'memory',
    status: ok ? 'ok' : 'degraded',
    detail: `heap ${usedMb.toFixed(0)}/${totalMb.toFixed(0)} MB rss ${rss.toFixed(0)} MB`,
    critical: false,
  };
}

async function checkDisk(diskPath: string, minFreeMb: number): Promise<CheckResult> {
  try {
    const stats = await statfs(diskPath);
    const freeMb = (stats.bfree * stats.bsize) / 1024 / 1024;
    const totalMb = (stats.blocks * stats.bsize) / 1024 / 1024;
    const ok = freeMb >= minFreeMb;
    return {
      name: 'disk',
      status: ok ? 'ok' : 'degraded',
      detail: `${freeMb.toFixed(0)} MB free of ${totalMb.toFixed(0)} MB`,
      critical: false,
    };
  } catch (err) {
    return {
      name: 'disk',
      status: 'degraded',
      detail: err instanceof Error ? err.message : 'unknown error',
      critical: false,
    };
  }
}

function rollup(checks: CheckResult[]): CheckStatus {
  if (checks.some((c) => c.critical && c.status === 'down')) return 'down';
  if (checks.some((c) => c.status !== 'ok')) return 'degraded';
  return 'ok';
}

// ── HealthService ──────────────────────────────────────────────────────────

export class HealthService {
  private readonly maxHeapMb: number;
  private readonly diskPath: string;
  private readonly minDiskMb: number;
  private readonly checkTimeoutMs: number;

  constructor(private readonly opts: HealthServiceOptions = {}) {
    this.maxHeapMb = opts.maxHeapMb ?? parseInt(env('HEALTH_MAX_HEAP_MB', '512'), 10);
    this.diskPath = opts.diskPath ?? env('HEALTH_DISK_PATH', process.cwd());
    this.minDiskMb = opts.minDiskMb ?? parseInt(env('HEALTH_MIN_DISK_MB', '100'), 10);
    this.checkTimeoutMs = opts.checkTimeoutMs ?? 3000;
  }

  /**
   * Runs all registered checks and returns a composite health result.
   * Never throws; errors from individual checks are captured as check results.
   */
  async getHealth(): Promise<HealthResult> {
    const tasks: Promise<CheckResult>[] = [];

    if (this.opts.db) tasks.push(checkDb(this.opts.db, this.checkTimeoutMs));
    if (this.opts.redis) tasks.push(checkRedis(this.opts.redis, this.checkTimeoutMs));
    tasks.push(Promise.resolve(checkMemory(this.maxHeapMb)));
    tasks.push(checkDisk(this.diskPath, this.minDiskMb));

    const checks = await Promise.all(tasks);
    const status = rollup(checks);

    return {
      status,
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      checks,
    };
  }

  /**
   * Readiness: all critical checks must be ok.
   * Kubernetes uses this to decide whether to send traffic.
   */
  async isReady(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status !== 'down';
  }

  /**
   * Liveness: process is alive and not in graceful shutdown.
   * Kubernetes uses this to decide whether to restart the pod.
   */
  isAlive(): boolean {
    return !terminating;
  }
}

// ── Fastify endpoint registration ──────────────────────────────────────────

/**
 * Registers /health, /health/ready and /health/live on the Fastify instance.
 *
 * Responses:
 *  /health        200 (ok) | 207 (degraded) | 503 (down)
 *  /health/ready  200 | 503
 *  /health/live   200 always (unless SIGTERM received → 503)
 */
export function registerHealthRoutes(fastify: FastifyInstance, service: HealthService): void {
  fastify.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    const health = await service.getHealth();
    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 207 : 503;
    return reply.status(statusCode).header('content-type', 'application/json').send(health);
  });

  fastify.get('/health/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    const ready = await service.isReady();
    if (ready) {
      return reply.status(200).send({ status: 'ready' });
    }
    return reply.status(503).send({ status: 'not ready' });
  });

  fastify.get('/health/live', (_req: FastifyRequest, reply: FastifyReply) => {
    if (service.isAlive()) {
      return reply.status(200).send({ status: 'alive' });
    }
    return reply.status(503).send({ status: 'terminating' });
  });
}

// ── Adapter helpers ────────────────────────────────────────────────────────

/**
 * Wraps a pg.Pool (or our ConnectionPool.native) as a DbPing.
 * Only does a SELECT 1 on a fresh client; never logs queries.
 */
export function pgPoolPing(pool: { connect(): Promise<{ query(sql: string): Promise<unknown>; release(): void }> }): DbPing {
  return {
    async ping(): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Wraps an ioredis instance as a RedisPing.
 */
export function ioreidisPing(redis: { ping(): Promise<string> }): RedisPing {
  return { ping: () => redis.ping() };
}
