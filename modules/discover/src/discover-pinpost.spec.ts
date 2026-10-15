/**
 * Tests for DiscoverService.pinPost and deleteComment (soft-delete).
 */
import { describe, it, expect, vi } from 'vitest';
import type { UserId, PostIdType } from '@iraq-maps/contracts';
import type { CommentId } from '@iraq-maps/contracts';
type CommentIdType = import('zod').z.infer<typeof CommentId>;
import { NotFoundException } from '@nestjs/common';
import { DiscoverService } from './discover.service.js';

const userId = 'user-1' as UserId;
const postId = 'post-1' as PostIdType;
const commentId = 'comment-1' as CommentIdType;

function makePost(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: postId,
    authorId: userId,
    placeId: null,
    type: 'tip',
    body: 'Test post',
    mediaAssetIds: [],
    likeCount: 0,
    commentCount: 1,
    isPinned: false,
    removedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeComment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: commentId,
    postId,
    authorId: userId,
    body: 'A comment',
    removedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('DiscoverService.pinPost (unit)', () => {
  it('throws NotFoundException when post does not exist', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    await expect(svc.pinPost(userId, postId, true)).rejects.toThrow(NotFoundException);
  });

  it('returns null when caller is not the author (no permission)', async () => {
    const otherUser = 'user-other' as UserId;
    const post = makePost({ authorId: otherUser });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([post]) }),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    const result = await svc.pinPost(userId, postId, true);
    expect(result).toBeNull();
  });

  it('returns updated post shape when pinning succeeds', async () => {
    const post = makePost();
    const updatedPost = { ...post, isPinned: true };

    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([post]) }),
      }),
    });
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([updatedPost]) }),
      }),
    });

    const db = { select: selectMock, update: updateMock } as unknown as import('@iraq-maps/db-kit').Db;
    const svc = new DiscoverService(db);
    const result = await svc.pinPost(userId, postId, true);
    expect(result).not.toBeNull();
    expect(result!.isPinned).toBe(true);
  });
});

describe('DiscoverService.deleteComment (unit)', () => {
  it('throws NotFoundException when comment does not exist', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    await expect(svc.deleteComment(userId, commentId)).rejects.toThrow(NotFoundException);
  });

  it('returns false when caller is not the comment author', async () => {
    const comment = makeComment({ authorId: 'user-other' as UserId });

    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([comment]) }),
        }),
      }),
    } as unknown as import('@iraq-maps/db-kit').Db;

    const svc = new DiscoverService(db);
    const result = await svc.deleteComment(userId, commentId);
    expect(result).toBe(false);
  });
});
