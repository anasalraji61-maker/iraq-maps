/**
 * Tests for the topHashtags helper in DiscoverFeedScreen.
 */
import { describe, expect, it } from '@jest/globals';
import { topHashtags } from './screens/DiscoverFeedScreen';
import type { DiscoverPostType } from '@iraq-maps/contracts';

function makePost(body: string): DiscoverPostType {
  return {
    id: crypto.randomUUID() as DiscoverPostType['id'],
    authorId: 'user1' as DiscoverPostType['authorId'],
    type: 'tip',
    body,
    mediaAssetIds: [],
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    isLikedByMe: false,
    authorVerified: false,
    createdAt: new Date().toISOString(),
    bookmarkCount: 0,
    mentionedUserIds: [],
    isPinned: false,
  };
}

describe('topHashtags', () => {
  it('returns empty array for posts with no hashtags', () => {
    expect(topHashtags([makePost('hello world'), makePost('no tags')], 5)).toEqual([]);
  });

  it('returns top hashtags sorted by frequency', () => {
    const posts = [
      makePost('#food is great'),
      makePost('I love #food and #travel'),
      makePost('#travel to #iraq'),
      makePost('#food everywhere'),
    ];
    const result = topHashtags(posts, 3);
    expect(result[0]).toBe('#food');   // 3 occurrences
    expect(result[1]).toBe('#travel'); // 2 occurrences
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('respects n limit', () => {
    const posts = [makePost('#a #b #c #d #e #f')];
    expect(topHashtags(posts, 3)).toHaveLength(3);
  });

  it('is case-insensitive (normalises to lowercase)', () => {
    const posts = [makePost('#Food is tasty'), makePost('#FOOD is great')];
    const result = topHashtags(posts, 5);
    expect(result).toContain('#food');
    expect(result).not.toContain('#Food');
  });
});
