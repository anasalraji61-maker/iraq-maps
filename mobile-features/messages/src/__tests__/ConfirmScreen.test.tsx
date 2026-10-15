import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { fireEvent, act, waitFor } from '@testing-library/react-native';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { messagingTestIDs } from '@iraq-maps/contracts';

const mockCreateInquiry = jest.fn(async () => ({ status: 201, body: { id: 'inq1' } }));
jest.mock('../client', () => ({ useMessagingClient: () => ({ createInquiry: mockCreateInquiry }) }));

const mockEnqueue = jest.fn(async () => undefined);
const mockMarkSent = jest.fn(async () => undefined);

jest.mock('@iraq-maps/mobile-kit', () => ({
  InquiryOutbox: jest.fn().mockImplementation(() => ({
    enqueue: mockEnqueue,
    markSent: mockMarkSent,
    markFailed: jest.fn(async () => undefined),
  })),
  useAppRating: () => ({ onMessageSent: jest.fn(async () => undefined) }),
  useHaptics: () => ({ tap: jest.fn(), like: jest.fn(), sent: jest.fn(), fail: jest.fn(), light: jest.fn(), medium: jest.fn(), success: jest.fn(), error: jest.fn() }),
}));

const mockNetFetch = jest.fn(async () => ({ isConnected: true }));
jest.mock('../netinfo', () => ({
  fetchNetInfo: () => mockNetFetch(),
  addNetInfoListener: jest.fn(() => jest.fn()),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: jest.fn(() => ({ text: 'مرحبا', placeIds: 'place1,place2' })),
  Stack: { Screen: () => null },
}));

jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

describe('ConfirmScreen', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('shows channel badge per target', async () => {
    const view = await renderWithProviders(<ConfirmScreen />);
    expect(view.getByTestId(messagingTestIDs.channelBadge('place1'))).toBeTruthy();
    expect(view.getByTestId(messagingTestIDs.channelBadge('place2'))).toBeTruthy();
  });

  it('online: enqueues to outbox and calls API', async () => {
    mockNetFetch.mockResolvedValueOnce({ isConnected: true });
    const view = await renderWithProviders(<ConfirmScreen />);
    await act(async () => { fireEvent.press(view.getByTestId(messagingTestIDs.confirmSend)); });
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ text: 'مرحبا' })));
    expect(mockCreateInquiry).toHaveBeenCalled();
  });

  it('offline: enqueues to outbox, does not call API, shows offline message', async () => {
    mockNetFetch.mockResolvedValueOnce({ isConnected: false });
    const view = await renderWithProviders(<ConfirmScreen />);
    await act(async () => { fireEvent.press(view.getByTestId(messagingTestIDs.confirmSend)); });
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    expect(mockCreateInquiry).not.toHaveBeenCalled();
    expect(view.getByText('سيُرسَل عند عودة الإنترنت')).toBeTruthy();
  });
});
