import { t } from '@iraq-maps/i18n';
import { Banner, Button } from '@iraq-maps/ui';
import { useEffect, useEffectEvent, useState, type ReactElement } from 'react';
import { t as mapT } from './strings';

type Loaded<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed'; message: string };

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** The 200 body of a ts-rest response; any other status throws for useLatest to show. */
export function ok<R extends { status: number; body: unknown }>(res: R): Extract<R, { status: 200 }>['body'] {
  if (res.status !== 200) throw new HttpError(res.status);
  return res.body;
}

const messageFor = (err: unknown): string => {
  // fetch rejects with a TypeError when the server cannot be reached (offline).
  if (err instanceof TypeError) return t('common:errors.network');
  if (err instanceof HttpError && err.status === 404) return mapT('place.notFound');
  if (err instanceof HttpError && err.status === 429) return t('common:errors.rateLimited');
  return t('common:errors.generic');
};

/**
 * Loads `key` with `load` after `delayMs`, and again on `retry()`. A new key, or unmounting, aborts the run in flight
 * (its signal) and drops its answer, so a slow answer for an old key never replaces a newer one. A null key loads nothing.
 */
export function useLatest<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, delayMs = 0) {
  const [state, setState] = useState<Loaded<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const run = useEffectEvent(load);
  useEffect(() => {
    if (key === null) return setState(null);
    const controller = new AbortController();
    const settle = (next: Loaded<T>) => {
      if (!controller.signal.aborted) setState(next);
    };
    const timer = setTimeout(() => {
      setState({ status: 'loading' });
      run(controller.signal).then(
        (data) => settle({ status: 'ready', data }),
        (err: unknown) => settle({ status: 'failed', message: messageFor(err) }),
      );
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt, delayMs]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

/** The loading banner, or the error banner with a retry button; nothing once loaded. */
export function LoadStatus({ state, retry }: ReturnType<typeof useLatest>): ReactElement | null {
  if (state?.status === 'loading') return <Banner kind="info" message={t('common:status.loading')} />;
  if (state?.status !== 'failed') return null;
  return (
    <>
      <Banner kind="error" message={state.message} />
      <Button variant="secondary" label={t('common:actions.retry')} onPress={retry} />
    </>
  );
}
