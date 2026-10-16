/**
 * Request timeout middleware for Fastify.
 *
 * Kills any request that takes longer than the configured threshold by:
 *  1. Sending a 504 Gateway Timeout response to the client
 *  2. Logging the slow request with its route, method and elapsed time
 *  3. Optionally recording a slow-request metric
 *
 * Configuration via environment variables:
 *  REQUEST_TIMEOUT_MS         Hard limit in ms; default 30_000 (30 s)
 *  SLOW_REQUEST_LOG_THRESHOLD_MS  Threshold for slow-request log warning; default 5_000 (5 s)
 *
 * Implementation notes:
 *  - Uses a per-request setInterval cleared in onResponse/onError.
 *  - reply.sent guards against double-sending if the handler finishes just
 *    as the timer fires.
 *  - Does NOT forcibly close the underlying socket; it only sends 504 and
 *    expects the framework to handle connection lifecycle.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@iraq-maps/observability';

const log = createLogger({ name: 'api:timeout' });

// ── Config ─────────────────────────────────────────────────────────────────

function envInt(key: string, fallback: number): number {
  const v = parseInt(process.env[key] ?? '', 10);
  return isNaN(v) ? fallback : v;
}

export interface TimeoutOptions {
  /** Hard request timeout in ms. Default: 30 000. */
  timeoutMs?: number;
  /** Requests slower than this get a warning log even if they succeed. Default: 5 000. */
  slowThresholdMs?: number;
  /** Optional callback for each timed-out request (e.g. to increment a metric). */
  onTimeout?: (opts: { route: string; method: string; elapsedMs: number }) => void;
  /** Optional callback for slow-but-successful requests. */
  onSlow?: (opts: { route: string; method: string; elapsedMs: number; statusCode: number }) => void;
}

const TIMER_KEY = Symbol('timeoutTimer');
const START_KEY = Symbol('timeoutStart');

type RequestWithTimer = FastifyRequest & {
  [TIMER_KEY]?: ReturnType<typeof setTimeout>;
  [START_KEY]?: number;
};

// ── Registration ───────────────────────────────────────────────────────────

/**
 * Registers request timeout and slow-request logging hooks.
 *
 * @example
 *   registerTimeoutHooks(fastify, {
 *     timeoutMs: 30_000,
 *     slowThresholdMs: 5_000,
 *     onTimeout: ({ route, elapsedMs }) => metrics.incTimeout(route, elapsedMs),
 *   });
 */
export function registerTimeoutHooks(fastify: FastifyInstance, opts: TimeoutOptions = {}): void {
  const timeoutMs = opts.timeoutMs ?? envInt('REQUEST_TIMEOUT_MS', 30_000);
  const slowThresholdMs = opts.slowThresholdMs ?? envInt('SLOW_REQUEST_LOG_THRESHOLD_MS', 5_000);

  // ── onRequest: start the timer ──
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const r = req as RequestWithTimer;
    r[START_KEY] = Date.now();

    r[TIMER_KEY] = setTimeout(() => {
      const elapsedMs = Date.now() - (r[START_KEY] ?? Date.now());
      const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? req.url;
      const method = req.method.toUpperCase();

      log.warn(
        {
          route,
          method,
          elapsedMs,
          requestId: (req.headers as Record<string, string | undefined>)['x-request-id'],
        },
        'request timed out — sending 504',
      );

      opts.onTimeout?.({ route, method, elapsedMs });

      if (!reply.sent) {
        void reply.status(504).send({
          type: 'about:blank',
          title: 'Gateway Timeout',
          status: 504,
          code: 'request_timeout',
          timeoutMs,
        });
      }
    }, timeoutMs);
  });

  // ── onResponse: cancel timer and log slow requests ──
  fastify.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const r = req as RequestWithTimer;
    if (r[TIMER_KEY]) {
      clearTimeout(r[TIMER_KEY]);
      r[TIMER_KEY] = undefined;
    }

    const start = r[START_KEY];
    if (!start) return;

    const elapsedMs = Date.now() - start;
    if (elapsedMs >= slowThresholdMs) {
      const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? req.url;
      const method = req.method.toUpperCase();
      log.warn(
        {
          route,
          method,
          elapsedMs,
          statusCode: reply.statusCode,
          requestId: (req.headers as Record<string, string | undefined>)['x-request-id'],
        },
        'slow request',
      );
      opts.onSlow?.({ route, method, elapsedMs, statusCode: reply.statusCode });
    }
  });

  // ── onError: cancel timer so we don't send 504 after an error response ──
  fastify.addHook('onError', async (req: FastifyRequest) => {
    const r = req as RequestWithTimer;
    if (r[TIMER_KEY]) {
      clearTimeout(r[TIMER_KEY]);
      r[TIMER_KEY] = undefined;
    }
  });
}

// ── Standalone helper ──────────────────────────────────────────────────────

/**
 * Wraps an async function with a timeout.
 * Rejects with a TimeoutError if `fn` does not resolve within `ms`.
 *
 * Useful for wrapping individual operations (e.g. third-party API calls)
 * independently of the request-level timeout.
 */
export class TimeoutError extends Error {
  constructor(
    public readonly operation: string,
    public readonly ms: number,
  ) {
    super(`"${operation}" timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(fn: () => Promise<T>, ms: number, operation = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(operation, ms)), ms);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}
