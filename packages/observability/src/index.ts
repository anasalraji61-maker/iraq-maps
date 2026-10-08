export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFn = (objOrMsg: Record<string, unknown> | string, msg?: string) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

/** JSON logger that redacts phone numbers and tokens and rounds coordinates. */
export function createLogger(_opts: { name: string; level?: LogLevel }): Logger {
  throw new Error('not implemented');
}

export interface LogCapture {
  readonly records: Record<string, unknown>[];
  /** All captured output as one string, for pattern assertions (e.g. no +964 numbers). */
  text(): string;
  stop(): void;
}

/** Captures everything every logger writes until stop(); for tests. */
export function captureLogs(): LogCapture {
  throw new Error('not implemented');
}
