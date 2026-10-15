/**
 * Unit tests for useFollows hook.
 * AsyncStorage is mocked in test/setup.ts.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFollows } from './useFollows';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe('useFollows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('starts loading and resolves to empty set when storage is empty', async () => {
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.followedIds.size).toBe(0);
    hook.unmount();
  });

  it('loads previously followed users from storage', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['user-1', 'user-2']));
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    expect(hook.result.current.followedIds.has('user-1')).toBe(true);
    expect(hook.result.current.followedIds.has('user-2')).toBe(true);
    hook.unmount();
  });

  it('isFollowing returns false for unknown user', async () => {
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    expect(hook.result.current.isFollowing('unknown')).toBe(false);
    hook.unmount();
  });

  it('toggleFollow adds a new user', async () => {
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    await act(async () => { await hook.result.current.toggleFollow('user-abc'); });
    expect(hook.result.current.isFollowing('user-abc')).toBe(true);
    hook.unmount();
  });

  it('toggleFollow removes an existing follow', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['user-1']));
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    await act(async () => { await hook.result.current.toggleFollow('user-1'); });
    expect(hook.result.current.isFollowing('user-1')).toBe(false);
    hook.unmount();
  });

  it('persists to storage on toggle', async () => {
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    await act(async () => { await hook.result.current.toggleFollow('user-x'); });
    await act(async () => {});
    expect(mockSet).toHaveBeenCalled();
    hook.unmount();
  });

  it('handles storage read errors gracefully (empty set)', async () => {
    mockGet.mockRejectedValue(new Error('storage error'));
    const hook = await renderHook(() => useFollows());
    await act(async () => {});
    expect(hook.result.current.followedIds.size).toBe(0);
    hook.unmount();
  });
});
