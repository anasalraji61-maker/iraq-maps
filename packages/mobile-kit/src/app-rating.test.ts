/**
 * Unit tests for useAppRating.
 * AsyncStorage and expo-store-review are mocked in test/setup.ts.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useAppRating } from './app-rating';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReview = StoreReview as any;

describe('useAppRating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
    mockReview.isAvailableAsync.mockResolvedValue(false);
    mockReview.requestReview.mockResolvedValue(undefined);
  });

  it('onPostCreated increments the post count in storage', async () => {
    const hook = await renderHook(() => useAppRating());
    await hook.result.current.onPostCreated();
    expect(mockSet).toHaveBeenCalledWith(expect.stringContaining('postCount'), '1');
    hook.unmount();
  });

  it('onMessageSent increments the message count in storage', async () => {
    const hook = await renderHook(() => useAppRating());
    await hook.result.current.onMessageSent();
    expect(mockSet).toHaveBeenCalledWith(expect.stringContaining('messageCount'), '1');
    hook.unmount();
  });

  it('does not request review before threshold (3)', async () => {
    mockGet.mockResolvedValue('1'); // posts=1, msgs=1 → total 2
    const hook = await renderHook(() => useAppRating());
    await hook.result.current.onPostCreated();
    expect(mockReview.requestReview).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('requests review when threshold is reached and store review is available', async () => {
    // postCount=2, messageCount=0, prompted=null → after increment: 3+0 ≥ 3 → prompt
    mockGet.mockImplementation(async (key: string) => {
      if (key.includes('postCount')) return '2';
      return null; // messageCount=0, prompted=not set
    });
    mockReview.isAvailableAsync.mockResolvedValue(true);
    const hook = await renderHook(() => useAppRating());
    await hook.result.current.onPostCreated();
    expect(mockReview.requestReview).toHaveBeenCalled();
    hook.unmount();
  });

  it('does not request review when store review is not available', async () => {
    mockGet.mockImplementation(async (key: string) => (key.includes('postCount') ? '2' : null));
    mockReview.isAvailableAsync.mockResolvedValue(false);
    const hook = await renderHook(() => useAppRating());
    await hook.result.current.onPostCreated();
    expect(mockReview.requestReview).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('does not request review again when already prompted', async () => {
    // prompted=1 means it was already prompted
    mockGet.mockImplementation(async (key: string) => {
      if (key.includes('prompted')) return '1';
      return '5'; // high counts to ensure threshold is met
    });
    mockReview.isAvailableAsync.mockResolvedValue(true);
    const hook = await renderHook(() => useAppRating());
    await hook.result.current.onPostCreated();
    expect(mockReview.requestReview).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('does not throw when AsyncStorage fails', async () => {
    mockGet.mockRejectedValue(new Error('storage fail'));
    const hook = await renderHook(() => useAppRating());
    await expect(hook.result.current.onPostCreated()).resolves.not.toThrow();
    hook.unmount();
  });
});
