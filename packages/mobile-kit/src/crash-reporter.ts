/**
 * Crash reporter — mock implementation for dev, real adapter plug-in for production.
 *
 * In development (or when no real reporter is configured) all crashes are
 * logged to the console so they don't silently swallow errors.
 *
 * The interface matches @iraq-maps/observability's ErrorReporter so it can
 * be passed directly to ErrorBoundary.
 *
 * Usage:
 *   import { crashReporter } from '@iraq-maps/mobile-kit';
 *   // In app root:
 *   crashReporter.init();
 *   // In error boundaries:
 *   crashReporter.captureException(error, { componentStack });
 */
import type { ErrorReporter } from '@iraq-maps/observability';

/** Severity level for manual breadcrumb events. */
export type CrashSeverity = 'info' | 'warning' | 'error';

interface CrashReporterInstance extends ErrorReporter {
  /** Call once at app startup to attach the global unhandled-rejection handler. */
  init(): void;
  /** Record a non-fatal breadcrumb event. */
  breadcrumb(message: string, severity?: CrashSeverity): void;
}

function makeConsoleCrashReporter(): CrashReporterInstance {
  return {
    kind: 'console',

    init() {
      // Attach to the global unhandledrejection event in dev/web mode.
      if (typeof globalThis !== 'undefined' && 'addEventListener' in globalThis) {
        (globalThis as typeof globalThis & { addEventListener: (t: string, h: (e: { reason: unknown }) => void) => void })
          .addEventListener('unhandledrejection', (e) => {
            console.error('[CrashReporter] Unhandled promise rejection:', e.reason);
          });
      }
    },

    captureException(error: unknown, context?: Record<string, unknown>) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[CrashReporter] Exception captured:', msg, context ?? '');
    },

    captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>) {
      const fn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
      fn('[CrashReporter]', message, context ?? '');
    },

    setUser(user: { id: string; locale?: string } | null) {
      console.info('[CrashReporter] setUser:', user);
    },

    breadcrumb(message: string, severity: CrashSeverity = 'info') {
      const fn = severity === 'error' ? console.error : severity === 'warning' ? console.warn : console.info;
      fn(`[CrashReporter] ${message}`);
    },
  };
}

/**
 * Singleton crash reporter. Replace with a real Sentry/Bugsnag adapter by
 * setting the EXPO_PUBLIC_CRASH_REPORTER env var (handled in the adapter layer).
 * For now this always uses the console reporter, which is the correct behaviour
 * for dev and for the mock CI environment.
 */
export const crashReporter: CrashReporterInstance = makeConsoleCrashReporter();
