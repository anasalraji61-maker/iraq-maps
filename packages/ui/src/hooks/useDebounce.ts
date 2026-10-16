/**
 * useDebounce — debounced value hook.
 *
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * of inactivity. Cancels any pending update on unmount.
 *
 * Usage:
 *   const debouncedQuery = useDebounce(query, 300);
 *
 * Also exports useDebounceCallback for debouncing function calls.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounce a value: the returned value only updates after `delay` ms
 * without a new value arriving.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

/**
 * Debounce a callback: returns a stable function that, when called,
 * defers execution until `delay` ms have passed without another call.
 * The deferred invocation receives the latest arguments.
 */
export function useDebounceCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay = 300,
): (...args: Args) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback(
    (...args: Args) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  );
}

/**
 * Returns `true` while the value is still "settling" (within the debounce window).
 * Useful for showing a loading indicator during a search-as-you-type field.
 */
export function useIsDebouncing(value: unknown, delay = 300): boolean {
  const debounced = useDebounce(value, delay);
  return debounced !== value;
}
