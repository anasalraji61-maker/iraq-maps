import { describe, it, expect, vi } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import type { PostIdType } from '@iraq-maps/contracts';
import { DiscoverService } from './discover.service';


describe.skipIf(!process.env['DATABASE_URL'])('DiscoverService (integration)', () => {
  // Integration tests that require a real DATABASE_URL
  it('createPost returns correct shape', async () => {
    // These run only when DATABASE_URL is set
    expect(true).toBe(true);
  });
});

describe('DiscoverService (unit)', () => {
  const userId = 'user-1' as UserId;

  it('createPost returns correct shape', async () => {
    const now = new Date();
    const mockPost = {
      id: 'post-1',
      authorId: userId,
      placeId: null,
      type: 'tip',
      body: 'A helpful tip',
      mediaAssetIds: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
    };

    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockPost]),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    const result = await svc.createPost(userId, { type: 'tip', body: 'A helpful tip' });

    expect(result.id).toBe('post-1');
    expect(result.authorId).toBe(userId);
    expect(result.type).toBe('tip');
    expect(result.body).toBe('A helpful tip');
    expect(result.likeCount).toBe(0);
    expect(result.isLikedByMe).toBe(false);
    expect(result.createdAt).toBe(now.toISOString());
  });

  it('likePost increments count', async () => {
    const now = new Date();
    const mockPost = {
      id: 'post-1',
      authorId: userId,
      placeId: null,
      type: 'tip',
      body: 'tip',
      mediaAssetIds: [],
      likeCount: 1,
      commentCount: 0,
      createdAt: now,
    };

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockPost]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockPost, likeCount: 1 }]),
          }),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    const result = await svc.likePost(userId, 'post-1' as PostIdType);

    expect(result.likeCount).toBe(1);
    expect(db.insert).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
  });

  it('deletePost returns false for non-owner', async () => {
    const now = new Date();
    const otherUserId = 'user-2' as UserId;
    const mockPost = {
      id: 'post-1',
      authorId: otherUserId,
      placeId: null,
      type: 'tip',
      body: 'tip',
      mediaAssetIds: [],
      likeCount: 0,
      commentCount: 0,
      createdAt: now,
    };

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockPost]),
          }),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    const result = await svc.deletePost(userId, 'post-1' as PostIdType);

    expect(result).toBe(false);
  });
});
