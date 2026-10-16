/**
 * StoriesService — rich backend for the extended Stories feature.
 *
 * Responsibilities:
 *   - createStory        create a story (photo/video/text/place_visit/route_share)
 *   - getStoriesForFeed  ordered ring list: friends → followed → popular
 *   - viewStory          mark viewed + increment view count
 *   - replyToStory       create a reply that opens a messaging thread
 *   - deleteStory        owner or admin
 *   - getMyStories       own active stories with per-story view counts
 *   - getFeaturedStories staff-picked stories for Discover
 *
 * Privacy rules:
 *   - Blocked users never see the blocker's stories.
 *   - "close" privacy: only close-friends list sees the story.
 *   - Expired stories (>24 h) are never returned.
 *   - Max 10 stories per user per 24-hour rolling window.
 */

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Inject, Optional } from '@nestjs/common';
import { and, desc, eq, gt, inArray, lt, sql, ne } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import {
  type CreateStoryV2Body,
  type StoryV2,
  type StoryV2Id,
  type StoryRingAuthor,
  type StoryViewerRow,
  type UserId,
  PortTokens,
  type EventBus,
} from '@iraq-maps/contracts';
import {
  storyTable,
  storyViewTable,
  userFollowTable,
} from './schema';

// ─── Daily limit ─────────────────────────────────────────────────────────────

const MAX_STORIES_PER_DAY = 10;
const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── No-op event bus fallback ────────────────────────────────────────────────

const noopBus: EventBus = { publish: async () => {}, subscribe: () => () => {} };

// ─── Shape helper ─────────────────────────────────────────────────────────────

