import type { Locale } from '@iraq-maps/contracts';
import ar from './locales/ar.json';
import ckb from './locales/ckb.json';
import en from './locales/en.json';

/** @public the shared Arabic/Kurdish search normalizer (M1 search) */
export { normalizeArabic, toAsciiDigits } from './normalize';

export type Messages = { [key: string]: string | Messages };

const RTL: Record<Locale, boolean> = { ar: true, ckb: true, en: false };
const LOCALES = Object.keys(RTL) as Locale[];
// Explicit `nu-arab`: CLDR's bare `ar` now defaults to Latin digits; Iraq uses Arabic-Indic ones.
const INTL_TAG: Record<Locale, string> = { ar: 'ar-IQ-u-nu-arab', ckb: 'ckb-IQ-u-nu-arab', en: 'en' };

const namespaces = new Map<string, Record<Locale, Messages>>();
const listeners = new Set<(locale: Locale) => void>();
let current: Locale = 'ar';

/** Leaf keys with their `{param}` names, e.g. `otp.resend{seconds}`. Empty strings count as missing. */
function signatures(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix + key;
    if (typeof value !== 'string') return signatures(value, `${path}.`);
    if (!value.trim()) return [];
    const params = [...new Set(value.match(/\{\w+\}/g))].sort().join('');
    return [path + params];
  });
}

/** Throws unless ar, ckb and en have the same keys and the same `{param}` placeholders per key. */
export function assertKeyParity(ns: string, resources: Record<Locale, Messages>): void {
  const byLocale = LOCALES.map((locale) => [locale, new Set(signatures(resources[locale] ?? {}))] as const);
  const all = new Set(byLocale.flatMap(([, keys]) => [...keys]));
  const problems = byLocale.flatMap(([locale, keys]) => {
    const missing = [...all].filter((key) => !keys.has(key));
    return missing.length ? [`${locale} lacks ${missing.join(', ')}`] : [];
  });
  if (problems.length) throw new Error(`i18n namespace "${ns}": ${problems.join('; ')}`);
}

/** Each feature registers its own namespace with all three locales (keys must match). */
export function registerNamespace(ns: string, resources: Record<Locale, Messages>): void {
  assertKeyParity(ns, resources);
  namespaces.set(ns, resources);
}

/** `t('account:phone.title', { n: 3 })`. An unknown key returns the key itself. */
export function t(key: `${string}:${string}`, params?: Record<string, string | number>): string {
  const sep = key.indexOf(':');
  let node: string | Messages | undefined = namespaces.get(key.slice(0, sep))?.[current];
  for (const part of key.slice(sep + 1).split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') return key;
  return params ? node.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : node;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  for (const listener of listeners) listener(locale);
}

export function getLocale(): Locale {
  return current;
}

export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isRtl(locale: Locale): boolean {
  return RTL[locale];
}

/** Formats with the current locale: Arabic-Indic digits for ar and ckb, Latin for en. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_TAG[current], options).format(value);
}

registerNamespace('common', { ar, ckb, en });
