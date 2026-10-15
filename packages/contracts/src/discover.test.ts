/**
 * Unit tests for discover contract schemas: DiscoverPost, DiscoverComment, PostType, PostCategory.
 */
import { describe, expect, it } from 'vitest';
import { DiscoverPost, DiscoverComment, PostType, PostCategory } from './discover';

const VALID_POST = {
  id: '00000000-0000-0000-0000-000000000001',
  authorId: '00000000-0000-0000-0000-000000000002',
  type: 'photo',
  body: 'صورة من قلعة بغداد',
  mediaAssetIds: [],
  likeCount: 0,
  commentCount: 0,
  viewCount: 0,
  isLikedByMe: false,
  authorVerified: false,
  createdAt: '2026-10-15T12:00:00.000Z',
};

describe('PostType', () => {
  it('accepts photo', () => expect(PostType.parse('photo')).toBe('photo'));
  it('accepts tip', () => expect(PostType.parse('tip')).toBe('tip'));
  it('accepts event', () => expect(PostType.parse('event')).toBe('event'));
  it('accepts offer', () => expect(PostType.parse('offer')).toBe('offer'));
  it('rejects unknown type', () => expect(() => PostType.parse('story')).toThrow());
});

describe('PostCategory', () => {
  it('accepts food', () => expect(PostCategory.parse('food')).toBe('food'));
  it('accepts tourism', () => expect(PostCategory.parse('tourism')).toBe('tourism'));
  it('rejects unknown category', () => expect(() => PostCategory.parse('nightlife')).toThrow());
});

describe('DiscoverPost', () => {
  it('parses a valid post', () => {
    const p = DiscoverPost.parse(VALID_POST);
    expect(p.type).toBe('photo');
    expect(p.likeCount).toBe(0);
  });

  it('defaults likeCount/commentCount/viewCount/isLikedByMe/authorVerified', () => {
    const { likeCount: _lc, commentCount: _cc, viewCount: _vc, isLikedByMe: _ilm, authorVerified: _av, ...minimal } = VALID_POST;
    const p = DiscoverPost.parse(minimal);
    expect(p.likeCount).toBe(0);
    expect(p.isLikedByMe).toBe(false);
    expect(p.authorVerified).toBe(false);
  });

  it('rejects body over 1000 chars', () => {
    expect(() => DiscoverPost.parse({ ...VALID_POST, body: 'x'.repeat(1001) })).toThrow();
  });

  it('rejects more than 4 media asset IDs', () => {
    const ids = Array.from({ length: 5 }, (_, i) => `0000000${i}-0000-0000-0000-000000000000`);
    expect(() => DiscoverPost.parse({ ...VALID_POST, mediaAssetIds: ids })).toThrow();
  });

  it('accepts optional placeId', () => {
    const p = DiscoverPost.parse({ ...VALID_POST, placeId: 'n12345' });
    expect(p.placeId).toBe('n12345');
  });

  it('rejects invalid authorId (not a UUID)', () => {
    expect(() => DiscoverPost.parse({ ...VALID_POST, authorId: 'not-uuid' })).toThrow();
  });
});

describe('DiscoverComment', () => {
  const VALID_COMMENT = {
    id: '00000000-0000-0000-0000-000000000003',
    postId: '00000000-0000-0000-0000-000000000001',
    authorId: '00000000-0000-0000-0000-000000000002',
    body: 'رائع جداً!',
    likeCount: 0,
    isLikedByMe: false,
    createdAt: '2026-10-15T12:00:00.000Z',
  };

  it('parses a valid comment', () => {
    const c = DiscoverComment.parse(VALID_COMMENT);
    expect(c.body).toBe('رائع جداً!');
  });

  it('rejects body over 500 chars', () => {
    expect(() => DiscoverComment.parse({ ...VALID_COMMENT, body: 'x'.repeat(501) })).toThrow();
  });

  it('defaults likeCount and isLikedByMe', () => {
    const { likeCount: _lc, isLikedByMe: _ilm, ...minimal } = VALID_COMMENT;
    const c = DiscoverComment.parse(minimal);
    expect(c.likeCount).toBe(0);
    expect(c.isLikedByMe).toBe(false);
  });
});