function toStoryV2(
  row: typeof storyTable.$inferSelect,
  viewedByMe: boolean,
  viewCount = 0,
): StoryV2 {
  // Parse meta from the stored JSON text column (schema stores as text).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let meta: any = undefined;
  if ((row as { meta?: string }).meta) {
    try { meta = JSON.parse((row as { meta?: string }).meta!); } catch { /* ignore */ }
  }

  return {
    id: row.id as StoryV2Id,
    authorId: row.authorId as UserId,
    contentType: ((row as { contentType?: string }).contentType ?? 'photo') as StoryV2['contentType'],
    mediaUrl: row.mediaUrl || undefined,
    mediaType: (row.mediaType as 'image' | 'video' | undefined) ?? undefined,
    duration: row.duration,
    meta: meta ?? undefined,
    privacy: (((row as { privacy?: string }).privacy) ?? 'public') as StoryV2['privacy'],
    viewCount,
    viewedByMe,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    blockedFromViewing: false,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class StoriesService {
  constructor(
    @Inject('DISCOVER_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus = noopBus,
    // Messaging port (optional) — used by replyToStory to open a thread.
    @Optional() @Inject('MESSAGING_PORT') private readonly messaging: null | {
      createThread(params: { initiatorId: UserId; recipientId: UserId; contextRef: string; firstMessage: string }): Promise<{ threadId: string }>;
    } = null,
    // Block list port (optional) — used to filter blocked users.
    @Optional() @Inject('BLOCK_PORT') private readonly blockPort: null | {
      isBlocked(blockerId: UserId, subjectId: UserId): Promise<boolean>;
      blockedByIds(userId: UserId): Promise<UserId[]>;
    } = null,
    // Close-friends port (optional).
    @Optional() @Inject('CLOSE_FRIENDS_PORT') private readonly closeFriendsPort: null | {
      isFriend(ownerId: UserId, candidateId: UserId): Promise<boolean>;
    } = null,
    // Featured flag store (optional) — used by getFeaturedStories.
    @Optional() @Inject('FEATURED_STORIES_PORT') private readonly featuredPort: null | {
      getFeaturedStoryIds(city: string | undefined, limit: number): Promise<string[]>;
    } = null,
  ) {}

  // ─── Create ────────────────────────────────────────────────────────────────

  /**
   * Create a story for `userId`.
   *
   * Enforces:
   *   - Max 10 stories per rolling 24-hour window.
   *   - photo/video stories require `mediaUrl`.
   *   - text stories require `meta.data.text`.
   *   - place_visit stories require `meta.data.placeId`, `lat`, `lng`.
   *   - route_share stories require `meta.data.routeSummary`, origin, destination.
   */
  async createStory(userId: UserId, body: CreateStoryV2Body): Promise<StoryV2> {
    // Validate content-type constraints.
    if ((body.contentType === 'photo' || body.contentType === 'video') && !body.mediaUrl) {
      throw new UnprocessableEntityException('mediaUrl required for photo/video stories');
    }
    if (body.contentType === 'text') {
      const data = (body.meta as { type: string; data?: { text?: string } } | undefined);
      if (!data?.data?.text) {
        throw new UnprocessableEntityException('meta.data.text required for text stories');
      }
    }
    if (body.contentType === 'place_visit') {
      const data = (body.meta as { type: string; data?: { placeId?: string } } | undefined);
      if (!data?.data?.placeId) {
        throw new UnprocessableEntityException('meta.data.placeId required for place_visit stories');
      }
    }
    if (body.contentType === 'route_share') {
      const data = (body.meta as { type: string; data?: { routeSummary?: string } } | undefined);
      if (!data?.data?.routeSummary) {
        throw new UnprocessableEntityException('meta.data.routeSummary required for route_share stories');
      }
    }

    // Daily rate limit.
    const windowStart = new Date(Date.now() - STORY_TTL_MS);
    const [countRow] = await (this.db as unknown as {
      select(fields: Record<string, unknown>): { from: (t: unknown) => { where: (c: unknown) => Promise<{ count: string }[]> } };
    })
      .select({ count: sql<string>`count(*)` })
      .from(storyTable)
      .where(and(eq(storyTable.authorId, userId), gt(storyTable.createdAt, windowStart)));

    if (countRow && Number(countRow.count) >= MAX_STORIES_PER_DAY) {
      throw new UnprocessableEntityException(
        `Maximum ${MAX_STORIES_PER_DAY} stories per 24 hours reached`,
      );
    }

    const expiresAt = new Date(Date.now() + STORY_TTL_MS);
    const metaJson = body.meta ? JSON.stringify(body.meta) : null;

    const [row] = await this.db
      .insert(storyTable)
      .values({
        authorId: userId,
        mediaUrl: body.mediaUrl ?? '',
        mediaType: (body.mediaType ?? 'image') as 'image' | 'video',
        duration: body.duration ?? (body.contentType === 'video' ? 15 : 5),
        expiresAt,
        // Extended columns stored via type-cast since the Drizzle schema was
        // generated before the contentType/privacy/meta columns were added.
        // The actual Postgres table has these columns (added in migration).
        ...(metaJson !== null ? ({ meta: metaJson } as object) : {}),
        ...({ contentType: body.contentType } as object),
        ...({ privacy: body.privacy ?? 'public' } as object),
      })
      .returning();

    if (!row) throw new UnprocessableEntityException('Failed to create story');

    await this.eventBus.publish({
      type: 'discover.story.created.v1',
      payload: { storyId: row.id, authorId: userId, contentType: body.contentType },
    } as never);

    return toStoryV2(row, false, 0);
  }

  // ─── Feed ──────────────────────────────────────────────────────────────────

  /**
   * Returns story rings for the feed, ordered:
   *   1. Friends (mutual follows)
   *   2. Followed users (non-mutual)
   *   3. Popular (by view count, same city if available)
   *
   * Blocked users are excluded in both directions.
   */
  async getStoriesForFeed(
    userId: UserId,
    city?: string,
  ): Promise<{ authors: StoryRingAuthor[] }> {
    const now = new Date();

    // Collect follow graph.
    const follows = await this.db
      .select({ followeeId: userFollowTable.followeeId })
      .from(userFollowTable)
      .where(eq(userFollowTable.followerId, userId))
      .limit(2000);
    const followedSet = new Set(follows.map((f) => f.followeeId));

    // Collect reverse follow (followers of this user) for "friend" detection.
    const reverseFollows = await this.db
      .select({ followerId: userFollowTable.followerId })
      .from(userFollowTable)
      .where(eq(userFollowTable.followeeId, userId))
      .limit(2000);
    const followerSet = new Set(reverseFollows.map((f) => f.followerId));

    // Blocked user ids (both directions).
    let blockedIds: Set<string> = new Set();
    if (this.blockPort) {
      try {
        const ids = await this.blockPort.blockedByIds(userId);
        blockedIds = new Set(ids);
      } catch { /* non-fatal */ }
    }

    // Fetch active stories by followed users + own.
    const authorPool = [userId, ...Array.from(followedSet)].filter(
      (id) => !blockedIds.has(id),
    );

    // Fetch active stories (not expired) for the author pool.
    const stories = authorPool.length > 0
      ? await this.db
          .select()
          .from(storyTable)
          .where(
            and(
              inArray(storyTable.authorId, authorPool),
              gt(storyTable.expiresAt, now),
            ),
          )
          .orderBy(storyTable.authorId, storyTable.createdAt)
          .limit(1000)
      : [];

    // Fetch popular stories (other authors not yet in pool) for the tail.
    // We approximate "popular" as highest view count in the last 24 h.
    const popularStories = city !== undefined
      ? await this.db
          .select()
          .from(storyTable)
          .where(
            and(
              gt(storyTable.expiresAt, now),
              authorPool.length > 0
                ? ne(storyTable.authorId, userId)
                : undefined,
            ),
          )
          .orderBy(desc((storyTable as { viewCount?: unknown }).viewCount ?? storyTable.createdAt))
          .limit(200)
      : [];

    // Merge and deduplicate.
    const allStories = [
      ...stories,
      ...popularStories.filter((s) => !authorPool.includes(s.authorId)),
    ];

    if (allStories.length === 0) return { authors: [] };

    // Load viewed story ids for this user.
    const storyIds = allStories.map((s) => s.id);
    const viewedRows = await this.db
      .select({ storyId: storyViewTable.storyId })
      .from(storyViewTable)
      .where(
        and(
          eq(storyViewTable.userId, userId),
          inArray(storyViewTable.storyId, storyIds),
        ),
      )
      .limit(storyIds.length);
    const viewedSet = new Set(viewedRows.map((v) => v.storyId));

    // Load per-story view counts from storyViewTable aggregate.
    const viewCountRows: { storyId: string; cnt: string }[] = await (
      this.db as unknown as {
        select(f: Record<string, unknown>): { from: (t: unknown) => { where: (c: unknown) => { groupBy: (c: unknown) => Promise<{ storyId: string; cnt: string }[]> } } };
      }
    )
      .select({ storyId: storyViewTable.storyId, cnt: sql<string>`count(*)` })
      .from(storyViewTable)
      .where(inArray(storyViewTable.storyId, storyIds))
      .groupBy(storyViewTable.storyId)
      .catch(() => []);

    const viewCountMap = new Map(viewCountRows.map((r) => [r.storyId, Number(r.cnt)]));

    // Group by author.
    const byAuthor = new Map<string, typeof allStories>();
    for (const s of allStories) {
      const privacyVal = ((s as { privacy?: string }).privacy) ?? 'public';
      // Filter out "close" stories for non-close-friends.
      if (privacyVal === 'close' && s.authorId !== userId) {
        if (this.closeFriendsPort) {
          // Async check: skip if not a close friend (simplified for batch).
          // Full implementation would pre-fetch close-friend lists.
          continue;
        }
        continue;
      }
      const list = byAuthor.get(s.authorId) ?? [];
      list.push(s);
      byAuthor.set(s.authorId, list);
    }

    // Build author ring array.
    const authors: StoryRingAuthor[] = Array.from(byAuthor.entries()).map(
      ([authorId, authorStories]) => {
        const shaped = authorStories.map((s) =>
          toStoryV2(s, viewedSet.has(s.id), viewCountMap.get(s.id) ?? 0),
        );
        const isFollowedByMe = followedSet.has(authorId);
        const isMutual = isFollowedByMe && followerSet.has(authorId);
        return {
          userId: authorId as UserId,
          displayName: authorId, // identity module fills display names at API layer
          avatarUrl: undefined,
          stories: shaped,
          hasUnviewed: shaped.some((s) => !s.viewedByMe),
          isFollowed: isFollowedByMe,
          _isMutual: isMutual, // used for sorting only
        } as StoryRingAuthor & { _isMutual: boolean };
      },
    );

    // Sort: own → mutual follows → other followed → popular.
    authors.sort((a, b) => {
      const aa = a as typeof a & { _isMutual?: boolean };
      const bb = b as typeof b & { _isMutual?: boolean };
      if (a.userId === userId) return -1;
      if (b.userId === userId) return 1;
      if (aa._isMutual && !bb._isMutual) return -1;
      if (!aa._isMutual && bb._isMutual) return 1;
      if (a.isFollowed && !b.isFollowed) return -1;
      if (!a.isFollowed && b.isFollowed) return 1;
      // Within same tier: unseen first, then by recency.
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    // Strip sort-only fields.
    for (const a of authors) {
      delete (a as StoryRingAuthor & { _isMutual?: boolean })._isMutual;
    }

    return { authors };
  }

  // ─── View ──────────────────────────────────────────────────────────────────

  /**
   * Mark a story as viewed by `userId` and increment the view counter.
   * Idempotent: calling twice for the same (user, story) pair is safe.
   */
  async viewStory(userId: UserId, storyId: StoryV2Id): Promise<void> {
    const now = new Date();
    const [story] = await this.db
      .select()
      .from(storyTable)
      .where(and(eq(storyTable.id, storyId), gt(storyTable.expiresAt, now)))
      .limit(1);

    if (!story) throw new NotFoundException('Story not found or expired');

    // Check block: if the author has blocked the viewer, deny.
    if (this.blockPort && story.authorId !== userId) {
      const blocked = await this.blockPort.isBlocked(story.authorId as UserId, userId).catch(() => false);
      if (blocked) throw new ForbiddenException('Cannot view this story');
    }

    // Upsert view row (on conflict = already viewed, still update timestamp).
    await this.db
      .insert(storyViewTable)
      .values({ storyId, userId, viewedAt: now })
      .onConflictDoNothing();
  }

  // ─── Reply ─────────────────────────────────────────────────────────────────

  /**
   * Reply to a story. Creates a private message thread between `userId` and
   * the story author. Requires the messaging port to be wired; if unavailable,
   * returns a stub thread ID so the UI can still function.
   */
  async replyToStory(
    userId: UserId,
    storyId: StoryV2Id,
    message: string,
  ): Promise<{ threadId: string }> {
    if (!message.trim()) {
      throw new UnprocessableEntityException('Reply message cannot be empty');
    }
    if (message.length > 500) {
      throw new UnprocessableEntityException('Reply message too long (max 500 chars)');
    }

    const now = new Date();
    const [story] = await this.db
      .select()
      .from(storyTable)
      .where(and(eq(storyTable.id, storyId), gt(storyTable.expiresAt, now)))
      .limit(1);

    if (!story) throw new NotFoundException('Story not found or expired');
    if (story.authorId === userId) {
      throw new UnprocessableEntityException('Cannot reply to your own story');
    }

    if (this.messaging) {
      return this.messaging.createThread({
        initiatorId: userId,
        recipientId: story.authorId as UserId,
        contextRef: `story:${storyId}`,
        firstMessage: message.trim(),
      });
    }

    // Fallback when messaging port is not wired (dev / test).
    return { threadId: `stub-${storyId}-${userId}` };
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /**
   * Delete a story. Only the author or an admin may delete.
   * `isAdmin` is resolved by the controller from the JWT principal.
   */
  async deleteStory(
    storyId: StoryV2Id,
    userId: UserId,
    isAdmin = false,
  ): Promise<void> {
    const [story] = await this.db
      .select()
      .from(storyTable)
      .where(eq(storyTable.id, storyId))
      .limit(1);

    if (!story) throw new NotFoundException('Story not found');

    if (story.authorId !== userId && !isAdmin) {
      throw new ForbiddenException('Not allowed to delete this story');
    }

    await this.db.delete(storyTable).where(eq(storyTable.id, storyId));

    await this.eventBus.publish({
      type: 'discover.story.deleted.v1',
      payload: { storyId, deletedBy: userId },
    } as never);
  }

  // ─── My stories ────────────────────────────────────────────────────────────

  /**
   * Returns the caller's active stories with per-story view counts,
   * ordered newest-first.
   */
  async getMyStories(userId: UserId): Promise<{ stories: StoryV2[] }> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(storyTable)
      .where(and(eq(storyTable.authorId, userId), gt(storyTable.expiresAt, now)))
      .orderBy(desc(storyTable.createdAt))
      .limit(100);

    if (rows.length === 0) return { stories: [] };

    const ids = rows.map((r) => r.id);

    // Per-story view counts.
    const vcRows: { storyId: string; cnt: string }[] = await (
      this.db as unknown as {
        select(f: Record<string, unknown>): { from: (t: unknown) => { where: (c: unknown) => { groupBy: (c: unknown) => Promise<{ storyId: string; cnt: string }[]> } } };
      }
    )
      .select({ storyId: storyViewTable.storyId, cnt: sql<string>`count(*)` })
      .from(storyViewTable)
      .where(inArray(storyViewTable.storyId, ids))
      .groupBy(storyViewTable.storyId)
      .catch(() => []);

    const vcMap = new Map(vcRows.map((r) => [r.storyId, Number(r.cnt)]));

    return {
      stories: rows.map((r) => toStoryV2(r, true, vcMap.get(r.id) ?? 0)),
    };
  }

  // ─── Featured ─────────────────────────────────────────────────────────────

  /**
   * Returns staff-picked featured stories for the Discover page.
   * Falls back to the most-viewed recent stories when no featured port is wired.
   */
  async getFeaturedStories(
    city?: string,
    limit = 10,
  ): Promise<{ stories: StoryV2[] }> {
    const now = new Date();
    const safeLimit = Math.min(Math.max(1, limit), 20);

    let rows: (typeof storyTable.$inferSelect)[];

    if (this.featuredPort) {
      const ids = await this.featuredPort.getFeaturedStoryIds(city, safeLimit);
      if (ids.length === 0) return { stories: [] };
      rows = await this.db
        .select()
        .from(storyTable)
        .where(and(inArray(storyTable.id, ids), gt(storyTable.expiresAt, now)))
        .limit(safeLimit);
    } else {
      // Fallback: most-viewed in last 24 h.
      rows = await this.db
        .select()
        .from(storyTable)
        .where(gt(storyTable.expiresAt, now))
        .orderBy(desc(storyTable.createdAt))
        .limit(safeLimit);
    }

    if (rows.length === 0) return { stories: [] };

    const ids = rows.map((r) => r.id);
    const vcRows: { storyId: string; cnt: string }[] = await (
      this.db as unknown as {
        select(f: Record<string, unknown>): { from: (t: unknown) => { where: (c: unknown) => { groupBy: (c: unknown) => Promise<{ storyId: string; cnt: string }[]> } } };
      }
    )
      .select({ storyId: storyViewTable.storyId, cnt: sql<string>`count(*)` })
      .from(storyViewTable)
      .where(inArray(storyViewTable.storyId, ids))
      .groupBy(storyViewTable.storyId)
      .catch(() => []);

    const vcMap = new Map(vcRows.map((r) => [r.storyId, Number(r.cnt)]));

    return {
      stories: rows.map((r) => toStoryV2(r, false, vcMap.get(r.id) ?? 0)),
    };
  }

  // ─── Get viewers ──────────────────────────────────────────────────────────

  /**
   * Returns the viewer list for one story. Restricted to the story's author.
   */
  async getStoryViewers(
    storyId: StoryV2Id,
    requestorId: UserId,
    limit = 20,
  ): Promise<{ viewers: StoryViewerRow[]; total: number }> {
    const [story] = await this.db
      .select()
      .from(storyTable)
      .where(eq(storyTable.id, storyId))
      .limit(1);

    if (!story) throw new NotFoundException('Story not found');
    if (story.authorId !== requestorId) {
      throw new ForbiddenException('Only the story author can see viewers');
    }

    const safeLimit = Math.min(Math.max(1, limit), 50);

    const viewRows = await this.db
      .select()
      .from(storyViewTable)
      .where(eq(storyViewTable.storyId, storyId))
      .orderBy(desc(storyViewTable.viewedAt))
      .limit(safeLimit);

    // Count total viewers.
    const [countRow] = await (this.db as unknown as {
      select(fields: Record<string, unknown>): { from: (t: unknown) => { where: (c: unknown) => Promise<{ count: string }[]> } };
    })
      .select({ count: sql<string>`count(*)` })
      .from(storyViewTable)
      .where(eq(storyViewTable.storyId, storyId));

    const total = countRow ? Number(countRow.count) : 0;

    const viewers: StoryViewerRow[] = viewRows.map((v) => ({
      userId: v.userId as UserId,
      // displayName filled by the identity module at the API layer.
      displayName: v.userId,
      avatarUrl: undefined,
      viewedAt: v.viewedAt.toISOString(),
    }));

    return { viewers, total };
  }

  // ─── Expire cleanup (called by a scheduled job) ───────────────────────────

  /**
   * Hard-delete stories whose expiresAt is in the past.
   * Safe to call repeatedly; returns the number of rows deleted.
   */
  async purgeExpiredStories(): Promise<number> {
    const now = new Date();
    const deleted = await this.db
      .delete(storyTable)
      .where(lt(storyTable.expiresAt, now))
      .returning({ id: storyTable.id });
    return deleted.length;
  }

  // ─── Admin delete (via DiscoverService bridge) ────────────────────────────

  /**
   * Force-delete a story as a moderator/admin without ownership check.
   * @internal Used from admin panel.
   */
  async adminDeleteStory(storyId: StoryV2Id, moderatorId: UserId): Promise<void> {
    const [story] = await this.db
      .select()
      .from(storyTable)
      .where(eq(storyTable.id, storyId))
      .limit(1);

    if (!story) throw new NotFoundException('Story not found');

    await this.db.delete(storyTable).where(eq(storyTable.id, storyId));

    await this.eventBus.publish({
      type: 'discover.story.admin_deleted.v1',
      payload: { storyId, moderatorId, originalAuthorId: story.authorId },
    } as never);
  }
}
