import { t as translate } from '@iraq-maps/i18n';
import { expectStatus, ProblemError, useRequest as useRequestBase } from '@iraq-maps/mobile-kit';
import { isKnownError, t } from './strings';

export { expectStatus };

/** Maps account-specific error codes to localized strings. */
const messageFor = (err: unknown): string => {
  if (err instanceof ProblemError && err.code && isKnownError(err.code)) return t(`errors.${err.code}`);
  if (err instanceof ProblemError && err.code === 'unauthorized') return translate('common:errors.sessionExpired');
  return translate(err instanceof TypeError ? 'common:errors.network' : 'common:errors.generic');
};

/** One request at a time per screen, with account-specific error messages. */
export function useRequest() {
  return useRequestBase(messageFor);
}
