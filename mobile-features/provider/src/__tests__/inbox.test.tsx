import { messagingTestIDs, InquiryId, UserId, PlaceId, type Inquiry } from '@iraq-maps/contracts';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import type { useMessagingApi as UseMessagingApi } from '../messaging-api';
import { ProviderInboxDetailScreen } from '../screens/ProviderInboxDetailScreen';
import { ProviderInboxScreen } from '../screens/ProviderInboxScreen';

jest.mock('../messaging-api', () => ({ useMessagingApi: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn(), replace: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.spyOn(Alert, 'alert');

const mockedUseMessagingApi = jest.requireMock<{ useMessagingApi: jest.MockedFunction<typeof UseMessagingApi> }>('../messaging-api').useMessagingApi;
const mockedUseLocalSearchParams = jest.mocked(useLocalSearchParams);

const INQUIRY_ID = InquiryId.parse('11111111-1111-1111-1111-111111111111');
const USER_ID = UserId.parse('22222222-2222-2222-2222-222222222222');
const PLACE_ID = PlaceId.parse('place-abc');

const makeInquiry = (overrides?: Partial<Inquiry>): Inquiry => ({
  id: INQUIRY_ID,
  userId: USER_ID,
  text: 'هل المطعم مفتوح الآن؟',
  targets: [{ placeId: PLACE_ID, channel: 'in_app', status: 'queued' }],
  createdAt: '2026-10-14T10:00:00.000Z',
  ...overrides,
});

function mockApi(overrides?: object) {
  const api = {
    listProviderInquiries: jest.fn(async () => ({ status: 200, body: { items: [makeInquiry()], nextCursor: undefined } })),
    getInquiry: jest.fn(async () => ({ status: 200, body: makeInquiry() })),
    replyToInquiry: jest.fn(async () => ({ status: 200, body: { ok: true as const } })),
    optOut: jest.fn(async () => ({ status: 200, body: { ok: true as const } })),
    ...overrides,
  };
  mockedUseMessagingApi.mockReturnValue(api as never);
  return api;
}

describe('ProviderInboxScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders list of inquiries', async () => {
    const api = mockApi();
    const view = await renderWithProviders(<ProviderInboxScreen />);
    await waitFor(() => expect(api.listProviderInquiries).toHaveBeenCalled());
    await waitFor(() => expect(view.getByTestId(messagingTestIDs.inboxItem(INQUIRY_ID))).toBeTruthy());
  });

  it('shows empty state when no messages', async () => {
    mockApi({ listProviderInquiries: jest.fn(async () => ({ status: 200, body: { items: [], nextCursor: undefined } })) });
    const view = await renderWithProviders(<ProviderInboxScreen />);
    await waitFor(() => expect(view.getByText(/لا توجد رسائل/)).toBeTruthy());
  });
});

describe('ProviderInboxDetailScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('sends reply and calls API', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    const api = mockApi();
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => expect(view.getByText('هل المطعم مفتوح الآن؟')).toBeTruthy());

    fireEvent.changeText(view.getByTestId(messagingTestIDs.replyInput), 'نعم متاح');
    await waitFor(() => expect(view.getByTestId('provider.inbox.reply.send')).not.toBeDisabled());
    fireEvent.press(view.getByTestId('provider.inbox.reply.send'));

    await waitFor(() =>
      expect(api.replyToInquiry).toHaveBeenCalledWith({
        params: { id: INQUIRY_ID },
        body: { text: 'نعم متاح' },
      }),
    );
    await waitFor(() => expect(view.getByText('نعم متاح')).toBeTruthy());
  });

  it('opt-out shows confirmation alert', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    mockApi();
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => expect(view.getByText('هل المطعم مفتوح الآن؟')).toBeTruthy());

    fireEvent.press(view.getByTestId(messagingTestIDs.optOutButton));

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ style: 'destructive' })]),
    );
  });

  it('does not show phone number in any text', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    mockApi();
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => expect(view.getByText('هل المطعم مفتوح الآن؟')).toBeTruthy());

    // The rendered output must not contain any phone number pattern.
    expect(view.queryByText(/0\d{9,}/)).toBeNull();
  });
});
