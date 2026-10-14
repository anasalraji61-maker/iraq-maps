import { t as translate } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
type Key = Leaves<typeof ar>;

/** i18n `t` bound to the `shell` namespace; keys are checked against the Arabic catalog at compile time. */
export const t = (key: Key, params?: Record<string, string | number>): string => translate(`shell:${key}`, params);
