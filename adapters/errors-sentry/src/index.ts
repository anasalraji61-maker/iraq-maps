import { createLogger, logReporter, type ErrorReporter, type Logger } from '@iraq-maps/observability';

export interface SentryReporterOptions {
  /** App environment tag sent to Sentry (default: process.env.NODE_ENV) */
  environment?: string;
  /** Release / version tag sent to Sentry */
  release?: string;
  /** Logger used as fallback when @sentry/node is not installed */
  fallbackLogger?: Logger;
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
  let Sentry: typeof import('@sentry/node') | undefined;

  try {
    Sentry = await import('@sentry/node');
  } catch {
    const logger = opts.fallbackLogger ?? createLogger({ name: 'sentry-adapter', level: 'warn' });
    logger.warn(
      {},
      '@sentry/node is not installed — error reporting falling back to log-based reporter. ' +
        'Add @sentry/node as a dependency to enable Sentry.',
    );
    return logReporter(logger);
  }

  Sentry.init({
    dsn,
    environment: opts.environment ?? process.env['NODE_ENV'],
    release: opts.release,
  });

  let currentUser: { id: string; locale?: string } | null = null;

  return {
    kind: 'sentry',

    captureException(err, context) {
      Sentry!.withScope((scope) => {
        if (currentUser) scope.setUser({ id: currentUser.id });
        if (context) scope.setExtras(context);
        Sentry!.captureException(err);
      });
    },

    captureMessage(message, level = 'error', context) {
      Sentry!.withScope((scope) => {
        if (currentUser) scope.setUser({ id: currentUser.id });
        if (context) scope.setExtras(context);
        Sentry!.captureMessage(
          message,
          level === 'warning' ? 'warning' : level,
        );
      });
    },

    setUser(user) {
      currentUser = user;
      Sentry!.setUser(user ? { id: user.id } : null);
    },
  };
}
