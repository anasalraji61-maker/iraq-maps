import { randomUUID } from 'node:crypto';

/**
 * Lightweight request-ID propagation using Node.js AsyncLocalStorage.
 *
 * Usage (in app.ts / middleware):
 *   TraceContext.run(requestId, () => handler(req, res));
 *
 * Usage (anywhere in the call stack):
 *   const { requestId, traceId } = TraceContext.current() ?? {};
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TraceData {
  /** Per-request ID, propagated from the X-Request-Id header or generated fresh. */
  requestId: string;
  /** Optional distributed trace ID from upstream (e.g. X-Cloud-Trace-Context). */
  traceId?: string;
  /** Route pattern, set by the Nest handler. */
  route?: string;
  /** Authenticated user ID, set after auth completes. */
  userId?: string;
}

const storage = new AsyncLocalStorage<TraceData>();

export const TraceContext = {
  /**
   * Runs `fn` with the given trace data bound to the current async context.
   * All async work spawned inside `fn` (awaits, callbacks, timers) inherits the context.
   */
  run<T>(data: TraceData, fn: () => T): T {
    return storage.run(data, fn);
  },

  /**
   * Returns the trace data for the current request, or `null` outside a request context.
   */
  current(): TraceData | null {
    return storage.getStore() ?? null;
  },

  /**
   * Returns the requestId for the current request, or generates a fresh one.
   * Useful when you need an ID but cannot guarantee you're inside a request context.
   */
  requestId(): string {
    return storage.getStore()?.requestId ?? randomUUID();
  },

  /**
   * Mutates the current context to set the authenticated user ID.
   * Call this after the auth guard resolves the user.
   */
  setUserId(userId: string): void {
    const store = storage.getStore();
    if (store) store.userId = userId;
  },

  /**
   * Mutates the current context to set the matched route pattern.
   */
  setRoute(route: string): void {
    const store = storage.getStore();
    if (store) store.route = route;
  },

  /**
   * Creates a new TraceData from an HTTP request's headers.
   * Reads X-Request-Id and X-Cloud-Trace-Context; generates a fresh UUID when absent.
   */
  fromHeaders(headers: Record<string, string | string[] | undefined>): TraceData {
    const requestId =
      (typeof headers['x-request-id'] === 'string' ? headers['x-request-id'] : null) ?? randomUUID();
    const traceId =
      typeof headers['x-cloud-trace-context'] === 'string'
        ? headers['x-cloud-trace-context'].split('/')[0]
        : typeof headers['x-trace-id'] === 'string'
          ? headers['x-trace-id']
          : undefined;
    return { requestId, traceId };
  },
} as const;
