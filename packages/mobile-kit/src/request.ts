import { t as translate } from '@iraq-maps/i18n';
import { useEffect, useState } from 'react';

export class ProblemError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? 'problem');
  }
}

/** Narrows a ts-rest response to `status` and returns its body, or throws its Problem `code`. */
export function expectStatus<R extends { status: number; body: unknown }, S extends R['status']>(
  res: R,
  status: S,
): Extract<R, { status: S }>['body'] {
  if (res.status !== status) throw new ProblemError((res.body as { code?: string } | null | undefined)?.code);
  return (res as Extract<R, { status: S }>).body;
}

const defaultMessageFor = (err: unknown): string => {
  if (err instanceof ProblemError && err.code === 'unauthorized') {
    return translate('common:errors.sessionExpired');
  }
  return translate(err instanceof TypeError ? 'common:errors.network' : 'common:errors.generic');
};

/**
 * One request at a time per screen: `busy` while it runs, and a localized `error` when it fails.
 * Pass `messageFor` to customise how ProblemError codes are mapped to user-visible strings.
 */
export function useRequest(messageFor?: (err: unknown) => string) {
  const [busy, setBusy] = useState(false);
  const [error, setShownError] = useState<string>();
  // Clear and re-set so a repeated identical message still triggers a re-render,
  // allowing screen readers to announce the same error again.
  const [next, setNext] = useState<string>();
  useEffect(() => {
    if (next === undefined) return;
    setShownError(next);
    setNext(undefined);
  }, [next]);
  const setError = (message: string) => {
    setShownError(undefined);
    setNext(message);
  };
  const resolve = messageFor ?? defaultMessageFor;
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setShownError(undefined);
    try {
      await task();
    } catch (err) {
      setError(resolve(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
