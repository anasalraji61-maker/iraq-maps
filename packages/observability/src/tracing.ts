/**
 * OpenTelemetry-compatible distributed tracing for Iraq Maps.
 *
 * Features:
 *  - TraceContext propagation via B3 single and multi-header format
 *  - Span creation with attributes, events and error recording
 *  - Async context propagation using AsyncLocalStorage
 *  - Configurable sampling: 100% for errors, configurable rate for success
 *  - FakeTracer for deterministic testing
 *  - DB query tracing helper (wrap any async query function)
 *  - HTTP request/response tracing (Fastify hook)
 *
 * Environment variables:
 *  TRACE_SAMPLE_RATE    Float 0.0–1.0; fraction of successful traces to keep. Default: 0.1
 *  TRACE_SERVICE_NAME   Service name label attached to every span. Default: 'iraq-maps-api'
 *  OTEL_EXPORTER_OTLP_ENDPOINT  If set, spans are exported via OTLP HTTP JSON to this URL.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

// ── IDs ────────────────────────────────────────────────────────────────────

function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function traceId(): string {
  return hex(16); // 128-bit
}

function spanId(): string {
  return hex(8); // 64-bit
}

// ── Types ──────────────────────────────────────────────────────────────────

export type SpanStatus = 'unset' | 'ok' | 'error';

export interface SpanAttributes {
  [key: string]: string | number | boolean | undefined;
}

export interface SpanEvent {
  name: string;
  timestampMs: number;
  attributes?: SpanAttributes;
}

/** An immutable snapshot of a completed span, used for export and testing. */
export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  status: SpanStatus;
  attributes: SpanAttributes;
  events: SpanEvent[];
  errorMessage?: string;
  sampled: boolean;
  serviceName: string;
}

/** A live span that callers can annotate before ending. */
export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;
  setAttributes(attrs: SpanAttributes): void;
  addEvent(name: string, attrs?: SpanAttributes): void;
  setStatus(status: SpanStatus): void;
  recordError(err: unknown): void;
  end(): SpanRecord;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/** B3 propagation headers extracted from an incoming request. */
export interface B3Headers {
  traceId?: string;
  spanId?: string;
  sampled?: boolean;
}

/** Minimal tracer interface; both the real and fake tracer implement this. */
export interface Tracer {
  startSpan(name: string, attrs?: SpanAttributes): Span;
  withSpan<T>(name: string, fn: (span: Span) => Promise<T>, attrs?: SpanAttributes): Promise<T>;
  currentSpanContext(): SpanContext | null;
}

// ── Config ─────────────────────────────────────────────────────────────────

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function sampleRate(): number {
  const v = parseFloat(env('TRACE_SAMPLE_RATE', '0.1'));
  return isNaN(v) ? 0.1 : Math.min(1, Math.max(0, v));
}

// ── OTLP exporter (fire-and-forget) ───────────────────────────────────────

function exportSpan(record: SpanRecord, endpoint: string): void {
  if (!record.sampled) return;
  const body = JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: record.serviceName } }],
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId: record.traceId,
                spanId: record.spanId,
                parentSpanId: record.parentSpanId,
                name: record.name,
                startTimeUnixNano: String(record.startMs * 1_000_000),
                endTimeUnixNano: String(record.endMs * 1_000_000),
                status: { code: record.status === 'error' ? 2 : record.status === 'ok' ? 1 : 0 },
                attributes: Object.entries(record.attributes)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => ({
                    key: k,
                    value:
                      typeof v === 'number'
                        ? { doubleValue: v }
                        : typeof v === 'boolean'
                          ? { boolValue: v }
                          : { stringValue: String(v) },
                  })),
                events: record.events.map((e) => ({
                  name: e.name,
                  timeUnixNano: String(e.timestampMs * 1_000_000),
                  attributes: Object.entries(e.attributes ?? {}).map(([k, v]) => ({
                    key: k,
                    value: { stringValue: String(v) },
                  })),
                })),
              },
            ],
          },
        ],
      },
    ],
  });

  const url = new URL('/v1/traces', endpoint);
  fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    // Best-effort export; never throw
  });
}

// ── LiveSpan ───────────────────────────────────────────────────────────────

