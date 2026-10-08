import { describe, expect, it } from 'vitest';
import { normalizeArabic } from './index';

const cases: [input: string, expected: string][] = [
  ['أربيل', 'اربيل'],
  ['إربيل', 'اربيل'],
  ['آمرلي', 'امرلي'],
  ['ٱلكوفة', 'الكوفه'],
  ['مدينة', 'مدينه'],
  ['مستشفى', 'مستشفي'],
  ['کەرکووک', 'كەركووك'],
  ['سلێمانی', 'سلێماني'],
  ['مُحَمَّدٌ', 'محمد'],
  ['هٰذا', 'هذا'],
  ['بغـــداد', 'بغداد'],
  ['ٱلرَّحۡمَٰنِ ۚ', 'الرحمن'],
  ['ﺑﻐﺪﺍﺩ ﻻ', 'بغداد لا'],
  ['٠١٢٣٤٥٦٧٨٩', '0123456789'],
  ['۰۱۲۳۴۵۶۷۸۹', '0123456789'],
  ['  Baghdad \n  MALL ', 'baghdad mall'],
  ['شارع ١٤ رمضان', 'شارع 14 رمضان'],
];

describe('normalizeArabic', () => {
  it('treats أربيل, إربيل and اربيل as the same word', () => {
    expect(new Set(['أربيل', 'إربيل', 'اربيل'].map(normalizeArabic)).size).toBe(1);
  });

  it.each(cases)('normalizes %s', (input, expected) => {
    expect(normalizeArabic(input)).toBe(expected);
  });

  it('keeps Sorani letters ڕ ۆ ێ ڵ ە and the hamza carriers ئ ؤ', () => {
    expect(normalizeArabic('هەولێر')).toBe('هەولێر');
    expect(normalizeArabic('ڕانیە')).toBe('ڕانيە');
    expect(normalizeArabic('کۆڵان')).toBe('كۆڵان');
    expect(normalizeArabic('ئاسۆ')).toBe('ئاسۆ');
    expect(normalizeArabic('مؤتمر')).toBe('مؤتمر');
  });

  it('is idempotent', () => {
    for (const input of [...cases.map(([text]) => text), 'هەولێر', 'ڕانیە', 'كۆڵان']) {
      const once = normalizeArabic(input);
      expect(normalizeArabic(once)).toBe(once);
    }
  });
});
