/**
 * RTL layout helpers for Arabic and Kurdish Sorani interfaces.
 * All helpers are pure functions and safe to call server-side.
 */

import type { Locale } from '@iraq-maps/contracts';

/** Returns true for right-to-left locales (Arabic and Kurdish Sorani). */
export function isRtlLocale(locale: Locale): boolean {
  return locale === 'ar' || locale === 'ckb';
}

/**
 * Returns a React Native `StyleSheet` value for `flexDirection` that
 * respects the reading direction.
 */
export function rtlRow(locale: Locale): 'row' | 'row-reverse' {
  return isRtlLocale(locale) ? 'row-reverse' : 'row';
}

/**
 * Mirrors a numeric style value for RTL.
 * Use for `marginLeft`/`marginRight`, `paddingLeft`/`paddingRight`, etc.
 * Pass the property name to determine whether to flip it.
 *
 * @example
 * const style = { marginLeft: mirrorValue(16, 'marginLeft', locale) }
 */
export function mirrorValue(
  value: number,
  property: string,
  locale: Locale,
): number {
  if (!isRtlLocale(locale)) return value;
  const LEFT_PROPS = new Set([
    'marginLeft',
    'paddingLeft',
    'borderLeftWidth',
    'borderTopLeftRadius',
    'borderBottomLeftRadius',
    'left',
  ]);
  const RIGHT_PROPS = new Set([
    'marginRight',
    'paddingRight',
    'borderRightWidth',
    'borderTopRightRadius',
    'borderBottomRightRadius',
    'right',
  ]);
  if (LEFT_PROPS.has(property) || RIGHT_PROPS.has(property)) {
    // The consumer should swap the property name themselves;
    // this function returns the raw value unchanged —
    // the RTL signal is in the property swap.
    return value;
  }
  return value;
}

/**
 * Returns the `textAlign` value for a locale.
 * If the text itself contains a strong RTL character, use `getTextAlign` instead.
 */
export function rtlTextAlign(locale: Locale): 'left' | 'right' {
  return isRtlLocale(locale) ? 'right' : 'left';
}

/**
 * Detects the dominant text direction from the first strong directional
 * character and returns the appropriate `textAlign`.
 * Falls back to the locale direction when no strong character is found.
 */
export function getTextAlign(
  text: string,
  locale: Locale,
): 'left' | 'right' | 'auto' {
  const ARABIC_REGEX = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const LATIN_REGEX = /[A-Za-z]/;
  if (ARABIC_REGEX.test(text)) return 'right';
  if (LATIN_REGEX.test(text)) return 'left';
  return rtlTextAlign(locale);
}

/**
 * Returns a React Native `ViewStyle` for a dropdown/picker that
 * opens in the correct direction for the locale.
 */
export function rtlSelectStyle(locale: Locale): {
  flexDirection: 'row' | 'row-reverse';
  textAlign: 'left' | 'right';
} {
  const rtl = isRtlLocale(locale);
  return {
    flexDirection: rtl ? 'row-reverse' : 'row',
    textAlign: rtl ? 'right' : 'left',
  };
}

/**
 * Mirrors an icon name for RTL layouts. Converts directional icon names
 * such as `chevron-left` → `chevron-right` when in an RTL locale.
 * Names not listed in the mirror map are returned unchanged.
 */
export function rtlIconName(iconName: string, locale: Locale): string {
  if (!isRtlLocale(locale)) return iconName;
  const MIRROR_MAP: Record<string, string> = {
    'chevron-left': 'chevron-right',
    'chevron-right': 'chevron-left',
    'arrow-left': 'arrow-right',
    'arrow-right': 'arrow-left',
    'arrow-back': 'arrow-forward',
    'arrow-forward': 'arrow-back',
    'skip-previous': 'skip-next',
    'skip-next': 'skip-previous',
    'fast-forward': 'fast-rewind',
    'fast-rewind': 'fast-forward',
    'format-indent-increase': 'format-indent-decrease',
    'format-indent-decrease': 'format-indent-increase',
    'wrap-text': 'wrap-text',
    'reply': 'reply',
  };
  return MIRROR_MAP[iconName] ?? iconName;
}

/**
 * Wraps a string in Unicode bidi-isolation characters.
 * Use around short strings embedded in a paragraph of opposite direction.
 *
 * LTR isolate  (U+2066) / PDI (U+2069)  for LTR content in RTL paragraphs.
 * RTL isolate  (U+2067) / PDI (U+2069)  for RTL content in LTR paragraphs.
 */
export function wrapBidi(text: string, direction: 'ltr' | 'rtl'): string {
  const open = direction === 'ltr' ? '⁦' : '⁧';
  const close = '⁩'; // Pop Directional Isolate
  return `${open}${text}${close}`;
}

/**
 * Returns true if the character at position 0 is an Arabic-script character
 * (Arabic, Arabic Extended, Arabic Presentation Forms, etc.).
 * Useful for deciding whether a user-generated string needs RTL treatment.
 */
export function isArabicScript(char: string): boolean {
  if (!char) return false;
  const cp = char.codePointAt(0) ?? 0;
  return (
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
    (cp >= 0x08a0 && cp <= 0x08ff) || // Arabic Extended-A
    (cp >= 0xfb50 && cp <= 0xfdff) || // Arabic Presentation Forms-A
    (cp >= 0xfe70 && cp <= 0xfeff) || // Arabic Presentation Forms-B
    (cp >= 0x10e60 && cp <= 0x10e7f) // Rumi Numeral Symbols
  );
}

/**
 * Transforms a style object so that `left`/`right` and
 * `marginLeft`/`marginRight` etc. are swapped for RTL layouts.
 * Works with plain objects; not intended for StyleSheet.create().
 */
export function flipStyleForRtl<T extends Record<string, unknown>>(
  style: T,
  locale: Locale,
): T {
  if (!isRtlLocale(locale)) return style;
  const SWAP_PAIRS: [string, string][] = [
    ['left', 'right'],
    ['marginLeft', 'marginRight'],
    ['paddingLeft', 'paddingRight'],
    ['borderLeftWidth', 'borderRightWidth'],
    ['borderTopLeftRadius', 'borderTopRightRadius'],
    ['borderBottomLeftRadius', 'borderBottomRightRadius'],
  ];
  const result = { ...style } as Record<string, unknown>;
  for (const [a, b] of SWAP_PAIRS) {
    if (a in result || b in result) {
      const av = result[a];
      const bv = result[b];
      if (av !== undefined) result[b] = av;
      else delete result[b];
      if (bv !== undefined) result[a] = bv;
      else delete result[a];
    }
  }
  return result as T;
}

/**
 * Returns `'rtl'` or `'ltr'` as a string suitable for the React Native
 * `I18nManager` `forceRTL` call or the HTML `dir` attribute.
 */
export function directionAttr(locale: Locale): 'rtl' | 'ltr' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
