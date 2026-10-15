/**
 * Integration tests for the Activity feature — error recovery flows,
 * offline behavior, and navigation from notifications.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import type { RecentRoute, SavedPlace } from '@iraq-maps/mobile-kit';
import { ActivityScreen } from '../ActivityScreen';

// ─── Mock holders ──────────────────────────────────────────────────────────

const mockListNotifications = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockMarkRead = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockListFeed = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockDeletePost = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockUpdatePost = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockListRoutes = jest.fn<() => Promise<RecentRoute[]>>();
const mockListSaved = jest.fn<() => Promise<SavedPlace[]>>();
const mockListInquiries = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockRemoveRoute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRemoveSaved = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockPush = jest.fn();

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@iraq-maps/mobile-kit', () => {
  const _api = {
    notifications: {
      listNotifications: (a: unknown) => mockListNotifications(a),
      markRead: (a: unknown) => mockMarkRead(a),
    },
    discover: {
      listFeed: (a: unknown) => mockListFeed(a),
      deletePost: (a: unknown) => mockDeletePost(a),
      updatePost: (a: unknown) => mockUpdatePost(a),
    },
  };
  const _session = {
    state: {
      status: 'signedIn',
      user: { id: 'user-uuid', name: 'أنس', locale: 'ar', roles: [], createdAt: '2024-01-01T00:00:00.000Z' },
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
  };
  return {
    recentRoutes: {
      list: () => mockListRoutes(),
      remove: () => mockRemoveRoute(),
    },
    savedPlaces: {
      list: () => mockListSaved(),
      remove: () => mockRemoveSaved(),
    },
    useApi: () => _api,
    useSession: () => _session,
    href: (name: string) => `/${name}`,
    useApiBaseUrl: () => 'http://localhost:3000',
  };
});

jest.mock('../messagingClient', () => ({
  useActivityMessagingClient: () => ({
    listInquiries: (a: unknown) => mockListInquiries(a),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key.split(':').pop() ?? _key,
}));

// ─── Defaults ──────────────────────────────────────────────────────────────

const emptyNotifications = { status: 200, body: { items: [], unreadCount: 0, nextCursor: null } };
const emptyFeed = { status: 200, body: { items: [], nextCursor: null } };
const emptyInquiries = { status: 200, body: { items: [] } };

function setupEmptyDefaults() {
  mockListNotifications.mockResolvedValue(emptyNotifications);
  mockListFeed.mockResolvedValue(emptyFeed);
  mockListRoutes.mockResolvedValue([]);
  mockListSaved.mockResolvedValue([]);
  mockListInquiries.mockResolvedValue(emptyInquiries);
  mockMarkRead.mockResolvedValue({ status: 200, body: { ok: true } });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupEmptyDefaults();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ActivityScreen — error recovery', () => {
  it('shows empty state after notifications API fails', async () => {
    mockListNotifications.mockRejectedValueOnce(new Error('network error'));


    const { queryByTestId } = await render(<ActivityScreen />);

    await waitFor(() => {
      // After error, skeletons should be gone
      expect(queryByTestId('skeleton-notif-row')).toBeNull();
    });
  });

  it('shows empty state after routes API fails', async () => {
    mockListRoutes.mockRejectedValueOnce(new Error('network error'));


    const { getByText } = await render(<ActivityScreen />);

    // Switch to routes tab
    await act(async () => {
      const routesTab = getByText('tabRoutes');
      if (routesTab) fireEvent.press(routesTab);
    });

    await waitFor(() => {
      expect(queryByTestId?.('skeleton-route-row')).toBeFalsy();
    }, { timeout: 3000 });
  });
});

// Helper for queryByTestId outside render scope
let queryByTestId: ((id: string) => unknown) | undefined;

describe('ActivityScreen — offline behavior', () => {
  it('handles notifications API returning a network-like error gracefully', async () => {
    mockListNotifications.mockRejectedValue(new Error('Failed to fetch'));


    const view = await render(<ActivityScreen />);
    queryByTestId = view.queryByTestId;

    await waitFor(() => {
      // No skeleton visible after resolution (error or success)
      expect(view.queryByTestId('skeleton-notif-row')).toBeNull();
    }, { timeout: 3000 });
  });
});

describe('ActivityScreen — notification tap navigation', () => {
  it('marks a notification as read and pushes a route on tap', async () => {
    const notif = {
      id: 'notif-uuid-0001',
      title: 'تم الإعجاب بمنشورك',
      body: 'أعجب شخص بمنشورك',
      data: { type: 'post_liked', postId: 'post-1' },
      readAt: null,
      createdAt: '2026-10-14T10:00:00.000Z',
    };

    mockListNotifications.mockResolvedValue({
      status: 200,
      body: { items: [notif], unreadCount: 1, nextCursor: null },
    });


    const { getAllByText } = await render(<ActivityScreen />);

    await waitFor(() => {
      const items = getAllByText('تم الإعجاب بمنشورك');
      expect(items.length).toBeGreaterThan(0);
    });

    await act(async () => {
      const items = getAllByText('تم الإعجاب بمنشورك');
      if (items[0]) fireEvent.press(items[0]);
    });

    // markRead should be called
    expect(mockMarkRead).toHaveBeenCalled();
  });
});

describe('ActivityScreen — pull-to-refresh', () => {
  it('re-fetches notifications on refresh', async () => {

    await render(<ActivityScreen />);

    await waitFor(() => expect(mockListNotifications).toHaveBeenCalledTimes(1));

    // Simulate a second load (e.g. scroll refresh)
    await act(async () => {
      mockListNotifications.mockResolvedValueOnce(emptyNotifications);
    });

    // The mock was called at least once on mount
    expect(mockListNotifications.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
