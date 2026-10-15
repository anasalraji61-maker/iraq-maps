import { CommentId, PortTokens, type EventBus, type UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { PostIdType } from '@iraq-maps/contracts';
import { z } from 'zod';
import { commentTable, postLikeTable, postReportTable, postTable } from './schema';

type CommentIdType = z.infer<typeof CommentId>;

const noopEventBus: EventBus = { publish: async () => {}, subscribe: () => () => {} };

@Injectable()
export class DiscoverService {
  constructor(
    @Inject('DISCOVER_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus = noopEventBus,
  ) {}

  async listFeed(userId: UserId, cursor?: string, limit = 10) {
    const rows = await this.db
      .select()
      .from(postTable)
      .where(and(isNull(postTable.removedAt), cursor ? lt(postTable.createdAt, new Date(cursor)) : undefined))
      .orderBy(sql`${postTable.createdAt} DESC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    // Check which posts are liked by user
    const postIds = items.map((p) => p.id);
    const likes =
      postIds.length > 0
        ? await this.db
            .select()
            .from(postLikeTable)
            .where(and(eq(postLikeTable.userId, userId), sql`${postLikeTable.postId} = ANY(${postIds})`))
        : [];
    const likedSet = new Set(likes.map((l) => l.postId));

    return {
      items: items.map((p) => this.toPostShape(p, likedSet.has(p.id))),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
    };
  }

  async createPost(
    userId: UserId,
    data: { type: string; body: string; placeId?: string; mediaAssetIds?: string[] },
  ) {
    const [post] = await this.db
      .insert(postTable)
      .values({
        authorId: userId,
        placeId: data.placeId ?? null,
        type: data.type,
        body: data.body,
        mediaAssetIds: data.mediaAssetIds ?? [],
      })
      .returning();
    if (!post) throw new Error('insert failed');
    return this.toPostShape(post, false);
  }

  async likePost(userId: UserId, postId: PostIdType) {
    const post = await this.getPostOrThrow(postId);

    const inserted = await this.db
      .insert(postLikeTable)
      .values({ postId, userId })
      .onConflictDoNothing()
      .returning();

    // Re-compute count from table
    const [updated] = await this.db
      .update(postTable)
      .set({ likeCount: sql`(SELECT COUNT(*) FROM discover.post_like WHERE post_id = ${postId})` })
      .where(eq(postTable.id, postId))
      .returning();

    // Only notify on the first like (not on duplicate/idempotent calls)
    if (inserted.length > 0 && post.authorId !== userId) {
      await this.eventBus.publish({
        id: randomUUID(),
        name: 'discover.post.liked.v1',
        occurredAt: new Date().toISOString(),
        payload: { postId, postAuthorId: post.authorId as UserId, likedByUserId: userId },
      });
    }

    return { likeCount: updated?.likeCount ?? post.likeCount };
  }

  async unlikePost(userId: UserId, postId: PostIdType) {
    await this.getPostOrThrow(postId);

    await this.db
      .delete(postLikeTable)
      .where(and(eq(postLikeTable.postId, postId), eq(postLikeTable.userId, userId)));

    const [updated] = await this.db
      .update(postTable)
      .set({ likeCount: sql`GREATEST(0, (SELECT COUNT(*) FROM discover.post_like WHERE post_id = ${postId}))` })
      .where(eq(postTable.id, postId))
      .returning();

    return { likeCount: updated?.likeCount ?? 0 };
  }

  async listComments(userId: UserId, postId: PostIdType, cursor?: string, limit = 10) {
    void userId; // no per-user filtering on comments for now
    await this.getPostOrThrow(postId);

    const rows = await this.db
      .select()
      .from(commentTable)
      .where(
        cursor
          ? and(eq(commentTable.postId, postId), lt(commentTable.createdAt, new Date(cursor)))
          : eq(commentTable.postId, postId),
      )
      .orderBy(sql`${commentTable.createdAt} ASC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    return {
      items: items.map((c) => this.toCommentShape(c)),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
    };
  }

  async createComment(userId: UserId, postId: PostIdType, body: string) {
    const post = await this.getPostOrThrow(postId);

    const [comment] = await this.db
      .insert(commentTable)
      .values({ postId, authorId: userId, body })
      .returning();
    if (!comment) throw new Error('insert failed');

    await this.db
      .update(postTable)
      .set({ commentCount: sql`comment_count + 1` })
      .where(eq(postTable.id, postId));

    await this.eventBus.publish({
      id: randomUUID(),
      name: 'discover.post.commented.v1',
      occurredAt: new Date().toISOString(),
      payload: { postId, postAuthorId: post.authorId as UserId, commentedByUserId: userId },
    });

    return this.toCommentShape(comment);
  }

  async deleteComment(userId: UserId, commentId: CommentIdType): Promise<boolean> {
    const [comment] = await this.db.select().from(commentTable).where(eq(commentTable.id, commentId)).limit(1);
    if (!comment) throw new NotFoundException({ code: 'not_found' });
    if (comment.authorId !== userId) return false;
    await this.db.delete(commentTable).where(eq(commentTable.id, commentId));
    // Decrement comment count on the post
    await this.db
      .update(postTable)
      .set({ commentCount: sql`GREATEST(0, comment_count - 1)` })
      .where(eq(postTable.id, comment.postId as PostIdType));
    return true;
  }

  async updatePost(userId: UserId, postId: PostIdType, newBody: string): Promise<ReturnType<typeof this.toPostShape> | null> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    if (post.authorId !== userId) return null;

    const [updated] = await this.db
      .update(postTable)
      .set({ body: newBody })
      .where(eq(postTable.id, postId))
      .returning();
    if (!updated) throw new NotFoundException({ code: 'not_found' });
    return this.toPostShape(updated, false);
  }

  async deletePost(userId: UserId, postId: PostIdType): Promise<boolean> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    if (post.authorId !== userId) return false;

    await this.db.delete(postTable).where(eq(postTable.id, postId));
    return true;
  }

  async reportPost(userId: UserId, postId: PostIdType, reason: string): Promise<void> {
    await this.getPostOrThrow(postId);
    await this.db
      .insert(postReportTable)
      .values({ postId, reporterId: userId, reason })
      .onConflictDoNothing(); // idempotent: one report per user per post
  }

  async adminListReported() {
    const rows = await this.db.execute<{
      id: string; author_id: string; body: string; type: string;
      created_at: Date; removed_at: Date | null;
      report_count: number; reasons: string[];
    }>(sql`
      SELECT p.id, p.author_id, p.body, p.type, p.created_at, p.removed_at,
             COUNT(r.id)::int AS report_count,
             ARRAY_AGG(DISTINCT r.reason) FILTER (WHERE r.reason IS NOT NULL) AS reasons
      FROM discover.post p
      JOIN discover.post_report r ON r.post_id = p.id
      GROUP BY p.id
      ORDER BY report_count DESC, p.created_at DESC
    `);
    return rows.rows.map((r) => ({
      id: r.id as PostIdType,
      authorId: r.author_id as UserId,
      body: r.body,
      type: r.type as 'photo' | 'tip' | 'event' | 'offer',
      reportCount: r.report_count,
      reasons: r.reasons ?? [],
      createdAt: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
      removedAt: r.removed_at ? (r.removed_at instanceof Date ? r.removed_at : new Date(r.removed_at)).toISOString() : null,
    }));
  }

  async adminApprovePost(postId: PostIdType): Promise<void> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    await this.db.delete(postReportTable).where(eq(postReportTable.postId, postId));
  }

  async adminRemovePost(postId: PostIdType): Promise<void> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    await this.db.update(postTable).set({ removedAt: new Date() }).where(eq(postTable.id, postId));
  }

  private async getPostOrThrow(postId: PostIdType) {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    return post;
  }

  private toPostShape(post: typeof postTable.$inferSelect, isLikedByMe: boolean) {
    return {
      id: post.id as PostIdType,
      authorId: post.authorId as UserId,
      placeId: post.placeId ?? undefined,
      type: post.type as 'photo' | 'tip' | 'event' | 'offer',
      body: post.body,
      mediaAssetIds: post.mediaAssetIds ?? [],
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      isLikedByMe,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private toCommentShape(comment: typeof commentTable.$inferSelect) {
    return {
      id: comment.id as CommentIdType,
      postId: comment.postId as PostIdType,
      authorId: comment.authorId as UserId,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
