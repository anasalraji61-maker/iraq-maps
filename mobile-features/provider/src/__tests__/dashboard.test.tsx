import { InquiryId, UserId, PlaceId, type Inquiry } from '@iraq-maps/contracts';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, waitFor } from '@testing-library/react-native';
import type { useMessagingApi as UseMessagingApi } from '../messaging-api';
import { ProviderInboxScreen } from '../screens/ProviderInboxScreen';

jest.mock('../messaging-api', () => ({ useMessagingApi: jest.fn() }));

const mockedUseMessagingApi = jest.requireMock<{ useMessagingApi: jest.MockedFunction<typeof UseMessagingApi> }>('../messaging-api').useMessagingApi;

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

describe('ProviderInboxScreen — pull-to-refresh', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('re-fetches inquiries on pull-to-refresh', async () => {
    const api = mockApi();
    const view = await renderWithProviders(<ProviderInboxScreen />);
    await waitFor(() => expect(api.listProviderInquiries).toHaveBeenCalled());
    const callsBefore = api.listProviderInquiries.mock.calls.length;

    const flatList = view.getByTestId('provider-inbox-list');
    await act(async () => {
      const { onRefresh } = flatList.props.refreshControl?.props ?? {};
      if (typeof onRefresh === 'function') onRefresh();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.listProviderInquiries.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
