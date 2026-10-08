import { describe, expect, it } from 'vitest';
import { normalizeArabic as n, toAsciiDigits } from './normalize';

describe('normalizeArabic', () => {
  it('folds alef forms: أربيل, إربيل and اربيل are equal', () => {
    expect(n('أربيل')).toBe('اربيل');
    expect(n('إربيل')).toBe('اربيل');
    expect(n('آربيل')).toBe('اربيل');
    expect(n('ٱربيل')).toBe('اربيل');
  });

  it('folds ة to ه and ى to ي', () => {
    expect(n('مدرسة')).toBe(n('مدرسه'));
    expect(n('مستشفى')).toBe('مستشفي');
  });

  it('folds Persian/Kurdish yeh, keheh and heh variants', () => {
    expect(n('کتابی')).toBe('كتابي');
    expect(n('ھەولێر')).toBe(n('هەولێر'));
  });

  it('strips tashkeel, tatweel and invisible marks', () => {
    expect(n('مَدْرَسَةٌ')).toBe('مدرسه');
    expect(n('بغـــداد')).toBe('بغداد');
    expect(n('\u200Fبغ\u200Cداد')).toBe('بغداد');
  });

  it('converts Arabic-Indic and Persian digits to ASCII', () => {
    expect(n('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(n('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(n('شارع ٦٠')).toBe('شارع 60');
  });

  it('keeps the Sorani letters ڕ ۆ ێ ڵ ە', () => {
    expect(n('ڕۆێڵە')).toBe('ڕۆێڵە');
    expect(n('ئەربیل')).toBe('ئەربيل');
    expect(n('سلێمانی')).toBe('سلێماني');
  });

  it('expands presentation forms and collapses whitespace', () => {
    expect(n('\uFEFB')).toBe('لا');
    expect(n('  شارع   الرشيد \n')).toBe('شارع الرشيد');
  });
});

describe('toAsciiDigits', () => {
  it('converts only the digits and leaves everything else as is', () => {
    expect(toAsciiDigits('٠٧٧٠ ١٢٣ ٤٥٦٧')).toBe('0770 123 4567');
    expect(toAsciiDigits('۰۷۵۰-۱۲۳۴۵۶۷')).toBe('0750-1234567');
    expect(toAsciiDigits('+964 ٧٧٠ أربيل')).toBe('+964 770 أربيل');
  });
});
