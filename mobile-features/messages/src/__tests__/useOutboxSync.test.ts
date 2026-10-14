import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import { useOutboxSync } from '../hooks/useOutboxSync';

const mockFlush = jest.fn(async () => undefined);

jest.mock('../client', () => ({ useMessagingClient: () => ({}) }));
jest.mock('@iraq-maps/mobile-kit', () => ({
  InquiryOutbox: jest.fn().mockImplementation(() => ({
    flush: mockFlush,
    getPending: jest.fn(async () => []),
  })),
}));

let netInfoCallback: ((state: { isConnected: boolean }) => void) | undefined;
jest.mock('../netinfo', () => ({
  fetchNetInfo: jest.fn(async () => ({ isConnected: true })),
  addNetInfoListener: jest.fn((cb: (state: { isConnected: boolean }) => void) => {
    netInfoCallback = cb;
    return jest.fn();
  }),
}));

describe('useOutboxSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netInfoCallback = undefined;
  });

  it('calls flush on mount', async () => {
    const result = await renderHook(() => useOutboxSync());
    await act(async () => { await Promise.resolve(); });
    expect(mockFlush).toHaveBeenCalledTimes(1);
    result.unmount();
  });

  it('calls flush again on NetInfo reconnect', async () => {
    const result = await renderHook(() => useOutboxSync());
    await act(async () => { await Promise.resolve(); });
    const before = (mockFlush as { mock: { calls: unknown[] } }).mock.calls.length;

    await act(async () => { netInfoCallback?.({ isConnected: true }); });
    await act(async () => { await Promise.resolve(); });

    expect((mockFlush as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThan(before);
    result.unmount();
  });
});
