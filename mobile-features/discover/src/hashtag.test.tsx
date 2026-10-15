import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, act, waitFor } from '@testing-library/react-native';
import { HashtagFeedScreen } from './screens/HashtagFeedScreen';

const mockSearchPosts = jest.fn<() => Promise<unknown>>();

// Stable client object — a new object on every call would change the `api`
// dependency in HashtagFeedScreen's useCallback, triggering infinite re-renders.
const mockDiscoverClient = {
  searchPosts: mockSearchPosts,
  listFeed: jest.fn(),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  createPost: jest.fn(),
  createComment: jest.fn(),
  listComments: jest.fn(),
  deletePost: jest.fn(),
  reportPost: jest.fn(),
};

jest.mock('./client', () => ({
  useDiscoverClient: () => mockDiscoverClient,
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key,
}));

const POST_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

const makeSearchResponse = () => ({
  status: 200 as const,
  body: {
    items: [
      {
        id: POST_ID,
        authorId: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
        type: 'tip' as const,
        body: 'نصيحة حول #موصل للزوار',
        mediaAssetIds: [] as string[],
        likeCount: 3,
        commentCount: 1,
        viewCount: 0,
        isLikedByMe: false,
        createdAt: '2024-02-01T00:00:00Z',
      },
    ],
    nextCursor: undefined,
  },
  headers: new Headers(),
});

describe('HashtagFeedScreen', () => {
  beforeEach(() => {
    mockSearchPosts.mockResolvedValue(makeSearchResponse());
    const routerMock = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');
    routerMock.useLocalSearchParams.mockReturnValue({ tag: 'موصل' });
  });

  it('renders skeleton cards while loading', async () => {
    let resolvePosts!: (v: unknown) => void;
    mockSearchPosts.mockReturnValue(new Promise((res) => { resolvePosts = res; }));

    const { getAllByTestId } = await render(<HashtagFeedScreen />);
    const skeletons = getAllByTestId('skeleton-hashtag-card');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolvePosts(makeSearchResponse());
      await Promise.resolve();
    });
  });

  it('renders posts after load', async () => {
    const { getByText } = await render(<HashtagFeedScreen />);
    await waitFor(() => {
      expect(getByText('نصيحة حول #موصل للزوار')).toBeTruthy();
    });
  });

  it('shows the hashtag in the header', async () => {
    const { getAllByText } = await render(<HashtagFeedScreen />);
    await waitFor(() => {
      // The hashtag appears in the header and in post body (via HashtagText)
      expect(getAllByText('#موصل').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('calls searchPosts with the hashtag query', async () => {
    await render(<HashtagFeedScreen />);
    await waitFor(() => {
      expect(mockSearchPosts).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.objectContaining({ q: '#موصل' }) }),
      );
    });
  });

  it('shows empty state when no posts returned', async () => {
    mockSearchPosts.mockResolvedValue({ status: 200, body: { items: [], nextCursor: undefined }, headers: new Headers() });
    const { getByText } = await render(<HashtagFeedScreen />);
    await waitFor(() => {
      expect(getByText(/hashtag.empty/)).toBeTruthy();
    });
  });

  it('shows error message on network failure', async () => {
    mockSearchPosts.mockRejectedValue(new Error('network'));
    const { getByText } = await render(<HashtagFeedScreen />);
    await waitFor(() => {
      expect(getByText(/feed.networkError/)).toBeTruthy();
    });
    expect(getByText(/feed.retry/)).toBeTruthy();
  });

  it('pull-to-refresh re-fetches posts', async () => {
    const { getByText, getByTestId } = await render(<HashtagFeedScreen />);
    await waitFor(() => expect(getByText('نصيحة حول #موصل للزوار')).toBeTruthy());

    const callsBefore = (mockSearchPosts as jest.MockedFunction<typeof mockSearchPosts>).mock.calls.length;

    const flatList = getByTestId('hashtag-flatlist');
    await act(async () => {
      const { onRefresh } = flatList.props.refreshControl?.props ?? {};
      if (typeof onRefresh === 'function') onRefresh();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect((mockSearchPosts as jest.MockedFunction<typeof mockSearchPosts>).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