class LiveSpan implements Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly name: string;

  private readonly startMs: number;
  private _status: SpanStatus = 'unset';
  private readonly _attrs: SpanAttributes;
  private readonly _events: SpanEvent[] = [];
  private _errorMessage?: string;
  private _ended = false;

  constructor(
    private readonly opts: {
      traceId: string;
      spanId: string;
      parentSpanId?: string;
      name: string;
      attrs: SpanAttributes;
      sampled: boolean;
      serviceName: string;
      otlpEndpoint?: string;
    },
  ) {
    this.traceId = opts.traceId;
    this.spanId = opts.spanId;
    this.name = opts.name;
    this._attrs = { ...opts.attrs };
    this.startMs = Date.now();
  }

  setAttributes(attrs: SpanAttributes): void {
    if (this._ended) return;
    Object.assign(this._attrs, attrs);
  }

  addEvent(name: string, attrs?: SpanAttributes): void {
    if (this._ended) return;
    this._events.push({ name, timestampMs: Date.now(), attributes: attrs });
  }

  setStatus(status: SpanStatus): void {
    if (this._ended) return;
    this._status = status;
  }

  recordError(err: unknown): void {
    if (this._ended) return;
    this._status = 'error';
    this._errorMessage =
      err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
    this.addEvent('exception', {
      'exception.type': err instanceof Error ? err.constructor.name : 'Unknown',
      'exception.message': this._errorMessage,
    });
  }

  end(): SpanRecord {
    if (this._ended) {
      throw new Error(`Span "${this.name}" already ended`);
    }
    this._ended = true;
    const endMs = Date.now();
    const record: SpanRecord = {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.opts.parentSpanId,
      name: this.name,
      startMs: this.startMs,
      endMs,
      durationMs: endMs - this.startMs,
      status: this._status,
      attributes: { ...this._attrs },
      events: [...this._events],
      errorMessage: this._errorMessage,
      sampled: this.opts.sampled,
      serviceName: this.opts.serviceName,
    };
    if (this.opts.otlpEndpoint) exportSpan(record, this.opts.otlpEndpoint);
    return record;
  }
}

// ── Sampling decision ──────────────────────────────────────────────────────

function shouldSample(forceError = false): boolean {
  if (forceError) return true; // Always sample error spans
  return Math.random() < sampleRate();
}

// ── Real tracer ────────────────────────────────────────────────────────────

interface ActiveSpanContext extends SpanContext {
  parentSpanId?: string;
}

const spanStorage = new AsyncLocalStorage<ActiveSpanContext>();

/**
 * Production tracer. Maintains async context so child spans automatically
 * link to their parent.
 */
export class OtelTracer implements Tracer {
  private readonly serviceName: string;
  private readonly otlpEndpoint: string | undefined;

  constructor(opts?: { serviceName?: string; otlpEndpoint?: string }) {
    this.serviceName = opts?.serviceName ?? env('TRACE_SERVICE_NAME', 'iraq-maps-api');
    this.otlpEndpoint = opts?.otlpEndpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  }

  startSpan(name: string, attrs: SpanAttributes = {}): Span {
    const parent = spanStorage.getStore();
    const tid = parent?.traceId ?? traceId();
    const sid = spanId();
    const sampled = parent?.sampled ?? shouldSample();

    const span = new LiveSpan({
      traceId: tid,
      spanId: sid,
      parentSpanId: parent?.spanId,
      name,
      attrs,
      sampled,
      serviceName: this.serviceName,
      otlpEndpoint: sampled ? this.otlpEndpoint : undefined,
    });
    return span;
  }

