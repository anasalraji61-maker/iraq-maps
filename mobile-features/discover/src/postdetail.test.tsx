import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, act, waitFor } from '@testing-library/react-native';
import { PostDetailScreen } from './screens/PostDetailScreen';
import { PostId, UserId } from '@iraq-maps/contracts';
import type { DiscoverPostType } from '@iraq-maps/contracts';

const mockGetPost = jest.fn<() => Promise<unknown>>();
const mockListComments = jest.fn<() => Promise<unknown>>();
const mockCreateComment = jest.fn<() => Promise<unknown>>();

// Stable client object
const mockDiscoverClient = {
  getPost: mockGetPost,
  listComments: mockListComments,
  createComment: mockCreateComment,
  listFeed: jest.fn(),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
  deleteComment: jest.fn(),
  reportPost: jest.fn(),
  searchPosts: jest.fn(),
  userPosts: jest.fn(),
};

jest.mock('./client', () => ({
  useDiscoverClient: () => mockDiscoverClient,
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
  useApi: () => ({
    places: { get: jest.fn() },
    media: { readUrl: jest.fn<() => Promise<unknown>>().mockResolvedValue({ status: 404 }) },
  }),
  useSession: () => ({ state: { status: 'signedIn', user: { id: 'user-session-id' } } }),
  useHaptics: () => ({ tap: jest.fn(), light: jest.fn() }),
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key,
}));

jest.mock('@iraq-maps/ui', () => ({
  useTheme: () => ({
    background: '#F5F5F5', surface: '#FFFFFF', primary: '#1976D2',
    text: '#222222', textSecondary: '#666666', border: '#E0E0E0',
    error: '#C62828', success: '#388E3C',
  }),
  ZoomableImage: 'Image',
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const POST_ID = PostId.parse('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');

const mockPost: DiscoverPostType = {
  id: POST_ID,
  authorId: UserId.parse('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  type: 'tip',
  body: 'محتوى مقالة تفصيلية',
  mediaAssetIds: [],
  likeCount: 10,
  commentCount: 2,
  viewCount: 5,
  isLikedByMe: false,
  authorVerified: false,
  createdAt: '2024-06-01T00:00:00Z',
};

const makeComment = (id = 'comment-001') => ({
  id,
  postId: POST_ID,
  authorId: 'commenter-id',
  body: 'تعليق على المقالة',
  createdAt: '2024-06-02T00:00:00Z',
  likeCount: 0,
  isLikedByMe: false,
});

const makePostResponse = () => ({
  status: 200 as const,
  body: mockPost,
  headers: new Headers(),
});

const makeCommentsResponse = (comments = [makeComment()]) => ({
  status: 200 as const,
  body: { items: comments, nextCursor: undefined },
  headers: new Headers(),
});

describe('PostDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPost.mockResolvedValue(makePostResponse());
    mockListComments.mockResolvedValue(makeCommentsResponse());
    mockCreateComment.mockResolvedValue({
      status: 201 as const,
      body: makeComment('comment-new'),
      headers: new Headers(),
    });

    const routerMock = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');
    routerMock.useLocalSearchParams.mockReturnValue({ postId: POST_ID });
  });

  it('renders skeleton while loading', async () => {
    let resolveGet!: (v: unknown) => void;
    mockGetPost.mockReturnValue(new Promise((res) => { resolveGet = res; }));
    mockListComments.mockReturnValue(new Promise(() => {}));

    const { getAllByTestId } = await render(<PostDetailScreen />);
    expect(getAllByTestId('skeleton-post-detail').length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolveGet(makePostResponse());
      await Promise.resolve();
    });
  });

  it('renders post body after loading', async () => {
    const { getByText } = await render(<PostDetailScreen />);
    await waitFor(() => expect(getByText('محتوى مقالة تفصيلية')).toBeTruthy());
  });

  it('renders comments after loading', async () => {
    const { getByText } = await render(<PostDetailScreen />);
    await waitFor(() => expect(getByText('تعليق على المقالة')).toBeTruthy());
  });

  it('shows empty state when no comments', async () => {
    mockListComments.mockResolvedValue(makeCommentsResponse([]));
    const { getByText } = await render(<PostDetailScreen />);
    await waitFor(() => {
      // post body loads
      expect(getByText('محتوى مقالة تفصيلية')).toBeTruthy();
      // empty comments message
      expect(getByText(/comments.empty/)).toBeTruthy();
    });
  });

  it('shows error state on load failure', async () => {
    mockGetPost.mockRejectedValue(new Error('network'));
    mockListComments.mockRejectedValue(new Error('network'));
    const { getByText } = await render(<PostDetailScreen />);
    await waitFor(() => expect(getByText(/postDetail.loadError/)).toBeTruthy());
  });

  it('uses postJson param to skip getPost fetch', async () => {
    const routerMock = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');
    routerMock.useLocalSearchParams.mockReturnValue({
      postId: POST_ID,
      postJson: JSON.stringify(mockPost),
    });

    const { getByText } = await render(<PostDetailScreen />);
    await waitFor(() => expect(getByText('محتوى مقالة تفصيلية')).toBeTruthy());
    // getPost should not have been called when postJson is provided
    expect(mockGetPost).not.toHaveBeenCalled();
  });
});
