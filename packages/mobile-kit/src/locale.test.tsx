import { describe, expect, it } from '@jest/globals';
import { setLocale } from '@iraq-maps/i18n';
import { act, renderHook } from '@testing-library/react-native';
import { useLocale } from './index';

describe('useLocale', () => {
  it('re-renders with every locale change', async () => {
    setLocale('ar');
    const { result } = await renderHook(() => useLocale());
    expect(result.current).toBe('ar');
    await act(async () => setLocale('ckb'));
    expect(result.current).toBe('ckb');
    await act(async () => setLocale('en'));
    expect(result.current).toBe('en');
  });
});