  async withSpan<T>(name: string, fn: (span: Span) => Promise<T>, attrs: SpanAttributes = {}): Promise<T> {
    const parent = spanStorage.getStore();
    const tid = parent?.traceId ?? traceId();
    const sid = spanId();
    const sampled = parent?.sampled ?? shouldSample();

    const span = new LiveSpan({
      traceId: tid,
      spanId: sid,
      parentSpanId: parent?.spanId,
      name,
      attrs,
      sampled,
      serviceName: this.serviceName,
      otlpEndpoint: sampled ? this.otlpEndpoint : undefined,
    });

    const ctx: ActiveSpanContext = { traceId: tid, spanId: sid, sampled };

    return spanStorage.run(ctx, async () => {
      try {
        const result = await fn(span);
        if (span['_status'] === 'unset') span.setStatus('ok');
        return result;
      } catch (err) {
        span.recordError(err);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  currentSpanContext(): SpanContext | null {
    return spanStorage.getStore() ?? null;
  }
}

// ── B3 propagation ─────────────────────────────────────────────────────────

export const B3 = {
  /**
   * Extracts B3 headers from an incoming HTTP request's headers object.
   * Supports both multi-header (X-B3-*) and single-header (b3) formats.
   */
  extract(headers: Record<string, string | string[] | undefined>): B3Headers {
    const single = headers['b3'];
    if (typeof single === 'string') {
      // Format: {traceId}-{spanId}-{flags}[-{parentSpanId}]
      const parts = single.split('-');
      if (parts.length >= 2) {
        return {
          traceId: parts[0],
          spanId: parts[1],
          sampled: parts[2] === '1',
        };
      }
    }
    const h = (k: string) => {
      const v = headers[k];
      return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
    };
    return {
      traceId: h('x-b3-traceid'),
      spanId: h('x-b3-spanid'),
      sampled: h('x-b3-sampled') === '1',
    };
  },

  /**
   * Returns headers to inject into an outgoing HTTP request to propagate the current trace.
   */
  inject(ctx: SpanContext): Record<string, string> {
    return {
      'x-b3-traceid': ctx.traceId,
      'x-b3-spanid': ctx.spanId,
      'x-b3-sampled': ctx.sampled ? '1' : '0',
      b3: `${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '1' : '0'}`,
    };
  },
} as const;

// ── DB query tracing helper ────────────────────────────────────────────────

/**
 * Wraps an async database operation with a span.
 *
 * @example
 *   const rows = await traceDbQuery(tracer, 'places.search', () => db.select(...));
 */
export async function traceDbQuery<T>(
  tracer: Tracer,
  label: string,
  fn: () => Promise<T>,
  attrs?: SpanAttributes,
): Promise<T> {
  return tracer.withSpan(`db.${label}`, async (span) => {
    span.setAttributes({
      'db.system': 'postgresql',
      'db.operation': label,
      ...attrs,
    });
    return fn();
  });
}

// ── HTTP tracing helpers ───────────────────────────────────────────────────

/**
 * Returns span attributes for an incoming HTTP request.
 * Do not include URL query parameters (may contain PII).
 */
export function httpRequestAttrs(opts: {
  method: string;
  route: string;
  userAgent?: string;
  ip?: string;
}): SpanAttributes {
  return {
    'http.method': opts.method.toUpperCase(),
    'http.route': opts.route,
    'http.user_agent': opts.userAgent,
    'net.peer.ip': opts.ip,
    'span.kind': 'server',
  };
}

export function httpResponseAttrs(statusCode: number, durationMs: number): SpanAttributes {
  return {
    'http.status_code': statusCode,
    'http.response_time_ms': durationMs,
  };
}

// ── Global singleton ───────────────────────────────────────────────────────

export const tracer: Tracer = new OtelTracer();

// ── FakeTracer ─────────────────────────────────────────────────────────────

class FakeSpan implements Span {
  readonly traceId = 'aaaa'.repeat(8);
  readonly spanId = 'bbbb'.repeat(4);
  readonly name: string;
  readonly recorded: SpanRecord[] = [];

  private _status: SpanStatus = 'unset';
  private _attrs: SpanAttributes = {};
  private readonly _events: SpanEvent[] = [];
  private _errorMsg?: string;
  private _ended = false;

  constructor(
    name: string,
    private readonly collector: SpanRecord[],
  ) {
    this.name = name;
  }

  setAttributes(attrs: SpanAttributes): void {
    Object.assign(this._attrs, attrs);
  }

  addEvent(name: string, attrs?: SpanAttributes): void {
    this._events.push({ name, timestampMs: Date.now(), attributes: attrs });
  }

  setStatus(s: SpanStatus): void {
    this._status = s;
  }

  recordError(err: unknown): void {
    this._status = 'error';
    this._errorMsg = err instanceof Error ? err.message : String(err);
  }

  end(): SpanRecord {
    if (this._ended) throw new Error(`FakeSpan "${this.name}" already ended`);
    this._ended = true;
    const now = Date.now();
    const rec: SpanRecord = {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: undefined,
      name: this.name,
      startMs: now - 1,
      endMs: now,
      durationMs: 1,
      status: this._status,
      attributes: { ...this._attrs },
      events: [...this._events],
      errorMessage: this._errorMsg,
      sampled: true,
      serviceName: 'test',
    };
    this.collector.push(rec);
    return rec;
  }
}

/**
 * Deterministic tracer for unit tests.
 * All spans are collected in `spans` and are always sampled.
 */
export class FakeTracer implements Tracer {
  readonly spans: SpanRecord[] = [];

  startSpan(name: string, _attrs?: SpanAttributes): Span {
    return new FakeSpan(name, this.spans);
  }

  async withSpan<T>(name: string, fn: (span: Span) => Promise<T>, _attrs?: SpanAttributes): Promise<T> {
    const span = new FakeSpan(name, this.spans);
    try {
      const result = await fn(span);
      span.setStatus('ok');
      span.end();
      return result;
    } catch (err) {
      span.recordError(err);
      span.end();
      throw err;
    }
  }

  currentSpanContext(): SpanContext | null {
    return { traceId: 'aaaa'.repeat(8), spanId: 'bbbb'.repeat(4), sampled: true };
  }

  reset(): void {
    this.spans.length = 0;
  }
}
