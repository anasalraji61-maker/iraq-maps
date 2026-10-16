/**
 * Prometheus metrics definitions for Iraq Maps API.
 *
 * Metric families:
 *  - HTTP request duration histogram (labeled by method, route, status class)
 *  - DB connection pool utilization gauges (total/idle/waiting)
 *  - Cache hit/miss counters (labeled by cache prefix)
 *  - Active WebSocket connections gauge
 *  - BullMQ job counters (labeled by queue name and state)
 *  - Node.js process metrics (heap, rss, event loop lag)
 *
 * All metrics are exported in Prometheus text exposition format v0.0.4
 * via the `PrometheusRegistry` class, and can be served on GET /metrics.
 *
 * This module is intentionally free of third-party Prometheus client libraries
 * so it stays lightweight and avoids prom-client's global registry pitfalls in tests.
 *
 * Environment variables:
 *  METRICS_ADMIN_KEY   Secret key checked in X-Admin-Key header; if unset, /metrics returns 404.
 *  METRICS_PREFIX      Prefix for all metric names. Default: 'iraq_maps'
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ── Types ──────────────────────────────────────────────────────────────────

export type Labels = Record<string, string | number>;

export interface CounterSample {
  labels: Labels;
  value: number;
}

export interface GaugeSample {
  labels: Labels;
  value: number;
}

export interface HistogramSample {
  labels: Labels;
  buckets: Map<number, number>; // bucket upper bound → cumulative count
  count: number;
  sum: number; // sum of observed values
}

// ── Helpers ────────────────────────────────────────────────────────────────

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function esc(s: string | number): string {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function labelStr(labels: Labels): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

function statusClass(code: number): string {
  if (code < 200) return '1xx';
  if (code < 300) return '2xx';
  if (code < 400) return '3xx';
  if (code < 500) return '4xx';
  return '5xx';
}

// ── HTTP histogram buckets (ms) ────────────────────────────────────────────

export const HTTP_DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 200, 500, 1000, 2500, 5000, 10000];

// ── PrometheusRegistry ─────────────────────────────────────────────────────

/**
 * In-process Prometheus metrics registry.
 *
 * All counter/gauge/histogram methods are synchronous and safe to call from
 * any async context. Use `serialize()` to get the Prometheus text output.
 */
export class PrometheusRegistry {
  private readonly prefix: string;

  // HTTP request duration histogram — keyed by `${method}:${route}:${statusClass}`
  private readonly httpDuration = new Map<string, HistogramSample>();

  // DB pool gauges — keyed by pool name
  private readonly poolTotal = new Map<string, number>();
  private readonly poolIdle = new Map<string, number>();
  private readonly poolWaiting = new Map<string, number>();

  // Cache counters — keyed by prefix
  private readonly cacheHits = new Map<string, number>();
  private readonly cacheMisses = new Map<string, number>();

  // WebSocket gauge
  private wsActive = 0;

  // BullMQ job counters — keyed by `${queue}:${state}`
  private readonly bullmqJobs = new Map<string, number>();

  // Process metrics are always read live from Node.js APIs
  // Event loop lag is measured with a setInterval trick
  private lagMs = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lagTimer: any = null;

  constructor(opts?: { prefix?: string }) {
    this.prefix = opts?.prefix ?? env('METRICS_PREFIX', 'iraq_maps');
  }

  // ── HTTP ───────────────────────────────────────────────────────────────

  /** Record a completed HTTP request. */
  observeHttp(opts: { method: string; route: string; statusCode: number; durationMs: number }): void {
    const key = `${opts.method.toUpperCase()}:${opts.route}:${statusClass(opts.statusCode)}`;
    let sample = this.httpDuration.get(key);
    if (!sample) {
      sample = {
        labels: {
          method: opts.method.toUpperCase(),
          route: opts.route,
          status_class: statusClass(opts.statusCode),
        },
        buckets: new Map(HTTP_DURATION_BUCKETS_MS.map((b) => [b, 0])),
        count: 0,
        sum: 0,
      };
      this.httpDuration.set(key, sample);
    }
    sample.count++;
    sample.sum += opts.durationMs;
    for (const b of HTTP_DURATION_BUCKETS_MS) {
      if (opts.durationMs <= b) {
        sample.buckets.set(b, (sample.buckets.get(b) ?? 0) + 1);
      }
    }
  }

  // ── DB pool ────────────────────────────────────────────────────────────

