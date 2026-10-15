/**
 * DiscoverService — unit tests for analytics endpoints:
 * trendingHashtags, getUserStats, getPostStats, recommended
 */
import { describe, it, expect, vi } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import type { PostIdType } from '@iraq-maps/contracts';
import { DiscoverService } from './discover.service';

const userId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' as UserId;
const postId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' as PostIdType;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          catch: vi.fn().mockResolvedValue(undefined),
          returning: vi.fn().mockResolvedValue([]),
        }),
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
          catch: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
  } as unknown as import('@iraq-maps/db-kit').Db;
}

// ---------------------------------------------------------------------------
// trendingHashtags
// ---------------------------------------------------------------------------

describe('DiscoverService.trendingHashtags (unit)', () => {
  it('returns empty array when no hashtags', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    const svc = new DiscoverService(db);
    const result = await svc.trendingHashtags(10);
    expect(result).toEqual([]);
    expect(db.execute).toHaveBeenCalled();
  });

  it('maps rows to hashtag/count shape', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        { hashtag: 'food', cnt: '5' },
        { hashtag: 'baghdad', cnt: '3' },
      ],
    });
    const svc = new DiscoverService(db);
    const result = await svc.trendingHashtags(10);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ hashtag: 'food', count: 5 });
    expect(result[1]).toEqual({ hashtag: 'baghdad', count: 3 });
  });

  it('converts cnt string to number', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ hashtag: 'iraq', cnt: '42' }],
    });
    const svc = new DiscoverService(db);
    const result = await svc.trendingHashtags(5);
    expect(typeof result[0]!.count).toBe('number');
    expect(result[0]!.count).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// getUserStats
// ---------------------------------------------------------------------------

describe('DiscoverService.getUserStats (unit)', () => {
  it('returns zeros when user has no posts', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ post_count: '0', total_likes: '0' }] })
      .mockResolvedValueOnce({ rows: [{ followers_count: '0', following_count: '0' }] });
    const svc = new DiscoverService(db);
    const result = await svc.getUserStats(userId);
    expect(result.postCount).toBe(0);
    expect(result.totalLikes).toBe(0);
    expect(result.followersCount).toBe(0);
    expect(result.followingCount).toBe(0);
  });

  it('returns correct counts', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [{ post_count: '7', total_likes: '23' }] })
      .mockResolvedValueOnce({ rows: [{ followers_count: '12', following_count: '5' }] });
    const svc = new DiscoverService(db);
    const result = await svc.getUserStats(userId);
    expect(result.postCount).toBe(7);
    expect(result.totalLikes).toBe(23);
    expect(result.followersCount).toBe(12);
    expect(result.followingCount).toBe(5);
  });

  it('handles missing rows gracefully (defaults to 0)', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const svc = new DiscoverService(db);
    const result = await svc.getUserStats(userId);
    expect(result.postCount).toBe(0);
    expect(result.totalLikes).toBe(0);
    expect(result.followersCount).toBe(0);
    expect(result.followingCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getPostStats (view tracking)
// ---------------------------------------------------------------------------

describe('DiscoverService.getPostStats (unit)', () => {
  it('returns view/like/comment counts for a post', async () => {
    const now = new Date();
    const mockPost = {
      id: postId,
      authorId: userId,
      placeId: null,
      type: 'tip',
      category: null,
      body: 'test body',
      mediaAssetIds: [],
      likeCount: 4,
      commentCount: 2,
      viewCount: 10,
      createdAt: now,
      removedAt: null,
    };

    const db = makeDb();
    // getPostOrThrow calls select().from().where().limit()
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockPost]),
        }),
      }),
    });

    // insert for post_view
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          catch: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    // execute for unique count
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ cnt: '3' }],
    });

    const svc = new DiscoverService(db);
    const result = await svc.getPostStats(userId, postId);
    expect(result.likeCount).toBe(4);
    expect(result.commentCount).toBe(2);
    expect(result.uniqueViewerCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// recommended — delegates SQL to execute()
// ---------------------------------------------------------------------------

describe('DiscoverService.recommended (unit)', () => {
  it('returns empty items when no posts match', async () => {
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const svc = new DiscoverService(db);
    const result = await svc.recommended(userId);
    expect(result.items).toEqual([]);
  });

  it('maps raw rows to post shape', async () => {
    const now = new Date();
    const db = makeDb();
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [
        {
          id: postId,
          author_id: userId,
          place_id: null,
          type: 'tip',
          category: null,
          body: 'Recommended post',
          media_asset_ids: [],
          like_count: 1,
          comment_count: 0,
          view_count: 5,
          created_at: now,
          removed_at: null,
        },
      ],
    });
    // For likes lookup: select().from().where() must resolve to an array
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const svc = new DiscoverService(db);
    const result = await svc.recommended(userId);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.body).toBe('Recommended post');
    expect(result.items[0]!.isLikedByMe).toBe(false);
  });
});
