import type { Locale } from '@iraq-maps/contracts';

export type Messages = { [key: string]: string | Messages };

/** Each feature registers its own namespace with all three locales (keys must match). */
export function registerNamespace(_ns: string, _resources: Record<Locale, Messages>): void {
  throw new Error('not implemented');
}

/** `t('account:phone.title', { n: 3 })` */
export function t(_key: `${string}:${string}`, _params?: Record<string, string | number>): string {
  throw new Error('not implemented');
}

export function setLocale(_locale: Locale): void {
  throw new Error('not implemented');
}

export function getLocale(): Locale {
  throw new Error('not implemented');
}

export function onLocaleChange(_listener: (locale: Locale) => void): () => void {
  throw new Error('not implemented');
}

export function isRtl(_locale: Locale): boolean {
  throw new Error('not implemented');
}

/** Shared Arabic/Kurdish search normalizer (server import + search, client search). */
export function normalizeArabic(_text: string): string {
  throw new Error('not implemented');
}
