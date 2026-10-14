import { createLogger, logReporter, type ErrorReporter, type Logger } from '@iraq-maps/observability';

export interface SentryReporterOptions {
  /** App environment tag sent to Sentry (default: process.env.NODE_ENV) */
  environment?: string;
  /** Release / version tag sent to Sentry */
  release?: string;
  /** Logger used as fallback when @sentry/node is not installed */
  fallbackLogger?: Logger;
}

// Minimal shape we call on @sentry/node — avoids depending on its types.
interface SentryLike {
  init(opts: { dsn: string; environment?: string; release?: string }): void;
  setUser(user: { id: string } | null): void;
  captureException(err: unknown): void;
  captureMessage(msg: string, level: string): void;
  withScope(cb: (scope: ScopeLike) => void): void;
}
interface ScopeLike {
  setUser(u: { id: string } | null): void;
  setExtras(e: Record<string, unknown>): void;
}

/**
 * Creates an ErrorReporter backed by Sentry.
 *
 * @sentry/node is an optional peer dependency. If it is not installed at
 * runtime, this factory emits a single warning and returns a log-based
 * reporter so the app keeps running.
 *
 * @param dsn    Sentry DSN (read from env — never hard-code)
 * @param opts   Optional tuning
 */
export async function createSentryReporter(
  dsn: string,
  opts: SentryReporterOptions = {},
): Promise<ErrorReporter> {
  let sentry: SentryLike | undefined;

  try {
    // Dynamic import so @sentry/node stays optional.
    const mod = await import('@sentry/node' as string) as unknown;
    sentry = mod as SentryLike;
  } catch {
    const logger = opts.fallbackLogger ?? createLogger({ name: 'sentry-adapter', level: 'warn' });
    logger.warn(
      {},
      '@sentry/node is not installed — error reporting falling back to log-based reporter. ' +
        'Add @sentry/node as a dependency to enable Sentry.',
    );
    return logReporter(logger);
  }

  sentry.init({
    dsn,
    environment: opts.environment ?? process.env['NODE_ENV'],
    release: opts.release,
  });

  let currentUser: { id: string; locale?: string } | null = null;

  return {
    kind: 'sentry',

    captureException(err, context) {
      sentry!.withScope((scope) => {
        if (currentUser) scope.setUser({ id: currentUser.id });
        if (context) scope.setExtras(context);
        sentry!.captureException(err);
      });
    },

    captureMessage(message, level = 'error', context) {
      sentry!.withScope((scope) => {
        if (currentUser) scope.setUser({ id: currentUser.id });
        if (context) scope.setExtras(context);
        sentry!.captureMessage(message, level === 'warning' ? 'warning' : level);
      });
    },

    setUser(user) {
      currentUser = user;
      sentry!.setUser(user ? { id: user.id } : null);
    },
  };
}
