import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavedPostsScreen } from './screens/SavedPostsScreen';
import { PostId, UserId } from '@iraq-maps/contracts';
import type { DiscoverPostType } from '@iraq-maps/contracts';

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  t: (_key: string) => _key,
}));

// AsyncStorage is mocked in test/setup.ts
const mockGetItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

const mockPost: DiscoverPostType = {
  id: PostId.parse('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),
  authorId: UserId.parse('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'),
  type: 'tip',
  body: 'نصيحة مهمة محفوظة',
  mediaAssetIds: [],
  likeCount: 7,
  commentCount: 3,
  viewCount: 0,
  isLikedByMe: false,
  authorVerified: false,
  createdAt: '2024-03-01T00:00:00Z',
  bookmarkCount: 0,
  mentionedUserIds: [],
};

describe('SavedPostsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
  });

  it('shows skeleton while loading', async () => {
    let resolveGet!: (v: string | null) => void;
    mockGetItem.mockReturnValue(new Promise<string | null>((res) => { resolveGet = res; }));

    const { getAllByTestId } = await render(<SavedPostsScreen />);
    expect(getAllByTestId('skeleton-saved-post').length).toBeGreaterThanOrEqual(1);

    await act(async () => { resolveGet(null); await Promise.resolve(); });
  });

  it('shows empty state when no saved posts', async () => {
    const { getByText } = await render(<SavedPostsScreen />);
    await waitFor(() => expect(getByText(/saved.empty/)).toBeTruthy());
  });

  it('renders a saved post', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ [mockPost.id]: mockPost }));
    const { getByText } = await render(<SavedPostsScreen />);
    await waitFor(() => expect(getByText('نصيحة مهمة محفوظة')).toBeTruthy());
  });

  it('unsave button removes the post', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ [mockPost.id]: mockPost }));
    const { getByText, queryByText } = await render(<SavedPostsScreen />);
    await waitFor(() => expect(getByText('نصيحة مهمة محفوظة')).toBeTruthy());

    const removeBtn = getByText(/saved.remove/);
    await act(async () => {
      fireEvent.press(removeBtn);
      await Promise.resolve();
    });

    await waitFor(() => expect(queryByText('نصيحة مهمة محفوظة')).toBeNull());
  });
});
