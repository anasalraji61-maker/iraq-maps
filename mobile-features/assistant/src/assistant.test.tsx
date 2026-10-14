import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { assistantTestIDs } from '@iraq-maps/contracts';
import { AssistantChatScreen } from './screens/AssistantChatScreen.js';

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

    fireEvent.changeText(input, 'أين أقرب مطعم؟');
    await act(async () => {
      fireEvent.press(sendBtn);
    });

    await waitFor(() => {
      expect(getByTestId(assistantTestIDs.messageItem(0))).toBeTruthy();
    });
  });

  it('shows loading while waiting for response', async () => {
    let resolve!: (v: unknown) => void;
    mockChat.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { queryByText, getByTestId } = await render(<AssistantChatScreen />);
    const input = getByTestId(assistantTestIDs.chatInput);
    const sendBtn = getByTestId(assistantTestIDs.sendButton);

    fireEvent.changeText(input, 'سؤال');
    act(() => { fireEvent.press(sendBtn); });

    await waitFor(() => {
      expect(queryByText(/assistant:chat\.loading/)).not.toBeNull();
    });

    await act(async () => { resolve(okResponse); });
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

    fireEvent.changeText(input, 'راسل المزود');
    await act(async () => {
      fireEvent.press(sendBtn);
    });

    await waitFor(() => {
      expect(getByTestId(assistantTestIDs.composeDeepLink)).toBeTruthy();
    });
  });
});