  /** Update pool utilization gauges. Call from pool event listeners. */
  setPoolStats(name: string, stats: { total: number; idle: number; waiting: number }): void {
    this.poolTotal.set(name, stats.total);
    this.poolIdle.set(name, stats.idle);
    this.poolWaiting.set(name, stats.waiting);
  }

  // ── Cache ──────────────────────────────────────────────────────────────

  recordCacheHit(prefix: string): void {
    this.cacheHits.set(prefix, (this.cacheHits.get(prefix) ?? 0) + 1);
  }

  recordCacheMiss(prefix: string): void {
    this.cacheMisses.set(prefix, (this.cacheMisses.get(prefix) ?? 0) + 1);
  }

  // ── WebSocket ──────────────────────────────────────────────────────────

  wsConnected(): void {
    this.wsActive++;
  }

  wsDisconnected(): void {
    this.wsActive = Math.max(0, this.wsActive - 1);
  }

  setWsActive(count: number): void {
    this.wsActive = Math.max(0, count);
  }

  // ── BullMQ ─────────────────────────────────────────────────────────────

  /**
   * Set the current count for a BullMQ queue in a given state.
   * Call this when polling queue stats (e.g. every 30 s from a worker).
   */
  setBullmqJobCount(queue: string, state: 'waiting' | 'active' | 'completed' | 'failed', count: number): void {
    this.bullmqJobs.set(`${queue}:${state}`, count);
  }

  /** Increment the completed counter for a queue (call from job completion hooks). */
  incBullmqCompleted(queue: string): void {
    const key = `${queue}:completed`;
    this.bullmqJobs.set(key, (this.bullmqJobs.get(key) ?? 0) + 1);
  }

  /** Increment the failed counter for a queue. */
  incBullmqFailed(queue: string): void {
    const key = `${queue}:failed`;
    this.bullmqJobs.set(key, (this.bullmqJobs.get(key) ?? 0) + 1);
  }

  // ── Event loop lag ─────────────────────────────────────────────────────

