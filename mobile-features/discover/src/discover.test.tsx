import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { discoverTestIDs } from '@iraq-maps/contracts';
import { DiscoverFeedScreen } from './screens/DiscoverFeedScreen.js';

const mockListFeed = jest.fn<() => Promise<unknown>>();
const mockLikePost = jest.fn<() => Promise<unknown>>();
const mockUnlikePost = jest.fn<() => Promise<unknown>>();

jest.mock('./client.js', () => ({
  useDiscoverClient: () => ({
    listFeed: mockListFeed,
    likePost: mockLikePost,
    unlikePost: mockUnlikePost,
    createPost: jest.fn(),
    createComment: jest.fn(),
    listComments: jest.fn(),
    deletePost: jest.fn(),
  }),
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
}));

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key,
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
});
