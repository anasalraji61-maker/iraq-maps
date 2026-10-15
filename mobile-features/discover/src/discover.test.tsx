import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { ActionSheetIOS } from 'react-native';
import { discoverTestIDs } from '@iraq-maps/contracts';
import { DiscoverFeedScreen } from './screens/DiscoverFeedScreen';

const mockListFeed = jest.fn<() => Promise<unknown>>();
const mockLikePost = jest.fn<() => Promise<unknown>>();
const mockUnlikePost = jest.fn<() => Promise<unknown>>();
const mockReportPost = jest.fn<() => Promise<unknown>>();

jest.mock('./client', () => ({
  useDiscoverClient: () => ({
    listFeed: mockListFeed,
    likePost: mockLikePost,
    unlikePost: mockUnlikePost,
    createPost: jest.fn(),
    createComment: jest.fn(),
    listComments: jest.fn(),
    deletePost: jest.fn(),
    reportPost: mockReportPost,
  }),
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
  useApi: () => ({
    places: {
      get: jest.fn<() => Promise<unknown>>().mockResolvedValue({ status: 404 }),
    },
  }),
  useSession: () => ({ state: { status: 'signedIn', user: { id: 'user-001' } } }),
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key,
}));

jest.mock('@iraq-maps/ui', () => ({
  useTheme: () => ({
    background: '#F5F5F5',
    surface: '#FFFFFF',
    primary: '#1976D2',
    text: '#222222',
    textSecondary: '#666666',
    border: '#E0E0E0',
    error: '#C62828',
    success: '#388E3C',
  }),
}));

const POST_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

const makeFeedResponse = (isLikedByMe = false) => ({
  status: 200 as const,
  body: {
    items: [
      {
        id: POST_ID,
        authorId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        type: 'tip' as const,
        body: 'نصيحة مفيدة للزوار',
        mediaAssetIds: [] as string[],
        likeCount: 5,
        commentCount: 2,
        isLikedByMe,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ],
    nextCursor: undefined,
  },
  headers: new Headers(),
});

describe('DiscoverFeedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListFeed.mockResolvedValue(makeFeedResponse());
    mockLikePost.mockResolvedValue({ status: 200, body: { likeCount: 6 }, headers: new Headers() });
    mockUnlikePost.mockResolvedValue({ status: 200, body: { likeCount: 4 }, headers: new Headers() });
    mockReportPost.mockResolvedValue({ status: 204, body: undefined, headers: new Headers() });
  });

  it('renders feed with posts', async () => {
    const { getByTestId } = await render(<DiscoverFeedScreen />);

    await waitFor(() => {
      expect(getByTestId(discoverTestIDs.feedItem(POST_ID))).toBeTruthy();
    });
  });

  it('like button calls like API', async () => {
    const { getByTestId } = await render(<DiscoverFeedScreen />);

    await waitFor(() => {
      expect(getByTestId(discoverTestIDs.likeButton(POST_ID))).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId(discoverTestIDs.likeButton(POST_ID)));
    });

    await waitFor(() => {
      expect(mockLikePost).toHaveBeenCalledTimes(1);
    });
  });

  it('create post button is visible', async () => {
    const { getByTestId } = await render(<DiscoverFeedScreen />);
    expect(getByTestId(discoverTestIDs.createPostButton)).toBeTruthy();
  });

  it('more button is visible on other users posts', async () => {
    // Post author is bbbb…, current user is user-001 — different, so report button should appear
    const { getByLabelText, getByTestId } = await render(<DiscoverFeedScreen />);
    await waitFor(() => {
      expect(getByTestId(discoverTestIDs.feedItem(POST_ID))).toBeTruthy();
    });
    // The "more options" button (⋯) should be accessible
    expect(getByLabelText(/post.more/)).toBeTruthy();
  });

  it('pressing a report reason calls reportPost API', async () => {
    // In the RNTL environment Platform.OS is 'ios', so the code uses
    // ActionSheetIOS.showActionSheetWithOptions. We intercept that and
    // immediately invoke the callback with index 0 (first report reason).
    const actionSheetSpy = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(
      (_options, callback) => { callback(0); },
    );

    const { getByLabelText, getByTestId } = await render(<DiscoverFeedScreen />);

    await waitFor(() => {
      expect(getByTestId(discoverTestIDs.feedItem(POST_ID))).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByLabelText(/post.more/));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReportPost).toHaveBeenCalledTimes(1);
    });

    actionSheetSpy.mockRestore();
  });
});
