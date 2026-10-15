/**
 * Tests for ActivityScreen: tab rendering, empty states, and route removal persistence.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import type { RecentRoute, SavedPlace } from '@iraq-maps/mobile-kit';

// ─── Module-level mock holders (must be named mock* for jest babel hoisting) ─

const mockRemoveRoute = jest.fn<(a?: unknown, b?: unknown) => Promise<void>>().mockResolvedValue(undefined);
const mockRemoveSaved = jest.fn<(a?: unknown) => Promise<void>>().mockResolvedValue(undefined);
const mockListRoutes = jest.fn<() => Promise<RecentRoute[]>>();
const mockListSaved = jest.fn<() => Promise<SavedPlace[]>>();
const mockListFeed = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockDeletePost = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockUpdatePost = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockListNotifications = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockMarkRead = jest.fn<(a?: unknown) => Promise<unknown>>();
const mockListInquiries = jest.fn<(a?: unknown) => Promise<unknown>>();

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@iraq-maps/mobile-kit', () => {
  // Stable object refs prevent useCallback dep-array churn and infinite re-renders
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
      user: { id: 'user-uuid', name: 'Test', locale: 'ar', roles: [], createdAt: '2024-01-01T00:00:00.000Z' },
    },
    signIn: jest.fn(),
    signOut: jest.fn(),
  };
  return {
    recentRoutes: {
      list: () => mockListRoutes(),
      remove: (a: unknown, b: unknown) => mockRemoveRoute(a, b),
    },
    savedPlaces: {
      list: () => mockListSaved(),
      remove: (a: unknown) => mockRemoveSaved(a),
    },
    useApi: () => _api,
    useSession: () => _session,
  };
});

jest.mock('./messagingClient', () => ({
  useActivityMessagingClient: () => ({
    listInquiries: (a: unknown) => mockListInquiries(a),
  }),
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string, params?: Record<string, string | number>) => {
    if (params?.n !== undefined) return String(params.n);
    return _key.split(':').pop() ?? _key;
  },
  getLocale: () => 'ar',
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRoute(placeId: string): RecentRoute {
  return {
    placeId: placeId as RecentRoute['placeId'],
    mode: 'car',
    name: `Place ${placeId}`,
    distanceM: 1000,
    durationS: 60,
    at: new Date().toISOString(),
  };
}

interface NotifItem {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  data?: Record<string, string>;
}

function makeNotification(id: string): NotifItem {
  return {
    id,
    title: `Notification ${id}`,
    body: `Body ${id}`,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import { ActivityScreen } from './ActivityScreen';

describe('ActivityScreen', () => {
  beforeEach(() => {
    mockListRoutes.mockResolvedValue([]);
    mockListSaved.mockResolvedValue([]);
    mockListFeed.mockResolvedValue({ status: 200, body: { items: [], nextCursor: undefined } });
    mockDeletePost.mockResolvedValue({ status: 204, body: undefined });
    mockUpdatePost.mockResolvedValue({ status: 200, body: { id: 'post-uuid-1', body: 'Updated body', authorId: 'user-uuid', type: 'tip', mediaAssetIds: [], likeCount: 0, commentCount: 0, isLikedByMe: false, createdAt: new Date().toISOString() } });
    mockListNotifications.mockResolvedValue({ status: 200, body: { items: [], nextCursor: undefined } });
    mockMarkRead.mockResolvedValue({ status: 204, body: undefined });
    mockListInquiries.mockResolvedValue({ status: 200, body: { items: [] } });
  });

  it('shows notifications tab by default with empty state', async () => {
    const { getByText } = await render(<ActivityScreen />);
    await waitFor(() => {
      expect(getByText('empty')).toBeTruthy();
    });
  });

  it('renders routes tab and shows empty state when no routes', async () => {
    const { getByText } = await render(<ActivityScreen />);
    const routesTab = getByText('tabRoutes');
    await act(async () => { fireEvent.press(routesTab); });
    await waitFor(() => {
      expect(getByText('emptyRoutes')).toBeTruthy();
    });
  });

  it('renders a route row and calls remove on press', async () => {
    mockListRoutes.mockResolvedValue([makeRoute('place-abc')]);
    const { getByText, getByLabelText } = await render(<ActivityScreen />);
    const routesTab = getByText('tabRoutes');
    await act(async () => { fireEvent.press(routesTab); });
    await waitFor(() => {
      expect(getByText('Place place-abc')).toBeTruthy();
    });
    const removeBtn = getByLabelText('removeRoute');
    await act(async () => { fireEvent.press(removeBtn); });
    expect(mockRemoveRoute).toHaveBeenCalledWith('place-abc', 'car');
  });

  it('notifications tab shows notification items', async () => {
    mockListNotifications.mockResolvedValue({ status: 200, body: { items: [makeNotification('n1')], nextCursor: undefined } });
    const { getByText } = await render(<ActivityScreen />);
    await waitFor(() => {
      expect(getByText('Notification n1')).toBeTruthy();
    });
  });

  it('posts tab shows my posts with a delete button', async () => {
    const myPost = {
      id: 'post-uuid-1',
      authorId: 'user-uuid',
      type: 'tip',
      body: 'Test post body',
      mediaAssetIds: [],
      likeCount: 3,
      commentCount: 1,
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
    };
    mockListFeed.mockResolvedValue({ status: 200, body: { items: [myPost] } });
    const { getByText, getByLabelText } = await render(<ActivityScreen />);
    const postsTab = getByText('tabPosts');
    await act(async () => { fireEvent.press(postsTab); });
    await waitFor(() => {
      expect(getByText('Test post body')).toBeTruthy();
    });
    // Delete and edit buttons are rendered for each post
    expect(getByLabelText('deletePost')).toBeTruthy();
    expect(getByLabelText('editPost')).toBeTruthy();
  });

  it('posts tab shows edit button that opens edit modal', async () => {
    const myPost = {
      id: 'post-uuid-2',
      authorId: 'user-uuid',
      type: 'tip',
      body: 'Original post body',
      mediaAssetIds: [],
      likeCount: 0,
      commentCount: 0,
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
    };
    mockListFeed.mockResolvedValue({ status: 200, body: { items: [myPost] } });
    const { getByText, getByLabelText } = await render(<ActivityScreen />);
    const postsTab = getByText('tabPosts');
    await act(async () => { fireEvent.press(postsTab); });
    await waitFor(() => expect(getByText('Original post body')).toBeTruthy());
    const editBtn = getByLabelText('editPost');
    await act(async () => { fireEvent.press(editBtn); });
    // Edit modal title should appear
    await waitFor(() => expect(getByText('editPostTitle')).toBeTruthy());
  });

  it('saved tab shows empty state when no saved places', async () => {
    const { getByText } = await render(<ActivityScreen />);
    const savedTab = getByText('tabSaved');
    await act(async () => { fireEvent.press(savedTab); });
    await waitFor(() => {
      expect(getByText('emptySaved')).toBeTruthy();
    });
  });

  it('inquiries tab shows empty state when no inquiries', async () => {
    mockListInquiries.mockResolvedValue({ status: 200, body: { items: [] } });
    const { getByText } = await render(<ActivityScreen />);
    const inquiriesTab = getByText('tabInquiries');
    await act(async () => { fireEvent.press(inquiriesTab); });
    await waitFor(() => {
      expect(getByText('emptyInquiries')).toBeTruthy();
    });
  });

  it('inquiries tab shows inquiry rows with status', async () => {
    const inquiry = {
      id: 'inq-1',
      userId: 'user-uuid',
      text: 'Hello can I book a table?',
      targets: [{ placeId: 'place-1', channel: 'in_app', status: 'replied', handoffLink: undefined }],
      createdAt: new Date().toISOString(),
    };
    mockListInquiries.mockResolvedValue({ status: 200, body: { items: [inquiry] } });
    const { getByText } = await render(<ActivityScreen />);
    const inquiriesTab = getByText('tabInquiries');
    await act(async () => { fireEvent.press(inquiriesTab); });
    await waitFor(() => {
      expect(getByText('Hello can I book a table?')).toBeTruthy();
    });
  });
});
