import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatNumber, getLocale, isRtl, onLocaleChange, setLocale } from './index';

beforeEach(() => setLocale('ar'));

describe('locale state', () => {
  it('defaults to Arabic', async () => {
    vi.resetModules();
    const fresh = await import('./index');
    expect(fresh.getLocale()).toBe('ar');
  });

  it('notifies listeners only on an actual change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = onLocaleChange(listener);
    setLocale('ar');
    expect(listener).not.toHaveBeenCalled();
    setLocale('en');
    setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('en');
    unsubscribe();
    setLocale('ckb');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLocale()).toBe('ckb');
  });

  it('marks ar and ckb as right-to-left', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('ckb')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });
});

describe('formatNumber', () => {
  it('uses Arabic-Indic digits for ar and ckb and Latin digits for en', () => {
    expect(formatNumber(1234567.5, 'ar')).toBe('١٬٢٣٤٬٥٦٧٫٥');
    expect(formatNumber(1234567.5, 'ckb')).toBe('١٬٢٣٤٬٥٦٧٫٥');
    expect(formatNumber(1234567.5, 'en')).toBe('1,234,567.5');
    expect(formatNumber(964, 'ar')).toBe('٩٦٤');
  });

  it('follows the current locale by default', () => {
    expect(formatNumber(60)).toBe('٦٠');
    setLocale('en');
    expect(formatNumber(60)).toBe('60');
  });
});
