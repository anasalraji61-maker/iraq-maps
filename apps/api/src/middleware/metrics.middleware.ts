/**
 * Request-timing metrics hook for Fastify.
 *
 * Records per-request timings into the PerformanceMonitor from @iraq-maps/observability.
 * Exposes the collected metrics on GET /metrics (admin-only).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PerformanceMonitor } from '@iraq-maps/observability';

// ── Metrics hook ───────────────────────────────────────────────────────────

const TIMING_KEY = Symbol('metricsStart');

type RequestWithTiming = FastifyRequest & {
  [TIMING_KEY]?: { startMs: number; route: string; method: string };
};

/**
 * Registers two Fastify lifecycle hooks:
 *  - `onRequest`:  captures start time and route
 *  - `onResponse`: records duration into the PerformanceMonitor
 *
 * @param fastify  - Fastify instance
 * @param monitor  - Shared PerformanceMonitor instance
 */
export function registerMetricsHooks(fastify: FastifyInstance, monitor: PerformanceMonitor): void {
  fastify.addHook('onRequest', async (req: FastifyRequest) => {
    const r = req as RequestWithTiming;
    r[TIMING_KEY] = {
      startMs: Date.now(),
      route: req.routeOptions?.url ?? req.url.split('?')[0] ?? req.url,
      method: req.method.toUpperCase(),
    };
  });

  fastify.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const r = req as RequestWithTiming;
    const meta = r[TIMING_KEY];
    if (!meta) return;

    const durationMs = Date.now() - meta.startMs;
    monitor.recordHttp(meta.route, meta.method, reply.statusCode, durationMs);
  });
}

// ── /metrics endpoint ──────────────────────────────────────────────────────

/**
 * Registers a GET /metrics endpoint on `fastify`.
 * Protected by the admin key (X-Admin-Key header).
 *
 * @param fastify    - Fastify instance
 * @param monitor    - Shared PerformanceMonitor instance
 * @param adminKey   - Admin key string (from env); pass undefined to disable the endpoint
 * @param extraText  - Optional extra Prometheus text to append (e.g. from DatabaseMetrics)
 */
export function registerMetricsEndpoint(
  fastify: FastifyInstance,
  monitor: PerformanceMonitor,
  adminKey: string | undefined,
  extraText?: () => string,
): void {
  fastify.get('/metrics', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!adminKey) {
      return reply.status(404).send();
    }
    const key = (req.headers as Record<string, string | undefined>)['x-admin-key'];
    if (key !== adminKey) {
      return reply.status(401).send({ type: 'about:blank', status: 401, code: 'unauthorized', title: 'Unauthorized' });
    }

    let body = monitor.toPrometheusText();
    if (extraText) body += extraText();

    return reply
      .status(200)
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  });
}

// ── Histogram helpers ──────────────────────────────────────────────────────

/** Standard bucket boundaries (ms) for response-time histograms. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000] as const;

/**
 * Classifies a duration into a bucket label.
 * Useful for custom histogram tracking when you want named buckets instead of percentiles.
 */
export function latencyBucket(durationMs: number): string {
  for (const b of LATENCY_BUCKETS_MS) {
    if (durationMs <= b) return `le_${b}`;
  }
  return 'le_inf';
}
