export { PerformanceMonitor, type HttpSample, type CacheSample, type HttpStats, type CacheStats } from './performance-monitor';
export { AppMetrics, appMetrics, type CacheHitMetric, type QueryDurationSample, type QueryDurationStats, type RateLimitBreach } from './metrics';
export { AlertManager, type AlertThreshold, type AlertEvent, type AlertSeverity, type AlertWebhookConfig } from './alert-manager';
export { TraceContext, type TraceData } from './trace-context';
export {
  AnalyticsTracker,
  createAnalyticsTracker,
  AnalyticsEvents,
  type AnalyticsEvent,
  type AnalyticsBatch,
  type PageEvent,
  type DeviceInfo,
  type EventProperties,
  type AnalyticsTrackerOptions,
  type AnalyticsStorage,
  type AnalyticsEventName,
} from './analytics';
export {
  CrashReporter,
  createCrashReporter,
  parseStackTrace,
  type CrashReport,
  type CrashContext,
  type Breadcrumb,
  type StackFrame,
  type ParsedStackTrace,
  type NetworkState,
  type CrashReporterOptions,
  type CrashStorage,
} from './crash-reporter';

import { pino } from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFn = (objOrMsg: Record<string, unknown> | string, msg?: string) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

const SECRET_KEYS = new Set(['authorization', 'token', 'refreshtoken', 'accesstoken', 'otp', 'code']);
const COORD_KEYS = new Set(['lat', 'lng', 'lon', 'latitude', 'longitude']);
// +9647xxxxxxxxx, 9647xxxxxxxxx and 07xxxxxxxxx (Iraqi mobile), and JWT-looking header.payload.signature tokens.
const PHONE = /(?<!\w)(?:\+?964|0)7\d{9}(?!\w)/g;
const JWT = /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g;

/** JSON.parse reviver applied to every finished log line, so msg, bindings, nested fields and serialized errors are all covered. */
function redact(key: string, value: unknown): unknown {
  const k = key.toLowerCase().replace(/[-_]/g, '');
  if (SECRET_KEYS.has(k)) return '[redacted]';
  if (COORD_KEYS.has(k) && typeof value === 'number') return Math.round(value * 100) / 100;
  if (typeof value === 'string') return value.replace(PHONE, '[phone]').replace(JWT, '[jwt]');
  return value;
}

const captures = new Set<string[]>();
const sink = {
  write(line: string) {
    if (captures.size) for (const lines of captures) lines.push(line);
    else process.stdout.write(line);
  },
};

/** JSON logger that redacts phone numbers and tokens and rounds coordinates. */
export function createLogger(opts: { name: string; level?: LogLevel }): Logger {
  return pino(
    { name: opts.name, level: opts.level ?? 'info', hooks: { streamWrite: (line) => `${JSON.stringify(JSON.parse(line, redact))}\n` } },
    sink,
  );
}

export interface LogCapture {
  readonly records: Record<string, unknown>[];
  /** All captured output as one string, for pattern assertions (e.g. no +964 numbers). */
  text(): string;
  stop(): void;
}

// ── ErrorReporter ──────────────────────────────────────────────────────────

export interface ErrorReporter {
  readonly kind: string;
  captureException(err: unknown, context?: Record<string, unknown>): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error', context?: Record<string, unknown>): void;
  setUser(user: { id: string; locale?: string } | null): void;
}

/** No-op reporter — safe default for dev / test. */
export function noopReporter(): ErrorReporter {
  return {
    kind: 'noop',
    captureException: () => undefined,
    captureMessage: () => undefined,
    setUser: () => undefined,
  };
}

/** Log-based reporter — forwards to a Logger instance; useful in staging. */
export function logReporter(logger: Logger): ErrorReporter {
  return {
    kind: 'log',
    captureException(err, context) {
      logger.error({ err, ...context }, err instanceof Error ? err.message : String(err));
    },
    captureMessage(message, level = 'error', context) {
      const fn = level === 'info' ? logger.info : level === 'warning' ? logger.warn : logger.error;
      fn({ ...context }, message);
    },
    setUser(_user) {
      // no persistent user binding in log reporter
    },
  };
}

// ── LogCapture ─────────────────────────────────────────────────────────────

/** Captures everything every logger writes until stop(); for tests. Captured lines are not echoed to stdout. */
export function captureLogs(): LogCapture {
  const lines: string[] = [];
  captures.add(lines);
  return {
    get records() {
      return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    },
    text: () => lines.join(''),
    stop: () => void captures.delete(lines),
  };
}
