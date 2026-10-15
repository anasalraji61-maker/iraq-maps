import { InquiryId, UserId, PlaceId, type Inquiry } from '@iraq-maps/contracts';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '@iraq-maps/mobile-kit/testing';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, waitFor } from '@testing-library/react-native';
import type { useMessagingApi as UseMessagingApi } from '../messaging-api';
import { ProviderInboxScreen } from '../screens/ProviderInboxScreen';
import { ProviderDashboardScreen } from '../screens/ProviderDashboardScreen';

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

describe('ProviderDashboardScreen', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('shows skeleton while loading', async () => {
    let resolveMe!: (v: unknown) => void;
    const pendingMe = new Promise((res) => { resolveMe = res; });
    // Build an api where providers.me never resolves during render so loading stays true
    const api = {
      providers: { me: jest.fn(() => pendingMe) },
      discover: { listFeed: jest.fn(async () => ({ status: 200, body: { items: [], nextCursor: undefined } })) },
    };
    const session = {
      state: { status: 'signedIn' as const, user: { id: UserId.parse('22222222-2222-2222-2222-222222222222'), name: 'Test', locale: 'ar' as const, roles: ['user'] as never[], createdAt: '2026-01-01T00:00:00.000Z' } },
      signIn: jest.fn(async () => {}),
      updateUser: jest.fn(),
      signOut: jest.fn(async () => {}),
    };
    const view = await renderWithProviders(<ProviderDashboardScreen />, { api: api as never, session, locale: 'ar' });
    const skeleton = view.getByTestId('skeleton-dashboard');
    expect(skeleton).toBeTruthy();
    await act(async () => {
      resolveMe({ status: 200, body: { status: 'verified' } });
      await Promise.resolve();
    });
  });
});

describe('ProviderDashboardScreen — completeness bar', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('renders completeness bar when provider data loads', async () => {
    const api = {
      providers: {
        me: jest.fn(async () => ({
          status: 200,
          body: {
            id: 'p1',
            status: 'verified',
            name: 'Test Biz',
            category: 'food',
            location: null,
            phone: null,
            claimedPlaceId: null,
            hoursRaw: null,
            prices: [],
            links: [],
            photos: [],
            consents: [],
            suspensionReason: null,
          },
        })),
      },
      discover: { listFeed: jest.fn(async () => ({ status: 200, body: { items: [], nextCursor: undefined } })) },
    };
    mockApi();
    const session = {
      state: { status: 'signedIn' as const, user: { id: UserId.parse('22222222-2222-2222-2222-222222222222'), name: 'Test', locale: 'ar' as const, roles: ['user'] as never[], createdAt: '2026-01-01T00:00:00.000Z' } },
      signIn: jest.fn(async () => {}),
      updateUser: jest.fn(),
      signOut: jest.fn(async () => {}),
    };
    const view = await renderWithProviders(<ProviderDashboardScreen />, { api: api as never, session, locale: 'ar' });
    await waitFor(() => expect(view.queryByTestId('provider-completeness')).toBeTruthy());
  });
});

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

describe('ProviderDashboardScreen — view public page', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('shows view public page button when claimedPlaceId is set', async () => {
    const CLAIMED_ID = PlaceId.parse('claimed-place-001');
    const api = {
      providers: {
        me: jest.fn(async () => ({
          status: 200,
          body: {
            id: 'p1',
            status: 'verified',
            name: 'Test Biz',
            category: 'food',
            location: null,
            phone: null,
            claimedPlaceId: CLAIMED_ID,
            hoursRaw: null,
            prices: [],
            links: [],
            photos: [],
            consents: [],
            suspensionReason: null,
          },
        })),
      },
      discover: { listFeed: jest.fn(async () => ({ status: 200, body: { items: [], nextCursor: undefined } })) },
    };
    mockApi();
    const session = {
      state: { status: 'signedIn' as const, user: { id: UserId.parse('22222222-2222-2222-2222-222222222222'), name: 'Test', locale: 'ar' as const, roles: ['user'] as never[], createdAt: '2026-01-01T00:00:00.000Z' } },
      signIn: jest.fn(async () => {}),
      updateUser: jest.fn(),
      signOut: jest.fn(async () => {}),
    };
    await renderWithProviders(<ProviderDashboardScreen />, { api: api as never, session, locale: 'ar' });
    await waitFor(() => expect(screen.getByTestId('provider.viewPublicPage')).toBeTruthy());
  });

  it('hides view public page button when claimedPlaceId is null', async () => {
    const api = {
      providers: {
        me: jest.fn(async () => ({
          status: 200,
          body: {
            id: 'p1',
            status: 'verified',
            name: 'Test Biz',
            category: 'food',
            location: null,
            phone: null,
            claimedPlaceId: null,
            hoursRaw: null,
            prices: [],
            links: [],
            photos: [],
            consents: [],
            suspensionReason: null,
          },
        })),
      },
      discover: { listFeed: jest.fn(async () => ({ status: 200, body: { items: [], nextCursor: undefined } })) },
    };
    mockApi();
    const session = {
      state: { status: 'signedIn' as const, user: { id: UserId.parse('22222222-2222-2222-2222-222222222222'), name: 'Test', locale: 'ar' as const, roles: ['user'] as never[], createdAt: '2026-01-01T00:00:00.000Z' } },
      signIn: jest.fn(async () => {}),
      updateUser: jest.fn(),
      signOut: jest.fn(async () => {}),
    };
    await renderWithProviders(<ProviderDashboardScreen />, { api: api as never, session, locale: 'ar' });
    await waitFor(() => expect(screen.queryByTestId('provider.viewPublicPage')).toBeNull());
  });
});
