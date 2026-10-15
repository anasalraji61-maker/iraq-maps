/**
 * Unit tests for useBlockedUsers hook.
 * AsyncStorage is mocked in test/setup.ts.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBlockedUsers } from './useBlockedUsers';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

describe('useBlockedUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('starts with empty blocked set', async () => {
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    expect(hook.result.current.blockedIds.size).toBe(0);
    hook.unmount();
  });

  it('loads previously blocked users from storage', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['user-1', 'user-2']));
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    expect(hook.result.current.isBlocked('user-1')).toBe(true);
    expect(hook.result.current.isBlocked('user-2')).toBe(true);
    hook.unmount();
  });

  it('isBlocked returns false for unknown user', async () => {
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    expect(hook.result.current.isBlocked('nobody')).toBe(false);
    hook.unmount();
  });

  it('blockUser adds a user to the blocked set', async () => {
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    await act(async () => { await hook.result.current.blockUser('bad-actor'); });
    expect(hook.result.current.isBlocked('bad-actor')).toBe(true);
    hook.unmount();
  });

  it('unblockUser removes an existing blocked user', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['user-x']));
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    await act(async () => { await hook.result.current.unblockUser('user-x'); });
    expect(hook.result.current.isBlocked('user-x')).toBe(false);
    hook.unmount();
  });

  it('unblockUser on non-blocked user is a no-op', async () => {
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    await act(async () => { await hook.result.current.unblockUser('ghost'); });
    expect(hook.result.current.blockedIds.size).toBe(0);
    hook.unmount();
  });

  it('persists to storage on blockUser', async () => {
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    await act(async () => { await hook.result.current.blockUser('spammer'); });
    await act(async () => {});
    expect(mockSet).toHaveBeenCalled();
    hook.unmount();
  });

  it('handles corrupt storage gracefully (empty set)', async () => {
    mockGet.mockResolvedValue('not-json{{{');
    const hook = await renderHook(() => useBlockedUsers());
    await act(async () => {});
    expect(hook.result.current.blockedIds.size).toBe(0);
    hook.unmount();
  });
});
