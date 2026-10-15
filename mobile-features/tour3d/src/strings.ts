import { NestedPaths, registerNamespace, t as translate } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

registerNamespace('tour3d', { ar, ckb, en });

export const t = (key: NestedPaths<typeof ar>, params?: Record<string, string | number>): string =>
  translate(`tour3d:${key}`, params);
