import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { assistantTestIDs } from '@iraq-maps/contracts';
import { Clipboard } from 'react-native';
import { AssistantChatScreen } from './screens/AssistantChatScreen';

const mockChat = jest.fn<() => Promise<unknown>>();
jest.mock('./client', () => ({
  useAssistantClient: () => ({
    chat: mockChat,
  }),
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const okResponse = {
  status: 200 as const,
  body: { sessionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', reply: 'مرحباً!', composeParams: undefined },
  headers: new Headers(),
};

describe('AssistantChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChat.mockResolvedValue(okResponse);
  });

  it('renders chat input and send button', async () => {
    const { getByTestId } = await render(<AssistantChatScreen />);
    expect(getByTestId(assistantTestIDs.chatInput)).toBeTruthy();
    expect(getByTestId(assistantTestIDs.sendButton)).toBeTruthy();
  });

  it('displays user message in list after send', async () => {
    const { getByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    await act(async () => {
      fireEvent.changeText(input, 'أين أقرب مطعم؟');
    });

    await act(async () => {
      fireEvent.press(sendBtn);
      // allow the async send() to complete
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByTestId(assistantTestIDs.messageItem(0))).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('clears input after send', async () => {
    const { getByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    fireEvent.changeText(input, 'سؤال');
    fireEvent.press(sendBtn);

    await waitFor(() => {
      // input should be cleared after send
      expect(input.props.value).toBe('');
    });
  });

  it('renders clear chat button and pressing it resets session', async () => {
    const { getByTestId } = await render(<AssistantChatScreen />);
    const clearBtn = getByTestId('assistant-clear-btn');
    expect(clearBtn).toBeTruthy();
    await act(async () => {
      fireEvent.press(clearBtn);
    });
    // After clearing, the input should still be present (screen stays mounted)
    expect(getByTestId(assistantTestIDs.chatInput)).toBeTruthy();
  });

  it('copies message content on long press', async () => {
    const setString = jest.spyOn(Clipboard, 'setString').mockImplementation(() => undefined);
    const { getByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    await act(async () => {
      fireEvent.changeText(input, 'رسالة للنسخ');
    });
    await act(async () => {
      fireEvent.press(sendBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByTestId(assistantTestIDs.messageItem(0))).toBeTruthy();
    }, { timeout: 5000 });

    fireEvent(getByTestId(assistantTestIDs.messageItem(0)), 'longPress');
    expect(setString).toHaveBeenCalledWith('رسالة للنسخ');
    setString.mockRestore();
  });

  it('shows daily limit message on 429 response', async () => {
    mockChat.mockResolvedValue({
      status: 429 as const,
      body: { type: 'about:blank', title: 'Too Many Requests', status: 429, code: 'daily_limit_exceeded' },
      headers: new Headers(),
    });

    const { getByTestId, getByText } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    await act(async () => { fireEvent.changeText(input, 'سؤال'); });
    await act(async () => { fireEvent.press(sendBtn); await Promise.resolve(); });

    await waitFor(() => {
      expect(getByText(/dailyLimit/)).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows place cards when focusPlaceIds returned', async () => {
    const PLACE_A = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000001';
    const PLACE_B = 'aaaaaaaa-aaaa-4aaa-aaaa-000000000002';
    mockChat.mockResolvedValue({
      status: 200 as const,
      body: {
        sessionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        reply: 'إليك بعض الأماكن',
        composeParams: undefined,
        focusPlaceIds: [PLACE_A, PLACE_B],
        focusPlaceNames: { [PLACE_A]: 'مطعم الوسط', [PLACE_B]: 'كافيه النور' },
      },
      headers: new Headers(),
    });

    const { getByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    await act(async () => {
      fireEvent.changeText(input, 'اقترح مطاعم');
    });
    await act(async () => {
      fireEvent.press(sendBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByTestId(`assistant.placeCard.${PLACE_A}`)).toBeTruthy();
      expect(getByTestId(`assistant.placeCard.${PLACE_B}`)).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows compose deeplink when composeParams returned', async () => {
    mockChat.mockResolvedValue({
      status: 200 as const,
      body: {
        sessionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        reply: 'يمكنني مساعدتك',
        composeParams: { text: 'استفسار', placeIds: [] as string[] },
      },
      headers: new Headers(),
    });

    const { getByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    await act(async () => {
      fireEvent.changeText(input, 'راسل المزود');
    });

    await act(async () => {
      fireEvent.press(sendBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByTestId(assistantTestIDs.composeDeepLink)).toBeTruthy();
    }, { timeout: 5000 });
  });

  it('shows retry button after error and retries last message on press', async () => {
    mockChat.mockRejectedValueOnce(new Error('network error'));

    const { getByTestId, queryByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    await act(async () => {
      fireEvent.changeText(input, 'مطاعم قريبة');
    });
    await act(async () => {
      fireEvent.press(sendBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(getByTestId('assistant-retry-btn')).toBeTruthy();
    }, { timeout: 5000 });

    // Now mock a successful response for the retry
    mockChat.mockResolvedValueOnce(okResponse);

    await act(async () => {
      fireEvent.press(getByTestId('assistant-retry-btn'));
      await Promise.resolve();
    });

    // After retry succeeds, error row (and retry button) disappear
    await waitFor(() => {
      expect(queryByTestId('assistant-retry-btn')).toBeNull();
    }, { timeout: 5000 });
    // chat was called twice (original + retry)
    expect(mockChat).toHaveBeenCalledTimes(2);
  });
});
