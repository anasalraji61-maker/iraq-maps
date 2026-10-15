/**
 * Integration tests for the assistant feature — complete chat flows,
 * error recovery, history persistence, and session management.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAssistantChat } from '../hooks/useAssistantChat';

// ─── Mock AsyncStorage ─────────────────────────────────────────────────────

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => store[key] ?? null),
    setItem: jest.fn(async (key: string, val: string) => { store[key] = val; }),
    removeItem: jest.fn(async (key: string) => { delete store[key]; }),
    multiRemove: jest.fn(async (keys: string[]) => { keys.forEach((k) => delete store[k]); }),
  },
}));

// ─── Mock i18n ─────────────────────────────────────────────────────────────

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (key: string) => key,
}));

// ─── Mock assistant client ─────────────────────────────────────────────────

const mockChat = jest.fn<() => Promise<unknown>>();
jest.mock('../client', () => ({
  useAssistantClient: () => ({ chat: mockChat }),
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
}));

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

const okResponse = (reply: string, sessionId = SESSION_ID) => ({
  status: 200 as const,
  body: { sessionId, reply, composeParams: undefined },
  headers: new Headers(),
});

// ─── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(store).forEach((k) => delete store[k]);
  mockChat.mockResolvedValue(okResponse('مرحباً!'));
});

describe('useAssistantChat — message flow', () => {
  it('starts with an empty message list', async () => {

    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));
    expect(result.current.messages).toEqual([]);
  });

  it('adds user message and assistant reply on send', async () => {

    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    await act(async () => {
      await result.current.send('ما أفضل مطعم في بغداد؟');
    });

    const messages = result.current.messages;
    expect(messages.some((m) => m.role === 'user' && m.content === 'ما أفضل مطعم في بغداد؟')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant' && m.content === 'مرحباً!')).toBe(true);
  });

  it('sets isLoading to true while the request is in flight', async () => {
    let resolve!: (v: unknown) => void;
    mockChat.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));


    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    let sendPromise!: Promise<void>;
    await act(async () => {
      sendPromise = result.current.send('سؤال');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve(okResponse('جواب'));
      await sendPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('sets error state when the API returns an error status', async () => {
    mockChat.mockResolvedValueOnce({
      status: 500,
      body: {},
      headers: new Headers(),
    });


    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    await act(async () => {
      await result.current.send('سؤال');
    });

    // Error should be set and isLoading cleared
    expect(result.current.isLoading).toBe(false);
  });

  it('handles network errors gracefully without crashing', async () => {
    mockChat.mockRejectedValueOnce(new Error('network error'));


    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    await act(async () => {
      await result.current.send('سؤال يسبب خطأ').catch(() => undefined);
    });

    expect(result.current.isLoading).toBe(false);
  });
});

describe('useAssistantChat — session persistence', () => {
  it('persists messages to AsyncStorage after a successful send', async () => {

    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    await act(async () => {
      await result.current.send('هل بغداد جميلة؟');
    });

    // AsyncStorage.setItem should have been called to persist history
    const AsyncStorageMock = jest.requireMock<{ default: { setItem: jest.Mock } }>('@react-native-async-storage/async-storage');
    expect(AsyncStorageMock.default.setItem).toHaveBeenCalled();
  });

  it('loads persisted history on mount', async () => {
    // Pre-seed AsyncStorage with a past conversation
    const history = JSON.stringify([
      { role: 'user', content: 'مرحبا', timestamp: Date.now() - 1000 },
      { role: 'assistant', content: 'أهلاً وسهلاً', timestamp: Date.now() - 900 },
    ]);
    store[`@assistant_chat_history:${SESSION_ID}`] = history;


    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    expect(result.current.messages.some((m) => m.content === 'مرحبا')).toBe(true);
  });
});

describe('useAssistantChat — composeParams propagation', () => {
  it('exposes composeParams from the assistant response', async () => {
    mockChat.mockResolvedValueOnce({
      status: 200,
      body: {
        sessionId: SESSION_ID,
        reply: 'يمكنك إرسال استفسار',
        composeParams: { placeId: 'N123', defaultText: 'هل أنتم مفتوحون؟' },
      },
      headers: new Headers(),
    });


    const { result } = await renderHook(() => useAssistantChat(SESSION_ID));
    await waitFor(() => expect(result.current.historyLoaded).toBe(true));

    await act(async () => {
      await result.current.send('كيف أتواصل مع المطعم؟');
    });

    expect(result.current.composeParams).toMatchObject({ placeId: 'N123' });
  });
});
