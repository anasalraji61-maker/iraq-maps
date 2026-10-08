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
