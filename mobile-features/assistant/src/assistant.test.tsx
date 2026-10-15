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
});
