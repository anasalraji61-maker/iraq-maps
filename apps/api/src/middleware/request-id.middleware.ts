/**
 * Request-ID middleware for Fastify.
 *
 * Every inbound request receives a unique X-Request-ID header value.
 * If the client already sent one it is kept (after sanitizing); otherwise
 * a fresh UUID is generated. The ID is:
 *  - bound to the async context via TraceContext.run()
 *  - echoed back in the response as X-Request-ID
 *  - attached to log records via the child logger
 *
 * Environment variables:
 *  REQUEST_ID_HEADER   Header name to read/write. Default: 'x-request-id'
 *  REQUEST_ID_TRUST_UPSTREAM  '1' to trust an incoming ID from the client. Default: '1'
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TraceContext } from '@iraq-maps/observability';

// ── Config ─────────────────────────────────────────────────────────────────

const HEADER = (process.env['REQUEST_ID_HEADER'] ?? 'x-request-id').toLowerCase();
const TRUST_UPSTREAM = process.env['REQUEST_ID_TRUST_UPSTREAM'] !== '0';

/** Maximum allowed length for an incoming Request-ID before we reject it and generate a fresh one. */
const MAX_ID_LENGTH = 128;

/** Only allow alphanumeric, dashes, underscores, dots — safe for log sinks. */
const SAFE_ID = /^[\w.:-]+$/;

// ── Helpers ────────────────────────────────────────────────────────────────

function extractRequestId(headers: Record<string, string | string[] | undefined>): string {
  if (!TRUST_UPSTREAM) return randomUUID();
  const raw = headers[HEADER];
  const candidate = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (candidate && candidate.length <= MAX_ID_LENGTH && SAFE_ID.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

function extractTraceId(headers: Record<string, string | string[] | undefined>): string | undefined {
  // Support common upstream trace headers in order of preference
  const candidates = [
    headers['x-cloud-trace-context'],
    headers['x-trace-id'],
    headers['x-b3-traceid'],
  ];
  for (const c of candidates) {
    const v = typeof c === 'string' ? c : Array.isArray(c) ? c[0] : undefined;
    if (v) return v.split('/')[0]; // Cloud Trace uses traceId/spanId format
  }
  return undefined;
}

// ── RequestIdPlugin ────────────────────────────────────────────────────────

/**
 * Registers request-ID propagation hooks on the Fastify instance.
 *
 * Usage:
 *   registerRequestIdHooks(fastify);
 *
 * After registration, every request has:
 *   - req.headers['x-request-id'] (set to the resolved ID)
 *   - reply.header('x-request-id', id) in every response
 *   - TraceContext.current()?.requestId === id inside the handler
 */
export function registerRequestIdHooks(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(req.headers as Record<string, string | string[] | undefined>);
    const traceId = extractTraceId(req.headers as Record<string, string | string[] | undefined>);

    // Echo back immediately so the client can correlate even for early errors
    void reply.header(HEADER, requestId);

    // Bind to the async context so all downstream code can read it
    return new Promise<void>((resolve) => {
      TraceContext.run({ requestId, traceId }, () => {
        resolve();
      });
    });
  });

  // onSend ensures the header is present even on replies crafted before onRequest completes
  fastify.addHook('onSend', async (_req: FastifyRequest, reply: FastifyReply) => {
    const ctx = TraceContext.current();
    if (ctx?.requestId && !reply.hasHeader(HEADER)) {
      void reply.header(HEADER, ctx.requestId);
    }
  });
}

/**
 * Returns the current request ID from the async context,
 * or generates a fresh UUID if called outside a request context.
 */
export function currentRequestId(): string {
  return TraceContext.current()?.requestId ?? randomUUID();
}
