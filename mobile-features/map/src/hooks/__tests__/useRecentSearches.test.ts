/**
 * Unit tests for useRecentSearches hook.
 * AsyncStorage is mocked globally in test/setup.ts.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRecentSearches } from '../useRecentSearches';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe('useRecentSearches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('starts with an empty list when storage is empty', async () => {
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    expect(hook.result.current.items).toEqual([]);
    hook.unmount();
  });

  it('loads previously saved searches from storage', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['بغداد', 'أربيل']));
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    expect(hook.result.current.items).toEqual(['بغداد', 'أربيل']);
    hook.unmount();
  });

  it('adds a new search term at the front', async () => {
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    await act(async () => { hook.result.current.add('مطعم'); });
    expect(hook.result.current.items[0]).toBe('مطعم');
    hook.unmount();
  });

  it('deduplicates: moves existing term to front', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['أربيل', 'بغداد']));
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    await act(async () => { hook.result.current.add('بغداد'); });
    expect(hook.result.current.items).toEqual(['بغداد', 'أربيل']);
    hook.unmount();
  });

  it('ignores blank or whitespace-only terms', async () => {
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    await act(async () => { hook.result.current.add('   '); });
    expect(hook.result.current.items).toEqual([]);
    hook.unmount();
  });

  it('caps the list at 8 items', async () => {
    const initial = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    mockGet.mockResolvedValue(JSON.stringify(initial));
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    await act(async () => { hook.result.current.add('new'); });
    expect(hook.result.current.items).toHaveLength(8);
    expect(hook.result.current.items[0]).toBe('new');
    hook.unmount();
  });

  it('clears all saved searches', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['بغداد']));
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    await act(async () => { hook.result.current.clear(); });
    expect(hook.result.current.items).toEqual([]);
    expect(mockSet).toHaveBeenCalledWith(expect.any(String), '[]');
    hook.unmount();
  });

  it('handles storage read errors gracefully (returns empty list)', async () => {
    mockGet.mockRejectedValue(new Error('storage failure'));
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    expect(hook.result.current.items).toEqual([]);
    hook.unmount();
  });

  it('persists to storage when adding a term', async () => {
    const hook = await renderHook(() => useRecentSearches());
    await act(async () => {});
    await act(async () => { hook.result.current.add('كربلاء'); });
    await act(async () => {});
    expect(mockSet).toHaveBeenCalled();
    hook.unmount();
  });
});
