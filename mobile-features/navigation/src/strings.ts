import { NestedPaths, registerNamespace, t as translate } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

registerNamespace('navigation', { ar, ckb, en });

/** i18n `t` bound to the `navigation` namespace; keys are checked against the Arabic catalog. */
export const t = (key: NestedPaths<typeof ar>, params?: Record<string, string | number>): string =>
  translate(`navigation:${key}`, params);
