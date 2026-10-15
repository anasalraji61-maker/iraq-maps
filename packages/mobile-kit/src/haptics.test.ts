/**
 * Unit tests for useHaptics.
 * expo-haptics is mocked in test/setup.ts.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useHaptics } from './haptics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHaptics = Haptics as any;

describe('useHaptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tap calls impactAsync with Light style', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.tap();
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Light);
    hook.unmount();
  });

  it('like calls impactAsync with Medium style', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.like();
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Medium);
    hook.unmount();
  });

  it('sent calls notificationAsync with Success type', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.sent();
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(mockHaptics.NotificationFeedbackType.Success);
    hook.unmount();
  });

  it('fail calls notificationAsync with Error type', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.fail();
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(mockHaptics.NotificationFeedbackType.Error);
    hook.unmount();
  });

  it('light calls impactAsync with Light style', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.light();
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Light);
    hook.unmount();
  });

  it('medium calls impactAsync with Medium style', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.medium();
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith(mockHaptics.ImpactFeedbackStyle.Medium);
    hook.unmount();
  });

  it('success calls notificationAsync with Success type', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.success();
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(mockHaptics.NotificationFeedbackType.Success);
    hook.unmount();
  });

  it('error calls notificationAsync with Error type', async () => {
    const hook = await renderHook(() => useHaptics());
    hook.result.current.error();
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith(mockHaptics.NotificationFeedbackType.Error);
    hook.unmount();
  });

  it('does not throw if impactAsync rejects', async () => {
    mockHaptics.impactAsync = jest.fn(async () => { throw new Error('no haptics'); });
    const hook = await renderHook(() => useHaptics());
    hook.result.current.tap();
    // Wait a tick for the promise rejection to be swallowed by .catch()
    await new Promise((r) => setTimeout(r, 0));
    hook.unmount();
  });

  it('does not throw if notificationAsync rejects', async () => {
    mockHaptics.notificationAsync = jest.fn(async () => { throw new Error('no haptics'); });
    const hook = await renderHook(() => useHaptics());
    hook.result.current.sent();
    await new Promise((r) => setTimeout(r, 0));
    hook.unmount();
  });
});
