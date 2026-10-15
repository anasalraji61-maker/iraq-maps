/**
 * Unit tests for useSavedPosts hook.
 * AsyncStorage is mocked in test/setup.ts.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DiscoverPostType, PostIdType, UserId } from '@iraq-maps/contracts';
import { useSavedPosts } from './useSavedPosts';

const mockGet = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;
const mockSet = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

function makePost(id: string, createdAt = '2026-10-15T12:00:00.000Z'): DiscoverPostType {
  return {
    id: id as PostIdType,
    authorId: '00000000-0000-0000-0000-000000000001' as UserId,
    type: 'photo',
    body: 'Test post',
    mediaAssetIds: [],
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    isLikedByMe: false,
    authorVerified: false,
    createdAt,
    bookmarkCount: 0,
    mentionedUserIds: [],
    isPinned: false,
  };
}

describe('useSavedPosts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue(undefined);
  });

  it('starts with empty saved set when storage is empty', async () => {
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    expect(hook.result.current.savedIds.size).toBe(0);
    expect(hook.result.current.savedPosts).toHaveLength(0);
    hook.unmount();
  });

  it('loads previously saved posts from storage', async () => {
    const post = makePost('post-1');
    mockGet.mockResolvedValue(JSON.stringify({ 'post-1': post }));
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    expect(hook.result.current.isSaved('post-1')).toBe(true);
    hook.unmount();
  });

  it('isSaved returns false for unsaved post', async () => {
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    expect(hook.result.current.isSaved('not-saved')).toBe(false);
    hook.unmount();
  });

  it('toggleSave adds a new post', async () => {
    const post = makePost('post-2');
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    await act(async () => { await hook.result.current.toggleSave(post); });
    expect(hook.result.current.isSaved('post-2')).toBe(true);
    hook.unmount();
  });

  it('toggleSave removes an already saved post', async () => {
    const post = makePost('post-3');
    mockGet.mockResolvedValue(JSON.stringify({ 'post-3': post }));
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    await act(async () => { await hook.result.current.toggleSave(post); });
    expect(hook.result.current.isSaved('post-3')).toBe(false);
    hook.unmount();
  });

  it('savedPosts sorted by createdAt descending', async () => {
    const post1 = makePost('post-a', '2026-10-14T12:00:00.000Z');
    const post2 = makePost('post-b', '2026-10-15T12:00:00.000Z');
    mockGet.mockResolvedValue(JSON.stringify({ 'post-a': post1, 'post-b': post2 }));
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    expect(hook.result.current.savedPosts[0]?.id).toBe('post-b');
    hook.unmount();
  });

  it('persists to storage on save', async () => {
    const post = makePost('post-persist');
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    await act(async () => { await hook.result.current.toggleSave(post); });
    await act(async () => {});
    expect(mockSet).toHaveBeenCalled();
    hook.unmount();
  });

  it('handles storage read errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('storage failure'));
    const hook = await renderHook(() => useSavedPosts());
    await act(async () => {});
    expect(hook.result.current.savedIds.size).toBe(0);
    hook.unmount();
  });
});
