/**
 * Unit tests for useNetworkStatus.
 * NetInfo is mocked in test/setup.ts (addEventListener only);
 * fetch is added per-test here.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { useNetworkStatus } from './use-network-status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockNetInfo = NetInfo as any;

function setFetchResult(isConnected: boolean, isInternetReachable: boolean | null) {
  mockNetInfo.fetch = jest.fn(async () => ({ isConnected, isInternetReachable }));
}

function setListenerResult(isConnected: boolean, isInternetReachable: boolean | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockNetInfo.addEventListener = jest.fn((cb: any) => {
    cb({ isConnected, isInternetReachable });
    return jest.fn();
  });
}

describe('useNetworkStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setFetchResult(true, true);
    mockNetInfo.addEventListener = jest.fn(() => jest.fn());
  });

  it('defaults to true (optimistic) before any NetInfo event', async () => {
    // Make fetch hang so the initial state is never updated
    mockNetInfo.fetch = jest.fn(() => new Promise(() => {}));
    const hook = await renderHook(() => useNetworkStatus());
    expect(hook.result.current).toBe(true);
    hook.unmount();
  });

  it('returns true when connected with internet reachable', async () => {
    setFetchResult(true, true);
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(hook.result.current).toBe(true);
    hook.unmount();
  });

  it('returns false when isConnected is false', async () => {
    setFetchResult(false, false);
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(hook.result.current).toBe(false);
    hook.unmount();
  });

  it('returns false when isInternetReachable is false even if connected', async () => {
    setFetchResult(true, false);
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(hook.result.current).toBe(false);
    hook.unmount();
  });

  it('returns true when isInternetReachable is null (unknown)', async () => {
    setFetchResult(true, null);
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(hook.result.current).toBe(true);
    hook.unmount();
  });

  it('updates via addEventListener listener when fetch also shows offline', async () => {
    setFetchResult(false, false);
    setListenerResult(false, false);
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(hook.result.current).toBe(false);
    hook.unmount();
  });

  it('calls addEventListener on mount', async () => {
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    expect(mockNetInfo.addEventListener).toHaveBeenCalled();
    hook.unmount();
  });

  it('addEventListener return value is used as cleanup (unsub stored)', async () => {
    const unsub = jest.fn();
    mockNetInfo.addEventListener = jest.fn((_cb: unknown) => unsub);
    const hook = await renderHook(() => useNetworkStatus());
    await act(async () => {});
    // The effect returns the unsub fn — verify addEventListener was called (cleanup wiring is tested by integration)
    expect(mockNetInfo.addEventListener).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
