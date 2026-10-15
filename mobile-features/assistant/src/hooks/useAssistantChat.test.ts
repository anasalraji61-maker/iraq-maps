/**
 * Unit tests for pure async helpers from useAssistantChat:
 * loadPersistedSessionId, clearPersistedSessionId, clearPersistedHistory.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPersistedSessionId, clearPersistedSessionId, clearPersistedHistory } from './useAssistantChat';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

function setupRemoveMock(): jest.MockedFunction<AnyFn> {
  const fn = jest.fn(async () => undefined) as jest.MockedFunction<AnyFn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (AsyncStorage as any).removeItem = fn;
  return fn;
}

describe('loadPersistedSessionId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
  });

  it('returns null when no session is stored', async () => {
    mockGet.mockResolvedValue(null);
    const id = await loadPersistedSessionId();
    expect(id).toBeNull();
  });

  it('returns the stored session id', async () => {
    mockGet.mockResolvedValue('00000000-0000-0000-0000-000000000001');
    const id = await loadPersistedSessionId();
    expect(id).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('returns null when AsyncStorage throws', async () => {
    mockGet.mockRejectedValue(new Error('storage error'));
    const id = await loadPersistedSessionId();
    expect(id).toBeNull();
  });
});

describe('clearPersistedSessionId', () => {
  it('calls removeItem on the session key', async () => {
    const removeMock = setupRemoveMock();
    await clearPersistedSessionId();
    expect(removeMock).toHaveBeenCalledWith(expect.stringContaining('assistant_session_id'));
  });

  it('does not throw when removeItem fails', async () => {
    const removeMock = setupRemoveMock();
    removeMock.mockRejectedValue(new Error('fail'));
    await expect(clearPersistedSessionId()).resolves.toBeUndefined();
  });
});

describe('clearPersistedHistory', () => {
  it('calls removeItem with the session-specific key', async () => {
    const removeMock = setupRemoveMock();
    const sessionId = '00000000-0000-0000-0000-000000000001';
    await clearPersistedHistory(sessionId);
    expect(removeMock).toHaveBeenCalledWith(expect.stringContaining(sessionId));
  });

  it('does not throw when removeItem fails', async () => {
    const removeMock = setupRemoveMock();
    removeMock.mockRejectedValue(new Error('storage fail'));
    await expect(clearPersistedHistory('any-session')).resolves.toBeUndefined();
  });
});
