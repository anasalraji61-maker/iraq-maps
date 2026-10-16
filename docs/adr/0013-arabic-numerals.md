# ADR-0013: Arabic-Indic Numerals for IQD Prices

**Status:** Accepted  
**Date:** 2026-10-16  
**Author:** i18n team  
**Milestone:** M0 (foundational)

---

## Context

### Two Numeral Systems in Arabic

The Arabic script uses two coexisting numeral systems:

1. **Arabic-Indic (Eastern Arabic) numerals:** ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩  
   Used in the Arabic-speaking world (Iraq, Egypt, Gulf states, Levant) for prices, currency, commercial contexts, and everyday counting in formal Arabic text.

2. **Western Arabic (Hindu-Arabic) numerals:** 0 1 2 3 4 5 6 7 8 9  
   The international standard; used widely in technical, scientific, and digital contexts across the Arab world.

Both are understood by all Arabic-speaking users. However, they carry different register and context associations.

### Context in Iraq

Iraqi Arabic speakers expect:

- **Prices and monetary amounts** displayed in Arabic-Indic numerals: «١٥٬٠٠٠ دينار» feels natural for a price tag.
- **Technical / directional values** in Western numerals: a GPS coordinate of `33.3152` in Arabic-Indic would look unusual and harder to read.
- **Dates and clock times** in Western numerals: `16/10/2026` is the norm in Iraqi digital contexts.
- **Phone numbers** in Western numerals: `07701234567` is the standard format.
- **Map zoom levels and tile coordinates** in Western numerals.

Kurdish Sorani uses the same Arabic-Indic numerals for prices and counts.

### Previous Behaviour

Before this decision, the prototype used Western numerals everywhere. Arabic-speaking test users specifically called out that prices looked «like a technical system» and felt less natural than a marketplace should. The feedback was: «الأرقام يجب أن تكون عربية».

---

## Decision

**Use Arabic-Indic numerals for prices and user-facing counts in the Arabic and Kurdish Sorani locales. Use Western numerals for all technical values.**

### Numeral Assignment Table

| Context | Locale `ar` / `ckb` | Locale `en` | Implementation |
|---------|---------------------|-------------|----------------|
| IQD price: 15,000 | ١٥٬٠٠٠ دينار | 15,000 IQD | `i18n.formatPrice(15000, 'IQD')` |
| USD price: $12.50 | ١٢٫٥٠ دولار | $12.50 | `i18n.formatPrice(1250, 'USD')` |
| Rating: 4.3 | 4.3 ★ | 4.3 ★ | Western — technical, universal |
| Distance (navigation): 450 m | 450 م | 450 m | Western — directional/technical |
| Distance (place card): 320 m | 320 م | 320 m | Western — technical, near-GPS |
| Review count: 47 | ٤٧ تقييم | 47 reviews | `i18n.formatCount(47)` |
| Like count: 1,200 | ١٬٢٠٠ | 1,200 | `i18n.formatCount(1200)` |
| Price level: ١–٤ dots | ١ / ٢ / ٣ / ٤ | 1 / 2 / 3 / 4 | `i18n.formatPriceLevel(n)` |
| Clock time: 9:00 PM | 9:00 م | 9:00 PM | Western — digital convention in Iraq |
| Date: 16/10/2026 | 16/10/2026 | 16/10/2026 | Western — international date format |
| GPS coordinate | 44.3661 | 44.3661 | Western — always |
| Phone number | 07701234567 | 07701234567 | Western — always |
| Map zoom level | 15 | 15 | Western — always |
| Char counter: 450/500 | 450/500 | 450/500 | Western — technical |
| Step indicator: 3/5 | 3/5 | 3/5 | Western — progress/technical |
| Daily limit: 38/50 | 38/50 | 38/50 | Western — technical |

### Separator Style

In Arabic locale, thousand separators use `٬` (Arabic thousands separator, U+066C) and decimal separator uses `٫` (Arabic decimal separator, U+066B):

- 15,000 IQD → ١٥٬٠٠٠ دينار
- 1,234.56 → ١٬٢٣٤٫٥٦

In English locale, standard separators apply: `,` for thousands, `.` for decimal.

---

## Implementation in `packages/i18n`

### `formatPrice(amountInSmallestUnit, currency, locale)`

IQD amounts are stored as integer dinars. USD amounts are stored as integer cents.

