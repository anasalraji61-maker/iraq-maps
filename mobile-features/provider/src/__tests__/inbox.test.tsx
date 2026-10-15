import { messagingTestIDs, InquiryId, UserId, PlaceId, type Inquiry } from '@iraq-maps/contracts';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
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

  it('shows markAllRead button when there are new items after refresh', async () => {
    // Initially all items are "read" (marked on first load).
    // After refresh, new items arrive and are unread → button appears.
    const INQUIRY_ID2 = InquiryId.parse('33333333-3333-3333-3333-333333333333');
    let callCount = 0;
    mockApi({
      listProviderInquiries: jest.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return { status: 200, body: { items: [makeInquiry()], nextCursor: undefined } };
        }
        return {
          status: 200,
          body: {
            items: [makeInquiry(), makeInquiry({ id: INQUIRY_ID2 })],
            nextCursor: undefined,
          },
        };
      }),
    });
    const view = await renderWithProviders(<ProviderInboxScreen />);
    await waitFor(() => expect(view.getByTestId(messagingTestIDs.inboxItem(INQUIRY_ID))).toBeTruthy());
    // No markAllRead button yet (all items read on first load)
    expect(view.queryByTestId('provider.inbox.markAllRead')).toBeNull();

    // Trigger refresh
    const list = view.getByTestId('provider-inbox-list');
    await act(async () => {
      list.props.refreshControl?.props?.onRefresh?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(view.queryByTestId('provider.inbox.markAllRead')).toBeTruthy());

    // Press mark all read — button disappears
    await act(async () => {
      fireEvent.press(view.getByTestId('provider.inbox.markAllRead'));
    });
    await waitFor(() => expect(view.queryByTestId('provider.inbox.markAllRead')).toBeNull());
  });

  it('shows skeleton rows while loading', async () => {
    let resolve!: (v: unknown) => void;
    mockApi({
      listProviderInquiries: jest.fn(() => new Promise((res) => { resolve = res; })),
    });
    const view = await renderWithProviders(<ProviderInboxScreen />);
    const skeletons = view.getAllByTestId('skeleton-inbox-row');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      resolve({ status: 200, body: { items: [], nextCursor: undefined } });
      await Promise.resolve();
    });
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

  it('re-fetches inquiry on pull-to-refresh', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    const api = mockApi();
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => expect(view.getByText('هل المطعم مفتوح الآن؟')).toBeTruthy());
    const callsBefore = api.getInquiry.mock.calls.length;
    const scrollView = view.getByTestId('provider-inbox-detail-scroll');
    await act(async () => {
      const { onRefresh } = scrollView.props.refreshControl?.props ?? {};
      if (typeof onRefresh === 'function') onRefresh();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(api.getInquiry.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('shows skeleton while inquiry is loading', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    let resolve!: (v: unknown) => void;
    mockApi({
      getInquiry: jest.fn(() => new Promise((res) => { resolve = res; })),
    });
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    expect(view.getByTestId('skeleton-inbox-detail')).toBeTruthy();
    await act(async () => {
      resolve({ status: 200, body: makeInquiry() });
      await Promise.resolve();
    });
  });

  it('quick reply chip fills the reply input', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    mockApi();
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => expect(view.getByText('هل المطعم مفتوح الآن؟')).toBeTruthy());

    // The "welcome" quick reply chip must be visible
    const chip = view.getByTestId('provider.quickReply.welcome');
    expect(chip).toBeTruthy();

    // Tap the chip and verify the reply TextInput is updated (value becomes non-empty)
    const inputBefore = view.getByTestId(messagingTestIDs.replyInput);
    expect(inputBefore.props.value).toBe('');

    fireEvent.press(chip);

    await waitFor(() => {
      const input = view.getByTestId(messagingTestIDs.replyInput);
      expect(input.props.value).not.toBe('');
    });
  });

  it('shows closed banner when inquiry is older than 7 days with no reply', async () => {
    const OLD_DATE = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    mockApi({
      getInquiry: jest.fn(async () => ({ status: 200, body: makeInquiry({ createdAt: OLD_DATE, text: 'سؤال قديم جداً' }) })),
    });
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => view.getByText('سؤال قديم جداً'));
    expect(view.getByTestId('provider-inquiry-closed-banner')).toBeTruthy();
  });

  it('does not show closed banner when inquiry is recent', async () => {
    mockedUseLocalSearchParams.mockReturnValue({ id: INQUIRY_ID });
    mockApi({
      getInquiry: jest.fn(async () => ({ status: 200, body: makeInquiry({ text: 'سؤال حديث جداً' }) })),
    });
    const view = await renderWithProviders(<ProviderInboxDetailScreen />);
    await waitFor(() => view.getByText('سؤال حديث جداً'));
    expect(view.queryByTestId('provider-inquiry-closed-banner')).toBeNull();
  });
});
