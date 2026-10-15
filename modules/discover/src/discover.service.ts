import { CommentId, PortTokens, type EventBus, type ProviderDirectoryPort, type UserId } from '@iraq-maps/contracts';
import { writeAdminAuditLog, type Db } from '@iraq-maps/db-kit';
import { Inject, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, isNull, ilike, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { PostIdType } from '@iraq-maps/contracts';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { commentLikeTable, commentTable, postBookmarkTable, postEditHistoryTable, postLikeTable, postMentionTable, postReportTable, postTable, postViewTable, userFollowTable } from './schema';
import { WordFilter } from './word-filter';

type CommentIdType = z.infer<typeof CommentId>;

const noopEventBus: EventBus = { publish: async () => {}, subscribe: () => () => {} };

/** TTL constants for Redis cache keys (seconds). */
const CACHE_TTL = {
  FEED: 30,
  TRENDING: 300,
  POST: 3600,
} as const;

@Injectable()
export class DiscoverService {
  private readonly wordFilter: WordFilter;

  constructor(
    @Inject('DISCOVER_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus = noopEventBus,
    @Optional() @Inject(PortTokens.ProviderDirectoryPort) private readonly providerDirectory: ProviderDirectoryPort | null = null,
    @Optional() @Inject('WORD_FILTER_CONFIG_PATH') wordFilterConfigPath: string | null = null,
    @Optional() @Inject('DISCOVER_REDIS') private readonly redis: Redis | null = null,
  ) {
    this.wordFilter = new WordFilter(wordFilterConfigPath ?? undefined);
  }

  // ── Redis cache helpers ──────────────────────────────────────────────────────

  private async cacheGet<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // cache write failure is non-fatal
    }
  }

  private async cacheDel(...keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch {
      // cache delete failure is non-fatal
    }
  }

  private feedCacheKey(userId: UserId, cursor: string | undefined, limit: number, category: string | undefined) {
    return `discover:feed:${userId}:${cursor ?? ''}:${limit}:${category ?? ''}`;
  }
  private trendingCacheKey(limit: number) { return `discover:trending:${limit}`; }
  private postCacheKey(postId: PostIdType) { return `discover:post:${postId}`; }

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
    const cacheKey = this.feedCacheKey(userId, cursor, limit, category);
    const cached = await this.cacheGet<ReturnType<typeof this.toPostShape>[]>(cacheKey);
    if (cached !== null) {
      // Cached result carries the shaped posts; reconstruct the envelope
      const hasMore = (cached as unknown as { _hasMore?: boolean })['_hasMore'] ?? false;
      const nextCursor = (cached as unknown as { _nextCursor?: string })['_nextCursor'];
      return { items: cached, nextCursor, hasMore };
    }

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

    const shapedItems = items.map((p) => this.toPostShape(p, likedSet.has(p.id), verifiedSet.has(p.authorId as UserId)));
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt.toISOString() : undefined;

    // Cache the result; embed pagination metadata as hidden fields on the array object
    const cacheVal = Object.assign(shapedItems, { _hasMore: hasMore, _nextCursor: nextCursor });
    void this.cacheSet(this.feedCacheKey(userId, cursor, limit, category), cacheVal, CACHE_TTL.FEED);

    return { items: shapedItems, nextCursor };
  }

  async createPost(
    userId: UserId,
    data: { type: string; category?: string; body: string; placeId?: string; mediaAssetIds?: string[]; mentionedUserIds?: UserId[] },
  ) {
    const blocked = this.wordFilter.check(data.body);
    if (blocked) {
      throw new UnprocessableEntityException({ code: 'content_blocked', detail: 'Content contains a blocked word' });
    }
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

    // Store @mentions and fire notification events
    const mentionedIds = data.mentionedUserIds ?? [];
    if (mentionedIds.length > 0) {
      await this.db
        .insert(postMentionTable)
        .values(mentionedIds.map((mentionedUserId) => ({ postId: post.id, mentionedUserId })))
        .onConflictDoNothing();
      for (const mentionedUserId of mentionedIds) {
        if (mentionedUserId !== userId) {
          await this.eventBus.publish({
            id: randomUUID(),
            name: 'discover.post.mentioned.v1',
            occurredAt: new Date().toISOString(),
            payload: { postId: post.id as string, postAuthorId: userId, mentionedUserId },
          } as import('@iraq-maps/contracts').DomainEvent).catch(() => undefined);
        }
      }
    }

    // Invalidate feed and trending caches on new post
    void this.cacheDel(this.trendingCacheKey(10), this.trendingCacheKey(20));

    return this.toPostShape(post, false, false, mentionedIds);
  }

  async getPost(userId: UserId, postId: PostIdType) {
    const cacheKey = this.postCacheKey(postId);
    const cached = await this.cacheGet<ReturnType<typeof this.toPostShape>>(cacheKey);
    if (cached !== null) return cached;

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
    const shaped = this.toPostShape({ ...post, viewCount: (post.viewCount ?? 0) + 1 }, !!like);
    void this.cacheSet(cacheKey, shaped, CACHE_TTL.POST);
    return shaped;
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
    const blocked = this.wordFilter.check(body);
    if (blocked) {
      throw new UnprocessableEntityException({ code: 'content_blocked', detail: 'Content contains a blocked word' });
    }
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
    // Soft-delete: mark removedAt instead of deleting the row
    await this.db.update(commentTable).set({ removedAt: new Date() }).where(eq(commentTable.id, commentId));
    // Decrement comment count on the post
    await this.db
      .update(postTable)
      .set({ commentCount: sql`GREATEST(0, comment_count - 1)` })
      .where(eq(postTable.id, comment.postId as PostIdType));
    return true;
  }

  /** Pin or unpin a post for the given user. Only one post per author can be pinned at a time. */
  async pinPost(userId: UserId, postId: PostIdType, pinned: boolean): Promise<ReturnType<typeof this.toPostShape> | null> {
    const [post] = await this.db.select().from(postTable).where(and(eq(postTable.id, postId), isNull(postTable.removedAt))).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    if (post.authorId !== userId) return null; // caller interprets as 403

    if (pinned) {
      // Unpin all other posts by this author first (only one pinned at a time)
      await this.db.update(postTable).set({ isPinned: false }).where(and(eq(postTable.authorId, userId), eq(postTable.isPinned, true)));
    }

    const [updated] = await this.db
      .update(postTable)
      .set({ isPinned: pinned })
      .where(eq(postTable.id, postId))
      .returning();
    if (!updated) throw new NotFoundException({ code: 'not_found' });
    return this.toPostShape(updated, false);
  }

  async updatePost(userId: UserId, postId: PostIdType, newBody: string): Promise<ReturnType<typeof this.toPostShape> | null> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    if (post.authorId !== userId) return null;

    // Save previous body to edit history before overwriting
    await this.db.insert(postEditHistoryTable).values({ postId, previousBody: post.body });

    const [updated] = await this.db
      .update(postTable)
      .set({ body: newBody })
      .where(eq(postTable.id, postId))
      .returning();
    if (!updated) throw new NotFoundException({ code: 'not_found' });

    // Invalidate post cache on update
    void this.cacheDel(this.postCacheKey(postId));

    return this.toPostShape(updated, false);
  }

  async deletePost(userId: UserId, postId: PostIdType): Promise<boolean> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    if (post.authorId !== userId) return false;

    await this.db.delete(postTable).where(eq(postTable.id, postId));

    // Invalidate post cache and trending on delete
    void this.cacheDel(this.postCacheKey(postId), this.trendingCacheKey(10), this.trendingCacheKey(20));

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

  async adminApprovePost(postId: PostIdType, adminId?: UserId): Promise<void> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    await this.db.delete(postReportTable).where(eq(postReportTable.postId, postId));
    if (adminId) await writeAdminAuditLog(this.db, adminId, 'approve_report', postId, 'post').catch(() => undefined);
  }

  async adminRemovePost(postId: PostIdType, adminId?: UserId): Promise<void> {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    await this.db.update(postTable).set({ removedAt: new Date() }).where(eq(postTable.id, postId));
    if (adminId) await writeAdminAuditLog(this.db, adminId, 'remove_post', postId, 'post').catch(() => undefined);
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
    const cacheKey = this.trendingCacheKey(limit);
    const cached = await this.cacheGet<ReturnType<typeof this.toPostShape>[]>(cacheKey);
    if (cached !== null) return { items: cached };

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

    const items = rows.map((p) => this.toPostShape(p, likedSet.has(p.id)));
    void this.cacheSet(cacheKey, items, CACHE_TTL.TRENDING);
    return { items };
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

  /** Follow a user and send notification to them. */
  async followUser(followerId: UserId, followeeId: UserId): Promise<{ followersCount: number }> {
    await this.db
      .insert(userFollowTable)
      .values({ followerId, followeeId })
      .onConflictDoNothing();

    await this.eventBus.publish({
      id: randomUUID(),
      name: 'discover.user.followed.v1',
      occurredAt: new Date().toISOString(),
      payload: { followerId, followeeId },
    }).catch(() => undefined);

    const [row] = await this.db.execute<{ cnt: string }>(
      sql`SELECT COUNT(*)::int AS cnt FROM discover.user_follow WHERE followee_id = ${followeeId}`,
    ).then((r) => r.rows);
    return { followersCount: Number(row?.cnt ?? 0) };
  }

  /** Unfollow a user. */
  async unfollowUser(followerId: UserId, followeeId: UserId): Promise<{ followersCount: number }> {
    await this.db
      .delete(userFollowTable)
      .where(and(eq(userFollowTable.followerId, followerId), eq(userFollowTable.followeeId, followeeId)));

    const [row] = await this.db.execute<{ cnt: string }>(
      sql`SELECT COUNT(*)::int AS cnt FROM discover.user_follow WHERE followee_id = ${followeeId}`,
    ).then((r) => r.rows);
    return { followersCount: Number(row?.cnt ?? 0) };
  }

  /** Bookmark a post; increment bookmarkCount. */
  async bookmarkPost(userId: UserId, postId: PostIdType): Promise<{ bookmarkCount: number }> {
    await this.getPostOrThrow(postId);
    await this.db.insert(postBookmarkTable).values({ postId, userId }).onConflictDoNothing();
    const [updated] = await this.db
      .update(postTable)
      .set({ bookmarkCount: sql`(SELECT COUNT(*) FROM discover.post_bookmark WHERE post_id = ${postId})` })
      .where(eq(postTable.id, postId))
      .returning();
    return { bookmarkCount: updated?.bookmarkCount ?? 0 };
  }

  /** Unbookmark a post; decrement bookmarkCount. */
  async unbookmarkPost(userId: UserId, postId: PostIdType): Promise<{ bookmarkCount: number }> {
    await this.getPostOrThrow(postId);
    await this.db.delete(postBookmarkTable).where(and(eq(postBookmarkTable.postId, postId), eq(postBookmarkTable.userId, userId)));
    const [updated] = await this.db
      .update(postTable)
      .set({ bookmarkCount: sql`GREATEST(0, (SELECT COUNT(*) FROM discover.post_bookmark WHERE post_id = ${postId}))` })
      .where(eq(postTable.id, postId))
      .returning();
    return { bookmarkCount: updated?.bookmarkCount ?? 0 };
  }

  /** Get edit history for a post. */
  async getPostEdits(postId: PostIdType) {
    await this.getPostOrThrow(postId);
    const rows = await this.db
      .select()
      .from(postEditHistoryTable)
      .where(eq(postEditHistoryTable.postId, postId))
      .orderBy(desc(postEditHistoryTable.editedAt));
    return {
      items: rows.map((r) => ({
        id: r.id,
        postId: r.postId as PostIdType,
        previousBody: r.previousBody,
        editedAt: r.editedAt.toISOString(),
      })),
    };
  }

  /** Search users by username/displayName prefix for @mention autocomplete.
   * NOTE: Since we don't have a user table in this module, we search post authors by handle patterns in body.
   * A real implementation would join an identity module's user table via a port. */
  async searchUsers(query: string, limit = 10): Promise<{ items: Array<{ userId: UserId; username: string; displayName: string }> }> {
    const term = query.replace(/[^A-Za-z0-9_؀-ۿ]/g, '').toLowerCase();
    if (!term) return { items: [] };

    // Best-effort: find distinct author_ids from posts whose body contains @<term>
    const rows = await this.db.execute<{ author_id: string }>(sql`
      SELECT DISTINCT author_id
      FROM discover.post
      WHERE removed_at IS NULL
        AND body ILIKE ${'%@' + term + '%'}
      LIMIT ${limit}
    `);

    return {
      items: rows.rows.map((r) => ({
        userId: r.author_id as UserId,
        username: r.author_id, // without identity module, return id as placeholder
        displayName: r.author_id,
      })),
    };
  }

  private async getPostOrThrow(postId: PostIdType) {
    const [post] = await this.db.select().from(postTable).where(eq(postTable.id, postId)).limit(1);
    if (!post) throw new NotFoundException({ code: 'not_found' });
    return post;
  }

  private toPostShape(post: typeof postTable.$inferSelect, isLikedByMe: boolean, authorVerified = false, mentionedUserIds: UserId[] = []) {
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
      bookmarkCount: post.bookmarkCount ?? 0,
      mentionedUserIds,
      isLikedByMe,
      authorVerified,
      isPinned: post.isPinned ?? false,
      createdAt: post.createdAt.toISOString(),
    };
  }

  private toCommentShape(comment: typeof commentTable.$inferSelect, isLikedByMe = false) {
    const isDeleted = comment.removedAt != null;
    return {
      id: comment.id as CommentIdType,
      postId: comment.postId as PostIdType,
      authorId: comment.authorId as UserId,
      body: isDeleted ? '[deleted]' : comment.body,
      likeCount: comment.likeCount,
      isLikedByMe,
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
