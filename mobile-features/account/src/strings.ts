import { registerNamespace, t as translate } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

registerNamespace('account', { ar, ckb, en });

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
type Key = Leaves<typeof ar>;

/** i18n `t` bound to the `account` namespace (named `t` so the no-literal-string rule recognizes it); keys are checked against the Arabic catalog at compile time. */
export const t = (key: Key, params?: Record<string, string | number>): string => translate(`account:${key}`, params);

/** True when `code` (a server Problem code) has its own message under `errors`. */
export const isKnownError = (code: string): code is keyof typeof ar.errors => Object.hasOwn(ar.errors, code);
