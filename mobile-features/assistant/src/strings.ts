import { registerNamespace, t as translate } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

registerNamespace('assistant', { ar, ckb, en });

type Paths<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}` }[keyof T & string];

export const t = (key: Paths<typeof ar>, params?: Record<string, string | number>): string =>
  translate(`assistant:${key}`, params);