  /** Start measuring event loop lag. Call once at startup. */
  startLagMonitor(intervalMs = 1000): void {
    if (this.lagTimer) return;
    this.lagTimer = setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        this.lagMs = Date.now() - start;
      });
    }, intervalMs);
    this.lagTimer.unref();
  }

  stopLagMonitor(): void {
    if (this.lagTimer) {
      clearInterval(this.lagTimer);
      this.lagTimer = null;
    }
  }

  // ── Serialization ──────────────────────────────────────────────────────

  /**
   * Serialize all metrics to Prometheus text exposition format v0.0.4.
   * This is the body for GET /metrics responses.
   */
  serialize(): string {
    const p = this.prefix;
    const lines: string[] = [];

    // ── HTTP duration histogram ──
    lines.push(`# HELP ${p}_http_request_duration_ms HTTP request duration in milliseconds`);
    lines.push(`# TYPE ${p}_http_request_duration_ms histogram`);
    for (const sample of this.httpDuration.values()) {
      const lbl = labelStr(sample.labels);
      let cumulative = 0;
      for (const b of HTTP_DURATION_BUCKETS_MS) {
        cumulative += sample.buckets.get(b) ?? 0;
        lines.push(`${p}_http_request_duration_ms_bucket{${Object.entries(sample.labels).map(([k, v]) => `${k}="${esc(v)}"`).join(',')},le="${b}"} ${cumulative}`);
      }
      lines.push(`${p}_http_request_duration_ms_bucket{${Object.entries(sample.labels).map(([k, v]) => `${k}="${esc(v)}"`).join(',')},le="+Inf"} ${sample.count}`);
      lines.push(`${p}_http_request_duration_ms_sum${lbl} ${sample.sum}`);
      lines.push(`${p}_http_request_duration_ms_count${lbl} ${sample.count}`);
    }

    // ── DB pool ──
    lines.push(`# HELP ${p}_db_pool_connections_total Total connections in the DB pool`);
    lines.push(`# TYPE ${p}_db_pool_connections_total gauge`);
    lines.push(`# HELP ${p}_db_pool_connections_idle Idle connections in the DB pool`);
    lines.push(`# TYPE ${p}_db_pool_connections_idle gauge`);
    lines.push(`# HELP ${p}_db_pool_connections_waiting Requests waiting for a DB connection`);
    lines.push(`# TYPE ${p}_db_pool_connections_waiting gauge`);
    for (const [name, v] of this.poolTotal) {
      const lbl = `{pool="${esc(name)}"}`;
      lines.push(`${p}_db_pool_connections_total${lbl} ${v}`);
      lines.push(`${p}_db_pool_connections_idle${lbl} ${this.poolIdle.get(name) ?? 0}`);
      lines.push(`${p}_db_pool_connections_waiting${lbl} ${this.poolWaiting.get(name) ?? 0}`);
    }

    // ── Cache ──
    lines.push(`# HELP ${p}_cache_hits_total Cache hits by key prefix`);
    lines.push(`# TYPE ${p}_cache_hits_total counter`);
    lines.push(`# HELP ${p}_cache_misses_total Cache misses by key prefix`);
    lines.push(`# TYPE ${p}_cache_misses_total counter`);
    for (const [prefix, hits] of this.cacheHits) {
      lines.push(`${p}_cache_hits_total{prefix="${esc(prefix)}"} ${hits}`);
    }
    for (const [prefix, misses] of this.cacheMisses) {
      lines.push(`${p}_cache_misses_total{prefix="${esc(prefix)}"} ${misses}`);
    }

    // ── WebSocket ──
    lines.push(`# HELP ${p}_ws_connections_active Active WebSocket connections`);
    lines.push(`# TYPE ${p}_ws_connections_active gauge`);
    lines.push(`${p}_ws_connections_active ${this.wsActive}`);

    // ── BullMQ ──
    lines.push(`# HELP ${p}_bullmq_jobs_total BullMQ job counts by queue and state`);
    lines.push(`# TYPE ${p}_bullmq_jobs_total gauge`);
    for (const [key, count] of this.bullmqJobs) {
      const sep = key.lastIndexOf(':');
      const queue = key.slice(0, sep);
      const state = key.slice(sep + 1);
      lines.push(`${p}_bullmq_jobs_total{queue="${esc(queue)}",state="${esc(state)}"} ${count}`);
    }

    // ── Process metrics ──
    const mem = process.memoryUsage();
    lines.push(`# HELP ${p}_process_heap_bytes Node.js heap used bytes`);
    lines.push(`# TYPE ${p}_process_heap_bytes gauge`);
    lines.push(`${p}_process_heap_bytes ${mem.heapUsed}`);

    lines.push(`# HELP ${p}_process_rss_bytes Node.js RSS bytes`);
    lines.push(`# TYPE ${p}_process_rss_bytes gauge`);
    lines.push(`${p}_process_rss_bytes ${mem.rss}`);

    lines.push(`# HELP ${p}_process_uptime_seconds Process uptime in seconds`);
    lines.push(`# TYPE ${p}_process_uptime_seconds counter`);
    lines.push(`${p}_process_uptime_seconds ${process.uptime().toFixed(3)}`);

    lines.push(`# HELP ${p}_event_loop_lag_ms Approximate event loop lag in ms`);
    lines.push(`# TYPE ${p}_event_loop_lag_ms gauge`);
    lines.push(`${p}_event_loop_lag_ms ${this.lagMs}`);

    return lines.join('\n') + '\n';
  }

  /** Reset all counters and histograms (useful in tests). */
  reset(): void {
    this.httpDuration.clear();
    this.poolTotal.clear();
    this.poolIdle.clear();
    this.poolWaiting.clear();
    this.cacheHits.clear();
    this.cacheMisses.clear();
    this.wsActive = 0;
    this.bullmqJobs.clear();
    this.lagMs = 0;
  }
}

// ── Global singleton ───────────────────────────────────────────────────────

/** Process-global Prometheus registry. Import in middleware and workers. */
export const registry = new PrometheusRegistry();

// ── Fastify endpoint ───────────────────────────────────────────────────────

/**
 * Registers GET /metrics on the Fastify instance.
 * Protected by X-Admin-Key header when METRICS_ADMIN_KEY is set.
 *
 * @param fastify       Fastify instance
 * @param reg           PrometheusRegistry to serialize
 * @param adminKey      Required header value; omit to disable endpoint entirely
 * @param extraText     Optional additional Prometheus text to append
 */
export function registerMetricsRoute(
  fastify: FastifyInstance,
  reg: PrometheusRegistry,
  adminKey: string | undefined,
  extraText?: () => string,
): void {
  if (!adminKey) return;

  fastify.get('/metrics', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (key !== adminKey) {
      return reply.status(401).send({ status: 401, code: 'unauthorized', title: 'Unauthorized' });
    }

    let body = reg.serialize();
    if (extraText) body += extraText();

    return reply
      .status(200)
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  });
}
