import type { PlaceSummary } from '@iraq-maps/contracts';
import { formatNumber, registerNamespace, t as translate } from '@iraq-maps/i18n';
import ar from './i18n/ar.json';
import ckb from './i18n/ckb.json';
import en from './i18n/en.json';

registerNamespace('map', { ar, ckb, en });

type Paths<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}` }[keyof T & string];

/** i18n `t` bound to the `map` namespace (named `t` for the no-literal-string rule); keys are checked against the Arabic catalog. */
export const t = (key: Paths<typeof ar>, params?: Record<string, string | number>): string => translate(`map:${key}`, params);

/** First-strong isolate (FSI…PDI): a query, phone number, URL or OSM hours value keeps its own direction inside RTL text. */
export const isolate = (text: string): string => `\u2068${text}\u2069`;

/** Metres below 1 km, else kilometres with one decimal, in the app locale's digits (Arabic-Indic for ar and ckb). */
export const formatDistance = (metres: number): string =>
  metres < 1000
    ? t('distance.m', { n: formatNumber(Math.round(metres)) })
    : t('distance.km', { n: formatNumber(metres / 1000, { maximumFractionDigits: 1 }) });

/** The category of a POI, or the kind of a street or area. */
export function kindLabel({ kind, category }: Pick<PlaceSummary, 'kind' | 'category'>): string | undefined {
  if (category) return t(`categories.${category}`);
  return kind === 'place' ? undefined : t(`kinds.${kind}`);
}