```typescript
// packages/i18n/src/format.ts

export function formatPrice(
  amount: number,
  currency: 'IQD' | 'USD',
  locale: Locale = 'ar'
): string {
  if (currency === 'IQD') {
    // IQD has no fractional units — display as whole dinars
    const formatted = formatInteger(amount, locale);
    return locale === 'en' ? `${formatted} IQD` : `${formatted} دينار`;
  }
  if (currency === 'USD') {
    // USD stored as cents
    const dollars = Math.floor(amount / 100);
    const cents = amount % 100;
    const formatted = `${formatInteger(dollars, locale)}${locale === 'en' ? '.' : '٫'}${String(cents).padStart(2, '0')}`;
    return locale === 'en' ? `$${formatted}` : `${formatted} دولار`;
  }
}

export function formatPriceRange(
  min: number,
  max: number,
  currency: 'IQD' | 'USD',
  locale: Locale = 'ar'
): string {
  const separator = locale === 'en' ? '–' : '–'; // en-dash in both directions
  return `${formatInteger(min, locale)}${separator}${formatInteger(max, locale)} ${currencyLabel(currency, locale)}`;
}
```

### `formatCount(n, locale)`

For review counts, like counts, comment counts:

```typescript
export function formatCount(n: number, locale: Locale = 'ar'): string {
  return formatInteger(n, locale);
}
```

### `formatInteger(n, locale)` — Core Helper

```typescript
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ARABIC_THOUSANDS_SEP = '٬'; // U+066C
const WESTERN_THOUSANDS_SEP = ',';

export function formatInteger(n: number, locale: Locale): string {
  // Add thousand separators
  const withSeps = Math.abs(Math.round(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '__SEP__');

  if (locale === 'en') {
    return withSeps.replace(/__SEP__/g, WESTERN_THOUSANDS_SEP);
  }

  // Convert to Arabic-Indic digits
  const arabicDigits = withSeps
    .replace(/__SEP__/g, ARABIC_THOUSANDS_SEP)
    .replace(/[0-9]/g, (d) => ARABIC_INDIC_DIGITS[parseInt(d, 10)] ?? d);

  return arabicDigits;
}
```

### `formatPriceLevel(level, locale)`

Price level is 1–4. In Arabic locale, display Arabic-Indic:

```typescript
export function formatPriceLevel(level: 1 | 2 | 3 | 4, locale: Locale): string {
  if (locale === 'en') return String(level);
  const map = { 1: '١', 2: '٢', 3: '٣', 4: '٤' };
  return map[level];
}
```

### Price Level Labels

| Level | Label AR | Label EN |
|-------|----------|----------|
| 1 | اقتصادي | Budget |
| 2 | متوسط | Moderate |
| 3 | مميز | Upscale |
| 4 | فاخر | Luxury |

---

## Mixed-Direction Number Display

When a number appears inline in an Arabic sentence, it creates a bidirectional text challenge. The Unicode bidi algorithm handles most cases, but wrapping ensures correct rendering:

```tsx
// ✅ Price inline in Arabic text
<Text>
  {'السعر: '}
  <Text style={{ writingDirection: 'rtl' }}>
    {formatPrice(15000, 'IQD', 'ar')}
  </Text>
</Text>

// ✅ Distance in navigation instruction (always LTR)
<Text>
  {'انعطف يميناً بعد '}
  <Text style={{ writingDirection: 'ltr' }}>{'450'}</Text>
  {' م'}
</Text>
```

Distance numbers in navigation instructions are always Western Arabic numerals with LTR direction — they are directional/technical values that would be confusing in Arabic-Indic (e.g., «٤٥٠ م» could be misread in a fast-moving navigation context).

---

## Kurdish Sorani

Kurdish Sorani uses the same Arabic-Indic digits as Arabic for prices. The `formatPrice` and `formatCount` functions treat `ckb` identically to `ar`.

---

## Consequences

### Positive

- Prices feel natural and native to Arabic-speaking users.
- Differentiating price/count from technical values makes the UI semantically clearer.
- Arabic-Indic digits are widely supported on Android (API 21+) and iOS without any special font loading.

### Negative / Trade-offs

- Two numeral systems in one app adds cognitive load for English-speaking contributors reviewing Arabic screenshots.
- String-based number formatting is slightly more complex than a single `Intl.NumberFormat` call.
- Accessibility tools (screen readers) must correctly pronounce Arabic-Indic numerals. TalkBack on Android and VoiceOver on iOS handle this natively.

### Neutral

- The backend always stores and transmits numbers as JSON numbers (not formatted strings). Formatting is purely a presentation concern in the mobile client.
- The `Intl.NumberFormat` with `{ numberingSystem: 'arab' }` is an alternative implementation approach; the custom `formatInteger` gives us full control over separators and is used instead.

---

## Alternatives Considered

### Western Numerals Everywhere

Rejected after user testing. Arabic test users expected Arabic-Indic for prices.

### Arabic-Indic Everywhere (Including Technical Values)

Rejected. GPS coordinates, zoom levels, and phone numbers in Arabic-Indic would be confusing for users accustomed to Western numerals in those contexts. Phone number `٠٧٧٠١٢٣٤٥٦٧` is less legible than `07701234567`.

### Use `Intl.NumberFormat` with `numberingSystem: 'arab'`

This would give us Arabic-Indic for all numbers, which is too broad. The per-context decision table above requires selective application that `Intl.NumberFormat` alone cannot provide.
