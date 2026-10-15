import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { CommentsScreen } from './screens/CommentsScreen';

const mockListComments = jest.fn<() => Promise<unknown>>();
const mockCreateComment = jest.fn<() => Promise<unknown>>();
const mockDeleteComment = jest.fn<() => Promise<unknown>>();

// Stable client object — prevents infinite re-render in useCallback dependency array
const mockDiscoverClient = {
  listComments: mockListComments,
  createComment: mockCreateComment,
  deleteComment: mockDeleteComment,
  listFeed: jest.fn(),
  likePost: jest.fn(),
  unlikePost: jest.fn(),
  createPost: jest.fn(),
  deletePost: jest.fn(),
  reportPost: jest.fn(),
  searchPosts: jest.fn(),
  userPosts: jest.fn(),
};

jest.mock('./client', () => ({
  useDiscoverClient: () => mockDiscoverClient,
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApiBaseUrl: () => 'http://localhost:3000',
  useApi: () => ({ places: { get: jest.fn() } }),
  useSession: () => ({ state: { status: 'signedIn', user: { id: 'user-session-id' } } }),
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

const POST_ID = 'post-test-id-001';

const makeComment = (id = 'comment-001', authorId = 'user-abc') => ({
  id,
  postId: POST_ID,
  authorId,
  body: 'تعليق تجريبي مفيد',
  createdAt: '2024-05-01T00:00:00Z',
  likeCount: 0,
  isLikedByMe: false,
});

const makeListResponse = (comments = [makeComment()]) => ({
  status: 200 as const,
  body: { items: comments, nextCursor: undefined },
  headers: new Headers(),
});

describe('CommentsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListComments.mockResolvedValue(makeListResponse());
    mockCreateComment.mockResolvedValue({
      status: 201 as const,
      body: makeComment('comment-new', 'user-session-id'),
      headers: new Headers(),
    });
    mockDeleteComment.mockResolvedValue({ status: 204 as const, body: undefined, headers: new Headers() });

    const routerMock = jest.requireMock<{ useLocalSearchParams: jest.Mock }>('expo-router');
    routerMock.useLocalSearchParams.mockReturnValue({ postId: POST_ID });
  });

  it('renders skeleton rows while loading', async () => {
    let resolveList!: (v: unknown) => void;
    mockListComments.mockReturnValue(new Promise((res) => { resolveList = res; }));

    const { getAllByTestId } = await render(<CommentsScreen />);
    expect(getAllByTestId('skeleton-comment-row').length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      resolveList(makeListResponse());
      await Promise.resolve();
    });
  });

  it('renders a comment after loading', async () => {
    const { getByText } = await render(<CommentsScreen />);
    await waitFor(() => expect(getByText('تعليق تجريبي مفيد')).toBeTruthy());
  });

  it('shows empty state when no comments', async () => {
    mockListComments.mockResolvedValue(makeListResponse([]));
    const { getByText } = await render(<CommentsScreen />);
    await waitFor(() => expect(getByText(/comments.empty/)).toBeTruthy());
  });

  it('calls listComments with the postId param', async () => {
    await render(<CommentsScreen />);
    await waitFor(() => {
      expect(mockListComments).toHaveBeenCalledWith(
        expect.objectContaining({ params: expect.objectContaining({ postId: POST_ID }) }),
      );
    });
  });

  it('sends a new comment and appends it to the list', async () => {
    const { getByText, getByPlaceholderText } = await render(<CommentsScreen />);
    await waitFor(() => expect(getByText('تعليق تجريبي مفيد')).toBeTruthy());

    const input = getByPlaceholderText(/comments.placeholder/);
    await act(async () => {
      fireEvent.changeText(input, 'تعليق جديد');
    });

    const sendBtn = getByText(/comments.send/);
    await act(async () => {
      fireEvent.press(sendBtn);
      await Promise.resolve();
    });

    await waitFor(() => expect(mockCreateComment).toHaveBeenCalled());
  });

  it('shows error on load failure', async () => {
    mockListComments.mockRejectedValue(new Error('network'));
    const { getByText } = await render(<CommentsScreen />);
    await waitFor(() => expect(getByText(/comments.loadError/)).toBeTruthy());
  });
});
