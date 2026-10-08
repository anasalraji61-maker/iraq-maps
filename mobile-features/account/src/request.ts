import { useState } from 'react';
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

const messageFor = (err: unknown): string => {
  if (err instanceof ProblemError) return err.code && isKnownError(err.code) ? t(`errors.${err.code}`) : t('errors.generic');
  // fetch rejects with a TypeError when the server cannot be reached.
  return err instanceof TypeError ? t('errors.network') : t('errors.generic');
};

/** One request at a time per screen: `busy` while it runs, and a localized `error` when it fails. */
export function useRequest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
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
