import { CommentId, PortTokens, type EventBus, type ProviderDirectoryPort, type UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { and, desc, eq, isNull, ilike, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { PostIdType } from '@iraq-maps/contracts';
import { z } from 'zod';
import { commentLikeTable, commentTable, postLikeTable, postReportTable, postTable, postViewTable } from './schema';

type CommentIdType = z.infer<typeof CommentId>;

const noopEventBus: EventBus = { publish: async () => {}, subscribe: () => () => {} };

@Injectable()
export class DiscoverService {
  constructor(
    @Inject('DISCOVER_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus = noopEventBus,
    @Optional() @Inject(PortTokens.ProviderDirectoryPort) private readonly providerDirectory: ProviderDirectoryPort | null = null,
  ) {}

  /** Returns a Set of userIds that are verified providers. Gracefully returns empty set on error. @M93 */
  private async verifiedAuthorIds(authorIds: UserId[]): Promise<Set<UserId>> {
    if (!this.providerDirectory || authorIds.length === 0) return new Set();
    const unique = [...new Set(authorIds)];
    try {
      const results = await Promise.all(unique.map((id) => this.providerDirectory!.isVerifiedProvider(id)));
      return new Set(unique.filter((_, i) => results[i]));
    } catch {
      return new Set();
    }
  }

  async listFeed(userId: UserId, cursor?: string, limit = 10, category?: string) {
    const rows = await this.db
      .select()
      .from(postTable)
      .where(and(
        isNull(postTable.removedAt),
        cursor ? lt(postTable.createdAt, new Date(cursor)) : undefined,
        category ? eq(postTable.category, category) : undefined,
      ))
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
    const verifiedSet = await this.verifiedAuthorIds(items.map((p) => p.authorId as UserId));

    return {
      items: items.map((p) => this.toPostShape(p, likedSet.has(p.id), verifiedSet.has(p.authorId as UserId))),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
    };
  }

  async createPost(
    userId: UserId,
    data: { type: string; category?: string; body: string; placeId?: string; mediaAssetIds?: string[] },
  ) {
    const [post] = await this.db
      .insert(postTable)
      .values({
        authorId: userId,
        placeId: data.placeId ?? null,
        type: data.type,
        category: data.category ?? null,
        body: data.body,
        mediaAssetIds: data.mediaAssetIds ?? [],
      })
      .returning();
    if (!post) throw new Error('insert failed');
    return this.toPostShape(post, false);
  }

  async getPost(userId: UserId, postId: PostIdType) {
    const [post] = await Promise.all([
      this.getPostOrThrow(postId),
      // Increment view count fire-and-forget — does not block response
      this.db.update(postTable)
        .set({ viewCount: sql`${postTable.viewCount} + 1` })
        .where(eq(postTable.id, postId))
        .catch(() => undefined),
    ]);
    const [like] = await this.db.select().from(postLikeTable)
      .where(and(eq(postLikeTable.postId, postId), eq(postLikeTable.userId, userId))).limit(1);
    return this.toPostShape({ ...post, viewCount: (post.viewCount ?? 0) + 1 }, !!like);
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

    // Fetch which comments the viewer has liked
    const commentIds = items.map((c) => c.id);
    const myLikes =
      commentIds.length > 0
        ? await this.db
            .select()
            .from(commentLikeTable)
            .where(and(eq(commentLikeTable.userId, userId), sql`${commentLikeTable.commentId} = ANY(${commentIds})`))
        : [];
    const likedSet = new Set(myLikes.map((l) => l.commentId));

    return {
      items: items.map((c) => this.toCommentShape(c, likedSet.has(c.id))),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
    };
  }

  async likeComment(userId: UserId, commentId: CommentIdType) {
    const [comment] = await this.db.select().from(commentTable).where(eq(commentTable.id, commentId)).limit(1);
    if (!comment) throw new NotFoundException({ code: 'not_found' });

    await this.db
      .insert(commentLikeTable)
      .values({ commentId, userId })
      .onConflictDoNothing();

    const [updated] = await this.db
      .update(commentTable)
      .set({ likeCount: sql`(SELECT COUNT(*) FROM discover.comment_like WHERE comment_id = ${commentId})` })
      .where(eq(commentTable.id, commentId))
      .returning({ likeCount: commentTable.likeCount });

    return { likeCount: updated?.likeCount ?? comment.likeCount };
  }

  async unlikeComment(userId: UserId, commentId: CommentIdType) {
    const [comment] = await this.db.select().from(commentTable).where(eq(commentTable.id, commentId)).limit(1);
    if (!comment) throw new NotFoundException({ code: 'not_found' });

    await this.db
      .delete(commentLikeTable)
      .where(and(eq(commentLikeTable.commentId, commentId), eq(commentLikeTable.userId, userId)));

    const [updated] = await this.db
      .update(commentTable)
      .set({ likeCount: sql`GREATEST(0, (SELECT COUNT(*) FROM discover.comment_like WHERE comment_id = ${commentId}))` })
      .where(eq(commentTable.id, commentId))
      .returning({ likeCount: commentTable.likeCount });

    return { likeCount: updated?.likeCount ?? 0 };
  }

  async createComment(userId: UserId, postId: PostIdType, body: string) {
    const post = await this.getPostOrThrow(postId);

    const [comment] = await this.db
      .insert(commentTable)
      .values({ postId, authorId: userId, body, likeCount: 0 })
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

    return this.toCommentShape(comment, false);
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

  async userPosts(viewerUserId: UserId, authorId: UserId, cursor?: string, limit = 10) {
    const rows = await this.db
      .select()
      .from(postTable)
      .where(
        and(
          isNull(postTable.removedAt),
          eq(postTable.authorId, authorId),
          cursor ? lt(postTable.createdAt, new Date(cursor)) : undefined,
        ),
      )
      .orderBy(desc(postTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

    const postIds = items.map((p) => p.id);
    const likes =
      postIds.length > 0
        ? await this.db
            .select()
            .from(postLikeTable)
            .where(and(eq(postLikeTable.userId, viewerUserId), sql`${postLikeTable.postId} = ANY(${postIds})`))
        : [];
    const likedSet = new Set(likes.map((l) => l.postId));

    return {
      items: items.map((p) => this.toPostShape(p, likedSet.has(p.id))),
      nextCursor: hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined,
    };
  }

  async trending(userId: UserId, limit = 10) {
    // Score = likeCount * 2 + commentCount, only from posts in last 48 hours
    const rows = await this.db
      .select()
      .from(postTable)
      .where(
        and(
          isNull(postTable.removedAt),
          sql`${postTable.createdAt} > NOW() - INTERVAL '48 hours'`,
        ),
      )
      .orderBy(sql`(${postTable.likeCount} * 2 + ${postTable.commentCount}) DESC, ${postTable.createdAt} DESC`)
      .limit(limit);

    const postIds = rows.map((p) => p.id);
    const likes =
      postIds.length > 0
        ? await this.db
            .select()
            .from(postLikeTable)
            .where(and(eq(postLikeTable.userId, userId), sql`${postLikeTable.postId} = ANY(${postIds})`))
        : [];
    const likedSet = new Set(likes.map((l) => l.postId));

    return { items: rows.map((p) => this.toPostShape(p, likedSet.has(p.id))) };
  }

  async searchPosts(userId: UserId, query: string, cursor?: string, limit = 10) {
    const rows = await this.db
      .select()
      .from(postTable)
      .where(
        and(
          isNull(postTable.removedAt),
          ilike(postTable.body, `%${query}%`),
          cursor ? lt(postTable.createdAt, new Date(cursor)) : undefined,
        ),
      )
      .orderBy(desc(postTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);

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

  /** Track a unique view and return post analytics stats. @M-analytics */
  async getPostStats(viewerId: string, postId: PostIdType, isAnon = false) {
    const post = await this.getPostOrThrow(postId);

    // Upsert view record (primary key ensures uniqueness per viewer)
    await this.db
      .insert(postViewTable)
      .values({ postId, viewerId, isAnon })
      .onConflictDoNothing()
      .catch(() => undefined);

    const [uniqueCount] = await this.db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::int AS cnt FROM discover.post_view WHERE post_id = ${postId}
    `).then((r) => r.rows);

    return {
      viewCount: post.viewCount ?? 0,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      uniqueViewerCount: Number(uniqueCount?.cnt ?? 0),
    };
  }

  /** Top hashtags extracted from post bodies in the last 24h. @M-trending */
  async trendingHashtags(limit = 10): Promise<Array<{ hashtag: string; count: number }>> {
    const rows = await this.db.execute<{ hashtag: string; cnt: string }>(sql`
      WITH words AS (
        SELECT regexp_matches(body, '#([A-Za-z0-9_؀-ۿ]+)', 'g') AS m
        FROM discover.post
        WHERE removed_at IS NULL
          AND created_at > NOW() - INTERVAL '24 hours'
      )
      SELECT lower(m[1]) AS hashtag, COUNT(*)::int AS cnt
      FROM words
      GROUP BY lower(m[1])
      ORDER BY cnt DESC, hashtag ASC
      LIMIT ${limit}
    `);
    return rows.rows.map((r) => ({ hashtag: r.hashtag, count: Number(r.cnt) }));
  }

  /** Aggregated stats for a user profile. @M-user-stats */
  async getUserStats(targetUserId: UserId) {
    const [stats] = await this.db.execute<{
      post_count: string;
      total_likes: string;
    }>(sql`
      SELECT COUNT(*)::int AS post_count,
             COALESCE(SUM(like_count), 0)::int AS total_likes
      FROM discover.post
      WHERE author_id = ${targetUserId} AND removed_at IS NULL
    `).then((r) => r.rows);

    const [followCounts] = await this.db.execute<{
      followers_count: string;
      following_count: string;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM discover.user_follow WHERE followee_id = ${targetUserId}) AS followers_count,
        (SELECT COUNT(*)::int FROM discover.user_follow WHERE follower_id = ${targetUserId}) AS following_count
    `).then((r) => r.rows);

    return {
      postCount: Number(stats?.post_count ?? 0),
      followersCount: Number(followCounts?.followers_count ?? 0),
      followingCount: Number(followCounts?.following_count ?? 0),
      totalLikes: Number(stats?.total_likes ?? 0),
    };
  }

  /** Personalised recommendations: followed-user posts + popular unseen posts. @M-recommendations */
  async recommended(userId: UserId, limit = 10) {
    // Get posts from followed users first, then popular posts
    const rows = await this.db.execute<{
      id: string; author_id: string; place_id: string | null; type: string;
      category: string | null; body: string; media_asset_ids: string[];
      like_count: number; comment_count: number; view_count: number;
      created_at: Date; removed_at: Date | null;
    }>(sql`
      SELECT DISTINCT ON (p.id) p.*
      FROM discover.post p
      LEFT JOIN discover.user_follow uf ON uf.followee_id = p.author_id AND uf.follower_id = ${userId}
      LEFT JOIN discover.post_view pv ON pv.post_id = p.id AND pv.viewer_id = ${userId}
      WHERE p.removed_at IS NULL
        AND pv.post_id IS NULL  -- not yet seen
        AND p.author_id != ${userId}
      ORDER BY p.id,
               (uf.followee_id IS NOT NULL) DESC,
               (p.like_count * 2 + p.comment_count) DESC,
               p.created_at DESC
      LIMIT ${limit}
    `);

    const items = rows.rows;
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
      items: items.map((p) => ({
        id: p.id as PostIdType,
        authorId: p.author_id as UserId,
        placeId: p.place_id ?? undefined,
        type: p.type as 'photo' | 'tip' | 'event' | 'offer',
        category: (p.category ?? undefined) as import('@iraq-maps/contracts').PostCategory | undefined,
        body: p.body,
        mediaAssetIds: p.media_asset_ids ?? [],
        likeCount: p.like_count,
        commentCount: p.comment_count,
        viewCount: p.view_count ?? 0,
        isLikedByMe: likedSet.has(p.id),
        authorVerified: false,
        createdAt: (p.created_at instanceof Date ? p.created_at : new Date(p.created_at)).toISOString(),
      })),
    };
  }

  /** Autocomplete: top 5 matching hashtags and user IDs. @M-autocomplete */
  async searchSuggestions(query: string): Promise<{ hashtags: string[]; userIds: UserId[] }> {
    const term = query.replace(/[^A-Za-z0-9_؀-ۿ]/g, '');
    if (!term) return { hashtags: [], userIds: [] };

    const hashtagRows = await this.db.execute<{ hashtag: string }>(sql`
      WITH words AS (
        SELECT regexp_matches(body, '#([A-Za-z0-9_؀-ۿ]+)', 'g') AS m
        FROM discover.post
        WHERE removed_at IS NULL
      )
      SELECT lower(m[1]) AS hashtag, COUNT(*) AS cnt
      FROM words
      WHERE lower(m[1]) LIKE ${`${term.toLowerCase()}%`}
      GROUP BY lower(m[1])
      ORDER BY cnt DESC
      LIMIT 5
    `);

    // Match userIds that appear as authors with matching prefix in body (best effort without user table)
    const userRows = await this.db.execute<{ author_id: string }>(sql`
      SELECT DISTINCT author_id
      FROM discover.post
      WHERE removed_at IS NULL
        AND body ILIKE ${`%@${term}%`}
      LIMIT 5
    `);

    return {
      hashtags: hashtagRows.rows.map((r) => r.hashtag),
      userIds: userRows.rows.map((r) => r.author_id as UserId),
    };
  }

  private async getPostOrThrow(postId: PostIdType) {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    return post;
  }

  private toPostShape(post: typeof postTable.$inferSelect, isLikedByMe: boolean, authorVerified = false) {
    return {
      id: post.id as PostIdType,
      authorId: post.authorId as UserId,
      placeId: post.placeId ?? undefined,
      type: post.type as 'photo' | 'tip' | 'event' | 'offer',
      category: (post.category ?? undefined) as import('@iraq-maps/contracts').PostCategory | undefined,
      body: post.body,
      mediaAssetIds: post.mediaAssetIds ?? [],
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      viewCount: post.viewCount ?? 0,
      isLikedByMe,
      authorVerified,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private toCommentShape(comment: typeof commentTable.$inferSelect, isLikedByMe = false) {
    return {
      id: comment.id as CommentIdType,
      postId: comment.postId as PostIdType,
      authorId: comment.authorId as UserId,
      body: comment.body,
      likeCount: comment.likeCount,
      isLikedByMe,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
