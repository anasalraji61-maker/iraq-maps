import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserPostsScreen } from './screens/UserPostsScreen';
import { PostId, UserId } from '@iraq-maps/contracts';
import type { DiscoverPostType } from '@iraq-maps/contracts';

// AsyncStorage is mocked in test setup
const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

const mockUserPosts = jest.fn<() => Promise<unknown>>();

// Stable client object — new object on every call would change `api` dependency
// in loadPosts useCallback and trigger infinite re-renders.
const mockDiscoverClient = {
  userPosts: mockUserPosts,
  listFeed: jest.fn(),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  createPost: jest.fn(),
  createComment: jest.fn(),
  listComments: jest.fn(),
  deletePost: jest.fn(),
  reportPost: jest.fn(),
  searchPosts: jest.fn(),
};

jest.mock('./client', () => ({
  useDiscoverClient: () => mockDiscoverClient,
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
  useApi: () => ({ places: { get: jest.fn() } }),
  useSession: () => ({ state: { status: 'signedIn', user: { id: 'user-own-id' } } }),
  useHaptics: () => ({ tap: jest.fn(), light: jest.fn() }),
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

const AUTHOR_ID = 'author-abc-001';
const OWN_AUTHOR_ID = 'user-own-id';

const makePost = (overrides: Partial<DiscoverPostType> = {}): DiscoverPostType => ({
  id: PostId.parse('eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'),
  authorId: UserId.parse('ffffffff-ffff-4fff-ffff-ffffffffffff'),
  type: 'tip',
  body: 'نصيحة مفيدة للزوار',
  mediaAssetIds: [],
  likeCount: 5,
  commentCount: 2,
  viewCount: 0,
  isLikedByMe: false,
  authorVerified: false,
  createdAt: '2024-04-01T00:00:00Z',
  bookmarkCount: 0,
  mentionedUserIds: [],
  isPinned: false,
  ...overrides,
});

const makeUserPostsResponse = (posts: DiscoverPostType[] = [makePost()]) => ({
  status: 200 as const,
  body: { items: posts, nextCursor: undefined },
  headers: new Headers(),
});

describe('UserPostsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockUserPosts.mockResolvedValue(makeUserPostsResponse());

    const routerMock = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');
    routerMock.useLocalSearchParams.mockReturnValue({ authorId: AUTHOR_ID });
  });

  it('renders skeleton cards while loading', async () => {
    let resolveUserPosts!: (v: unknown) => void;
    mockUserPosts.mockReturnValue(new Promise((res) => { resolveUserPosts = res; }));

    const { getAllByTestId } = await render(<UserPostsScreen />);
    expect(getAllByTestId('skeleton-user-post').length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolveUserPosts(makeUserPostsResponse());
      await Promise.resolve();
    });
  });

  it('renders a post after loading', async () => {
    const { getByText } = await render(<UserPostsScreen />);
    await waitFor(() => expect(getByText('نصيحة مفيدة للزوار')).toBeTruthy());
  });

  it('shows empty state when no posts returned', async () => {
    mockUserPosts.mockResolvedValue(makeUserPostsResponse([]));
    const { getByText } = await render(<UserPostsScreen />);
    await waitFor(() => expect(getByText(/userPosts.empty/)).toBeTruthy());
  });

  it('calls userPosts with the authorId param', async () => {
    await render(<UserPostsScreen />);
    await waitFor(() => {
      expect(mockUserPosts).toHaveBeenCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ authorId: AUTHOR_ID }) }),
      );
    });
  });

  it('shows pin button only on own profile', async () => {
    const routerMock = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');
    routerMock.useLocalSearchParams.mockReturnValue({ authorId: OWN_AUTHOR_ID });

    const ownPost = makePost({
      id: PostId.parse('11111111-1111-4111-1111-111111111111'),
      authorId: UserId.parse('ffffffff-ffff-4fff-ffff-ffffffffffff'),
    });
    mockUserPosts.mockResolvedValue(makeUserPostsResponse([ownPost]));

    const { getAllByText } = await render(<UserPostsScreen />);
    await waitFor(() => {
      // pin emoji is rendered when isOwnProfile=true
      expect(getAllByText('📍').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not show pin button on another user profile', async () => {
    const { queryByText } = await render(<UserPostsScreen />);
    await waitFor(() => expect(queryByText('📍')).toBeNull());
  });

  it('shows follow button when viewing another user', async () => {
    // follow button is in the header — wait for posts to load first so the component is settled
    const { getByText } = await render(<UserPostsScreen />);
    await waitFor(() => expect(getByText('نصيحة مفيدة للزوار')).toBeTruthy());
    // The follow button uses t('follow.follow') or t('follow.following')
    // t() from ../strings prefixes with 'discover:' namespace
    expect(getByText('discover:follow.follow')).toBeTruthy();
  });
});
