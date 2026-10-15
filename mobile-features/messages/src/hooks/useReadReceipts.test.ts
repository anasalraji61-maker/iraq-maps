/**
 * Unit tests for useReadAt, useMarkRead, useReadReceiptsMap.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  },
}));

jest.mock('../client', () => ({
  useMessagingClient: jest.fn(() => ({
    markInquiryRead: jest.fn(() => Promise.resolve({ status: 200 })),
  })),
}));

import { useReadAt, useMarkRead, useReadReceiptsMap } from './useReadReceipts';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('useReadAt', () => {
  it('returns null when inquiryId is undefined', async () => {
    const hook = await renderHook(() => useReadAt(undefined));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current).toBeNull();
  });

  it('returns null when no receipt stored', async () => {
    const hook = await renderHook(() => useReadAt('inq-1'));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current).toBeNull();
  });
});

describe('useMarkRead', () => {
  it('returns empty string when inquiryId is undefined', async () => {
    const hook = await renderHook(() => useMarkRead(undefined));
    let ts: string | undefined;
    await act(async () => { ts = await hook.result.current(); });
    expect(ts).toBe('');
  });

  it('returns a timestamp after marking read', async () => {
    const hook = await renderHook(() => useMarkRead('inq-2'));
    let ts: string | undefined;
    await act(async () => { ts = await hook.result.current(); });
    expect(typeof ts).toBe('string');
    expect(ts!.length).toBeGreaterThan(0);
  });

  it('is idempotent — second call returns same timestamp', async () => {
    const hook = await renderHook(() => useMarkRead('inq-3'));
    let ts1: string | undefined;
    let ts2: string | undefined;
    await act(async () => { ts1 = await hook.result.current(); });
    await act(async () => { ts2 = await hook.result.current(); });
    expect(ts1).toBe(ts2);
  });
});

describe('useReadReceiptsMap', () => {
  it('returns empty object for empty ids array', async () => {
    const hook = await renderHook(() => useReadReceiptsMap([]));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current).toEqual({});
  });

  it('returns undefined values for ids not yet read', async () => {
    const hook = await renderHook(() => useReadReceiptsMap(['inq-A', 'inq-B']));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current['inq-A']).toBeUndefined();
    expect(hook.result.current['inq-B']).toBeUndefined();
  });
});
