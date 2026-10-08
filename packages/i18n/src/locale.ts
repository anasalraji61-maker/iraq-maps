import type { Locale } from '@iraq-maps/contracts';

let current: Locale = 'ar';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  for (const listener of [...listeners]) listener(locale);
}

export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isRtl(locale: Locale): boolean {
  return locale !== 'en';
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const formatters: Partial<Record<Locale, Intl.NumberFormat>> = {};

/** ar and ckb use Arabic-Indic digits as written in Iraq; en uses Latin digits. */
export function formatNumber(value: number, locale: Locale = current): string {
  // Recent CLDR defaults plain `ar` to Latin digits, so the numbering system is explicit.
  // The digit pass covers engines (Hermes builds) that ignore the -u-nu extension or lack ckb data.
  const formatter = (formatters[locale] ??= new Intl.NumberFormat(locale === 'en' ? 'en' : `${locale}-IQ-u-nu-arab`));
  const text = formatter.format(value);
  return locale === 'en' ? text : text.replace(/[0-9]/g, (digit) => ARABIC_INDIC.charAt(Number(digit)));
}
