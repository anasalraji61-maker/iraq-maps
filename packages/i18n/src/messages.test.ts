import { beforeEach, describe, expect, it } from 'vitest';
import { registerNamespace, setLocale, t, type Messages } from './index';

const resources = {
  ar: { phone: { title: 'رقم الهاتف', hint: 'أهلاً {{name}}' }, resend: { zero: 'الآن', one: 'بعد ثانية', two: 'بعد ثانيتين', few: 'بعد {{count}} ثوانٍ', many: 'بعد {{count}} ثانية', other: 'بعد {{count}} ثانية' } },
  ckb: { phone: { title: 'ژمارەی مۆبایل', hint: 'بەخێربێیت {{name}}' }, resend: { one: 'دوای چرکەیەک', other: 'دوای {{count}} چرکە' } },
  en: { phone: { title: 'Phone number', hint: 'Welcome {{name}}' }, resend: { one: 'in 1 second', other: 'in {{count}} seconds' } },
};

beforeEach(() => {
  setLocale('ar');
  registerNamespace('test', resources);
});

describe('registerNamespace key parity', () => {
  it('accepts matching keys with locale-specific plural forms', () => {
    expect(() => registerNamespace('ok', resources)).not.toThrow();
  });

  it('names missing, extra and mismatched keys per locale', () => {
    const broken = {
      ar: { a: 'أ', b: { c: 'ج' }, d: { one: 'واحد', other: 'عدة' } },
      ckb: { a: 'ئ', d: { one: 'یەک', other: 'چەند' } },
      en: { a: 'a', b: { c: 'c' }, d: 'text', e: 'extra' },
    };
    expect(() => registerNamespace('broken', broken)).toThrow(
      'i18n namespace "broken" is not in parity with ar: ckb missing [b.c]; en extra [e]; en plural/text mismatch [d]',
    );
  });

  it('requires an "other" form in every plural message', () => {
    const plural: Messages = { n: { one: 'x', few: 'y' } };
    expect(() => registerNamespace('plural', { ar: plural, ckb: plural, en: plural })).toThrow('ar plural "n" has no "other" form');
  });

  it('replaces a namespace when it is registered again', () => {
    registerNamespace('test', { ...resources, ar: { ...resources.ar, phone: { ...resources.ar.phone, title: 'الهاتف' } } });
    expect(t('test:phone.title')).toBe('الهاتف');
  });
});

describe('t', () => {
  it('reads dotted keys in the current locale', () => {
    expect(t('test:phone.title')).toBe('رقم الهاتف');
    setLocale('ckb');
    expect(t('test:phone.title')).toBe('ژمارەی مۆبایل');
    setLocale('en');
    expect(t('test:phone.title')).toBe('Phone number');
  });

  it('interpolates params and formats numbers for the locale', () => {
    expect(t('test:phone.hint', { name: 'سارة' })).toBe('أهلاً سارة');
    expect(t('test:resend', { count: 30 })).toBe('بعد ٣٠ ثانية');
    setLocale('en');
    expect(t('test:resend', { count: 30 })).toBe('in 30 seconds');
    expect(t('test:phone.hint')).toBe('Welcome {{name}}');
  });

  it('selects Arabic plural categories and falls back to "other"', () => {
    expect([0, 1, 2, 5, 11, 100].map((count) => t('test:resend', { count }))).toEqual([
      'الآن',
      'بعد ثانية',
      'بعد ثانيتين',
      'بعد ٥ ثوانٍ',
      'بعد ١١ ثانية',
      'بعد ١٠٠ ثانية',
    ]);
    setLocale('ckb');
    expect(t('test:resend', { count: 0 })).toBe('دوای ٠ چرکە');
    setLocale('en');
    expect([1, 2].map((count) => t('test:resend', { count }))).toEqual(['in 1 second', 'in 2 seconds']);
  });

  it('matches CLDR plural rules for every locale', () => {
    const categories = { zero: 'zero', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' };
    registerNamespace('cldr', { ar: { n: categories }, ckb: { n: categories }, en: { n: categories } });
    const counts = [...Array.from({ length: 1201 }, (_, i) => i), 1.5, 2.5, 3.5, 11.5, -1, -3];
    for (const locale of ['ar', 'ckb', 'en'] as const) {
      setLocale(locale);
      const rules = new Intl.PluralRules(locale);
      expect(counts.map((count) => t('cldr:n', { count }))).toEqual(counts.map((count) => rules.select(count)));
    }
  });

  it('returns the key for unknown namespaces, keys, groups and plurals without count', () => {
    expect(t('missing:phone.title')).toBe('missing:phone.title');
    expect(t('test:phone.nope')).toBe('test:phone.nope');
    expect(t('test:phone')).toBe('test:phone');
    expect(t('test:resend')).toBe('test:resend');
  });
});
