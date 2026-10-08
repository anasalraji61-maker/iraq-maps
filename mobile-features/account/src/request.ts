import { t as translate } from '@iraq-maps/i18n';
import { useEffect, useState } from 'react';
import { isKnownError, t } from './strings';

class ProblemError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? 'problem');
  }
}

/** Narrows a ts-rest response to `status` and returns its body, or throws its Problem `code` for useRequest to show. */
export function expectStatus<R extends { status: number; body: unknown }, S extends R['status']>(res: R, status: S): Extract<R, { status: S }>['body'] {
  if (res.status !== status) throw new ProblemError((res.body as { code?: string } | null | undefined)?.code);
  return res.body;
}

/** OTP codes have account-specific messages; the session, network and fallback messages are shared (`common:errors`). */
const messageFor = (err: unknown): string => {
  if (err instanceof ProblemError && err.code && isKnownError(err.code)) return t(`errors.${err.code}`);
  if (err instanceof ProblemError && err.code === 'unauthorized') return translate('common:errors.sessionExpired');
  // fetch rejects with a TypeError when the server cannot be reached.
  return translate(err instanceof TypeError ? 'common:errors.network' : 'common:errors.generic');
};

/** One request at a time per screen: `busy` while it runs, and a localized `error` when it fails. */
export function useRequest() {
  const [busy, setBusy] = useState(false);
  const [error, setShownError] = useState<string>();
  // setError clears the shown error and commits before showing the new one, so a repeated message (the same
  // validation error twice) changes the field again and the screen reader announces it again.
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
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setShownError(undefined);
    try {
      await task();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
