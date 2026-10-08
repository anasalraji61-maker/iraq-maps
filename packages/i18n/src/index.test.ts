import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertKeyParity, formatNumber, getLocale, isRtl, onLocaleChange, registerNamespace, setLocale, t } from './index';
import ar from './locales/ar.json';
import ckb from './locales/ckb.json';
import en from './locales/en.json';

afterEach(() => setLocale('ar'));

describe('key parity', () => {
  it('holds for the common namespace', () => {
    expect(() => assertKeyParity('common', { ar, ckb, en })).not.toThrow();
  });

  it('names the locale and the key that is missing', () => {
    expect(() => assertKeyParity('x', { ar: { a: 'أ', b: { c: 'ج' } }, ckb: { a: 'ئ' }, en: { a: 'A', b: { c: 'C' } } })).toThrow(
      'i18n namespace "x": ckb lacks b.c',
    );
  });

  it('treats an empty string as missing', () => {
    expect(() => assertKeyParity('x', { ar: { a: 'أ' }, ckb: { a: ' ' }, en: { a: 'A' } })).toThrow('ckb lacks a');
  });

  it('requires the same {param} placeholders in every locale', () => {
    expect(() => assertKeyParity('x', { ar: { a: 'بعد {n}' }, ckb: { a: 'دوای {n}' }, en: { a: 'after {count}' } })).toThrow(/lacks a\{n\}/);
  });

  it('is enforced by registerNamespace', () => {
    expect(() => registerNamespace('broken', { ar: { a: 'أ' }, ckb: {}, en: { a: 'A' } })).toThrow('ckb lacks a');
    expect(t('broken:a')).toBe('broken:a');
  });
});

describe('t', () => {
  it('defaults to Arabic and follows setLocale', () => {
    expect(getLocale()).toBe('ar');
    expect(t('common:tabs.map')).toBe('الخريطة');
    setLocale('ckb');
    expect(t('common:tabs.map')).toBe('نەخشە');
    setLocale('en');
    expect(t('common:tabs.map')).toBe('Map');
  });

  it('interpolates {params} and leaves unknown ones in place', () => {
    registerNamespace('demo', { ar: { hi: 'أهلاً {name}، لديك {n}' }, ckb: { hi: 'سڵاو {name}، {n}' }, en: { hi: 'Hi {name}, you have {n}' } });
    expect(t('demo:hi', { name: 'Ali', n: 3 })).toBe('أهلاً Ali، لديك 3');
    setLocale('en');
    expect(t('demo:hi', { name: 'Ali' })).toBe('Hi Ali, you have {n}');
  });

  it('returns the key for an unknown namespace, key or subtree', () => {
    expect(t('nope:x')).toBe('nope:x');
    expect(t('common:tabs.nope')).toBe('common:tabs.nope');
    expect(t('common:tabs')).toBe('common:tabs');
  });
});

describe('locale', () => {
  it('notifies listeners on change only, until unsubscribed', () => {
    const listener = vi.fn();
    const off = onLocaleChange(listener);
    setLocale('ar');
    setLocale('en');
    off();
    setLocale('ckb');
    expect(listener.mock.calls).toEqual([['en']]);
  });

  it('is RTL for ar and ckb, LTR for en', () => {
    expect([isRtl('ar'), isRtl('ckb'), isRtl('en')]).toEqual([true, true, false]);
  });

  it('formats numbers with Arabic-Indic digits for ar and ckb', () => {
    expect(formatNumber(1234.5)).toBe('١٬٢٣٤٫٥');
    setLocale('ckb');
    expect(formatNumber(1234)).toBe('١٬٢٣٤');
    setLocale('en');
    expect(formatNumber(1234.5, { maximumFractionDigits: 0 })).toBe('1,235');
  });
});
