/**
 * useThrottle — throttled value and callback hooks.
 *
 * useThrottle(value, limit): Returns a value that updates at most once every
 * `limit` ms. Leading-edge by default (first call fires immediately).
 *
 * useThrottleCallback(fn, limit): Returns a stable throttled function.
 *
 * useThrottleTrailing(value, limit): Trailing-edge throttle — value updates
 * only after `limit` ms of quiet (like debounce but with guaranteed periodic
 * updates when changes keep arriving).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Leading-edge throttle ─────────────────────────────────────────────────────

/**
 * Leading-edge throttle: the returned value updates immediately on the first
 * change, then at most once per `limit` ms thereafter.
 */
export function useThrottle<T>(value: T, limit = 200): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastRun = useRef(Date.now());
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    const remaining = limit - (now - lastRun.current);

    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
    }

    if (remaining <= 0) {
      lastRun.current = now;
      setThrottled(value);
    } else {
      pending.current = setTimeout(() => {
        lastRun.current = Date.now();
        setThrottled(value);
      }, remaining);
    }

    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, [value, limit]);

  return throttled;
}

// ── Throttled callback ────────────────────────────────────────────────────────

/**
 * Leading-edge throttled callback. Fires immediately, then ignores calls for
 * `limit` ms. The last call within the quiet window fires after it ends.
 */
export function useThrottleCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  limit = 200,
): (...args: Args) => void {
  const lastRun = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);

  return useCallback(
    (...args: Args) => {
      const now = Date.now();
      const remaining = limit - (now - lastRun.current);

      if (pending.current) {
        clearTimeout(pending.current);
        pending.current = null;
      }

      if (remaining <= 0) {
        lastRun.current = now;
        fnRef.current(...args);
      } else {
        pending.current = setTimeout(() => {
          lastRun.current = Date.now();
          fnRef.current(...args);
        }, remaining);
      }
    },
    [limit],
  );
}

// ── Trailing-edge throttle ────────────────────────────────────────────────────

/**
 * Trailing-edge throttle: value updates only after `limit` ms of no new changes,
 * but also fires a guaranteed update every `limit` ms while changes keep arriving.
 */
export function useThrottleTrailing<T>(value: T, limit = 200): T {
  const [throttled, setThrottled] = useState<T>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFired = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastFired.current;

    if (timer.current) clearTimeout(timer.current);

    if (elapsed >= limit) {
      lastFired.current = now;
      setThrottled(value);
    } else {
      timer.current = setTimeout(() => {
        lastFired.current = Date.now();
        setThrottled(value);
      }, limit - elapsed);
    }

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, limit]);

  return throttled;
}
