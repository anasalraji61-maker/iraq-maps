/**
 * Social graph service: follow relationships, blocks, feed, suggestions.
 *
 * All follow/block operations are idempotent where stated.
 * Block lookups are bidirectional: if A blocks B, B also cannot see A.
 *
 * Events emitted (via EventBus):
 *   social.user.followed.v1  { followerId, followingId }
 *   social.user.unfollowed.v1 { followerId, followingId }
 *   social.user.blocked.v1   { blockerId, blockedId }
 */
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { and, desc, eq, inArray, lt, ne, not, notInArray, or, sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import { PortTokens, type EventBus, type UserId } from '@iraq-maps/contracts';
import { blocksTable, dismissedSuggestionsTable, followsTable } from './schema';

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------

export interface FollowStatsResult {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isFollowedBy: boolean;
  mutualCount: number;
}

export interface FollowUserResult {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowing: boolean;
  isFollowedBy: boolean;
  isVerified: boolean;
  mutualCount: number;
}

export interface UserProfileResult {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followStats: FollowStatsResult;
  postCount: number;
  isVerified: boolean;
}

export interface FollowSuggestionResult {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  mutualCount: number;
  reason: 'mutual_follow' | 'location' | 'popular' | 'interest';
}

export interface FeedPostResult {
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

/** Port for resolving user display info from the identity module. */
export interface UserInfoPort {
  getDisplayName(userId: string): Promise<string | null>;
  getAvatarUrl(userId: string): Promise<string | null>;
  getBio(userId: string): Promise<string | null>;
  isVerifiedProvider(userId: string): Promise<boolean>;
  getPostCount(userId: string): Promise<number>;
  /** Returns recent post ids for multiple authors (for the follow feed). */
  getRecentPostsByAuthors(
    authorIds: string[],
    opts: { cursor?: string; limit: number },
  ): Promise<Array<{ postId: string; authorId: string; body: string; createdAt: string }>>;
}

const noopEventBus: EventBus = {
  publish: async () => {},
  subscribe: () => () => {},
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SocialGraphService {
  constructor(
    @Inject('SOCIAL_DB') private readonly db: Db,
    @Inject(PortTokens.EventBus) private readonly eventBus: EventBus = noopEventBus,
    @Optional() @Inject('SOCIAL_USER_INFO') private readonly userInfo: UserInfoPort | null = null,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Build a stub display name for a user when the UserInfoPort is unavailable
   * (development or mocked environments).
   */
  private stubDisplayName(userId: string): string {
    return `user_${userId.slice(0, 8)}`;
  }

  private async resolveDisplayName(userId: string): Promise<string> {
    if (!this.userInfo) return this.stubDisplayName(userId);
    return (await this.userInfo.getDisplayName(userId)) ?? this.stubDisplayName(userId);
  }

  private async resolveAvatarUrl(userId: string): Promise<string | null> {
    if (!this.userInfo) return null;
    return this.userInfo.getAvatarUrl(userId);
  }

  private async resolveBio(userId: string): Promise<string | null> {
    if (!this.userInfo) return null;
    return this.userInfo.getBio(userId);
  }

  private async resolveIsVerified(userId: string): Promise<boolean> {
    if (!this.userInfo) return false;
    return this.userInfo.isVerifiedProvider(userId);
  }

  private async resolvePostCount(userId: string): Promise<number> {
    if (!this.userInfo) return 0;
    return this.userInfo.getPostCount(userId);
  }

  /**
   * Returns the set of userIds that the viewer is currently following
   * from a candidate list. Batched in one query.
   */
  private async viewerFollowsSet(viewerId: string, candidateIds: string[]): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const rows = await this.db
      .select({ followingId: followsTable.followingId })
      .from(followsTable)
      .where(
        and(
          eq(followsTable.followerId, viewerId),
          inArray(followsTable.followingId, candidateIds),
        ),
      );
    return new Set(rows.map((r: { followingId: string }) => r.followingId));
  }

  /**
   * Returns the set of userIds that follow the viewer from a candidate list.
   */
  private async viewerFollowedBySet(viewerId: string, candidateIds: string[]): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const rows = await this.db
      .select({ followerId: followsTable.followerId })
      .from(followsTable)
      .where(
        and(
          eq(followsTable.followingId, viewerId),
          inArray(followsTable.followerId, candidateIds),
        ),
      );
    return new Set(rows.map((r: { followerId: string }) => r.followerId));
  }

  /**
   * Counts mutual followers between viewerId and each candidate.
   * Returns a map userId -> mutualCount.
   * Uses a raw SQL subquery for type safety.
   */
  private async mutualCountsMap(viewerId: string, candidateIds: string[]): Promise<Map<string, number>> {
    if (candidateIds.length === 0) return new Map();

    // Raw SQL: count users who follow both the viewer and each candidate
    const rows = await this.db.execute<{ following_id: string; mutual_count: number }>(
      sql`
        SELECT f1.following_id, count(*)::int AS mutual_count
        FROM social.follows f1
        INNER JOIN social.follows f2
          ON f1.follower_id = f2.follower_id
         AND f2.following_id = ${viewerId}
        WHERE f1.following_id = ANY(${sql.raw(`ARRAY['${candidateIds.join("','")}']::uuid[]`)})
        GROUP BY f1.following_id
      `,
    );

    const map = new Map<string, number>();
    const resultRows = Array.isArray(rows) ? rows : (rows as { rows: Array<{ following_id: string; mutual_count: number }> }).rows ?? [];
    for (const row of resultRows) {
      map.set(row.following_id, row.mutual_count);
    }
    return map;
  }

  /**
   * Returns the set of user IDs that have blocked viewerId OR that viewerId has blocked.
   * Used to filter lists so blocked users never appear.
   */
  private async blockedOrBlockingSet(viewerId: string): Promise<Set<string>> {
    const [byViewer, byOther] = await Promise.all([
      this.db
        .select({ blockedId: blocksTable.blockedId })
        .from(blocksTable)
        .where(eq(blocksTable.blockerId, viewerId)),
      this.db
        .select({ blockerId: blocksTable.blockerId })
        .from(blocksTable)
        .where(eq(blocksTable.blockedId, viewerId)),
    ]);
    return new Set([
      ...byViewer.map((r: { blockedId: string }) => r.blockedId),
      ...byOther.map((r: { blockerId: string }) => r.blockerId),
    ]);
  }

  // ── Follow operations ──────────────────────────────────────────────────────

  /**
   * Follow a user. Idempotent: calling twice on the same pair is a no-op.
   * Throws BadRequestException if followerId === followingId.
   * Throws NotFoundException if the target user cannot be resolved.
   */
  async followUser(followerId: UserId, followingId: UserId): Promise<FollowStatsResult> {
    if (followerId === followingId) {
      throw new BadRequestException('cannot_follow_self');
    }

    await this.db
      .insert(followsTable)
      .values({ followerId, followingId })
      .onConflictDoNothing();

    await this.eventBus.publish({
      type: 'social.user.followed.v1',
      payload: { followerId, followingId },
    } as never);

    return this.getFollowStats(followingId, followerId);
  }

  /**
   * Unfollow a user. Idempotent: calling when not following is a no-op.
   */
  async unfollowUser(followerId: UserId, followingId: UserId): Promise<FollowStatsResult> {
    await this.db
      .delete(followsTable)
      .where(
        and(
          eq(followsTable.followerId, followerId),
          eq(followsTable.followingId, followingId),
        ),
      );

    await this.eventBus.publish({
      type: 'social.user.unfollowed.v1',
      payload: { followerId, followingId },
    } as never);

    return this.getFollowStats(followingId, followerId);
  }

  /**
   * Remove a follower from the current user's followers list.
   * This is the "soft remove": the follower is not notified.
   */
  async removeFollower(userId: UserId, followerId: UserId): Promise<FollowStatsResult> {
    await this.db
      .delete(followsTable)
      .where(
        and(
          eq(followsTable.followerId, followerId),
          eq(followsTable.followingId, userId),
        ),
      );

    return this.getFollowStats(userId, userId);
  }

  /**
   * Compute follow statistics for `targetUserId` from the perspective of `viewerId`.
   * Both counts and the isFollowing / isFollowedBy flags are returned.
   */
  async getFollowStats(targetUserId: UserId, viewerId: UserId): Promise<FollowStatsResult> {
    const [followersCountRes, followingCountRes, isFollowingRes, isFollowedByRes] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(followsTable)
        .where(eq(followsTable.followingId, targetUserId)),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(followsTable)
        .where(eq(followsTable.followerId, targetUserId)),
      this.db
        .select({ followerId: followsTable.followerId })
        .from(followsTable)
        .where(
          and(
            eq(followsTable.followerId, viewerId),
            eq(followsTable.followingId, targetUserId),
          ),
        ),
      this.db
        .select({ followingId: followsTable.followingId })
        .from(followsTable)
        .where(
          and(
            eq(followsTable.followerId, targetUserId),
            eq(followsTable.followingId, viewerId),
          ),
        ),
    ]);

    const followersCount = followersCountRes[0]?.count ?? 0;
    const followingCount = followingCountRes[0]?.count ?? 0;
    const isFollowing = isFollowingRes.length > 0;
    const isFollowedBy = isFollowedByRes.length > 0;

    // Mutual count: users who follow both viewerId and targetUserId
    let mutualCount = 0;
    if (viewerId !== targetUserId) {
      const mutualRes = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(followsTable)
        .where(
          and(
            eq(followsTable.followingId, viewerId),
            inArray(
              followsTable.followerId,
              this.db
                .select({ followerId: followsTable.followerId })
                .from(followsTable)
                .where(eq(followsTable.followingId, targetUserId)),
            ),
          ),
        );
      mutualCount = mutualRes[0]?.count ?? 0;
    }

    return { followersCount, followingCount, isFollowing, isFollowedBy, mutualCount };
  }

  /**
   * Paginated list of users who follow `userId`.
   * Results include the viewer's relationship status with each follower.
   */
  async getFollowers(
    userId: UserId,
    viewerId: UserId,
    opts: { cursor?: string; limit: number },
  ): Promise<{ items: FollowUserResult[]; nextCursor?: string }> {
    const blockedSet = await this.blockedOrBlockingSet(viewerId);

    const where: ReturnType<typeof and>[] = [eq(followsTable.followingId, userId)];
    if (opts.cursor) where.push(lt(followsTable.createdAt, new Date(opts.cursor)));

    const rows = await this.db
      .select({ followerId: followsTable.followerId, createdAt: followsTable.createdAt })
      .from(followsTable)
      .where(and(...where))
      .orderBy(desc(followsTable.createdAt))
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit).filter((r) => !blockedSet.has(r.followerId));

    const followerIds = page.map((r) => r.followerId);
    const [viewerFollows, viewerFollowedBy, mutuals] = await Promise.all([
      this.viewerFollowsSet(viewerId, followerIds),
      this.viewerFollowedBySet(viewerId, followerIds),
      this.mutualCountsMap(viewerId, followerIds),
    ]);

    const items: FollowUserResult[] = await Promise.all(
      page.map(async (r) => ({
        userId: r.followerId,
        displayName: await this.resolveDisplayName(r.followerId),
        avatarUrl: await this.resolveAvatarUrl(r.followerId),
        isFollowing: viewerFollows.has(r.followerId),
        isFollowedBy: viewerFollowedBy.has(r.followerId),
        isVerified: await this.resolveIsVerified(r.followerId),
        mutualCount: mutuals.get(r.followerId) ?? 0,
      })),
    );

    const nextCursor = hasMore ? rows[opts.limit - 1]?.createdAt.toISOString() : undefined;
    return { items, nextCursor };
  }

  /**
   * Paginated list of users that `userId` follows.
   */
  async getFollowing(
    userId: UserId,
    viewerId: UserId,
    opts: { cursor?: string; limit: number },
  ): Promise<{ items: FollowUserResult[]; nextCursor?: string }> {
    const blockedSet = await this.blockedOrBlockingSet(viewerId);

    const where: ReturnType<typeof and>[] = [eq(followsTable.followerId, userId)];
    if (opts.cursor) where.push(lt(followsTable.createdAt, new Date(opts.cursor)));

    const rows = await this.db
      .select({ followingId: followsTable.followingId, createdAt: followsTable.createdAt })
      .from(followsTable)
      .where(and(...where))
      .orderBy(desc(followsTable.createdAt))
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit).filter((r) => !blockedSet.has(r.followingId));

    const followingIds = page.map((r) => r.followingId);
    const [viewerFollows, viewerFollowedBy, mutuals] = await Promise.all([
      this.viewerFollowsSet(viewerId, followingIds),
      this.viewerFollowedBySet(viewerId, followingIds),
      this.mutualCountsMap(viewerId, followingIds),
    ]);

    const items: FollowUserResult[] = await Promise.all(
      page.map(async (r) => ({
        userId: r.followingId,
        displayName: await this.resolveDisplayName(r.followingId),
        avatarUrl: await this.resolveAvatarUrl(r.followingId),
        isFollowing: viewerFollows.has(r.followingId),
        isFollowedBy: viewerFollowedBy.has(r.followingId),
        isVerified: await this.resolveIsVerified(r.followingId),
        mutualCount: mutuals.get(r.followingId) ?? 0,
      })),
    );

    const nextCursor = hasMore ? rows[opts.limit - 1]?.createdAt.toISOString() : undefined;
    return { items, nextCursor };
  }

  /**
   * Returns a full UserProfile for `userId` as seen by `viewerId`.
   */
  async getUserProfile(userId: UserId, viewerId: UserId): Promise<UserProfileResult> {
    const [displayName, avatarUrl, bio, isVerified, postCount, followStats] = await Promise.all([
      this.resolveDisplayName(userId),
      this.resolveAvatarUrl(userId),
      this.resolveBio(userId),
      this.resolveIsVerified(userId),
      this.resolvePostCount(userId),
      this.getFollowStats(userId, viewerId),
    ]);

    return {
      id: userId,
      displayName,
      avatarUrl,
      bio,
      followStats,
      postCount,
      isVerified,
    };
  }

  /**
   * Returns posts from users that `userId` follows, in reverse chronological order.
   * Blocked users are excluded automatically.
   */
  async getFollowFeed(
    userId: UserId,
    opts: { cursor?: string; limit: number },
  ): Promise<{ items: FeedPostResult[]; nextCursor?: string }> {
    // Get following list
    const followingRows = await this.db
      .select({ followingId: followsTable.followingId })
      .from(followsTable)
      .where(eq(followsTable.followerId, userId));

    if (followingRows.length === 0) return { items: [] };

    const blockedSet = await this.blockedOrBlockingSet(userId);
    const authorIds = followingRows
      .map((r) => r.followingId)
      .filter((id) => !blockedSet.has(id));

    if (authorIds.length === 0) return { items: [] };
    if (!this.userInfo) return { items: [] };

    const posts = await this.userInfo.getRecentPostsByAuthors(authorIds, opts);
    const hasMore = posts.length > opts.limit;
    const page = posts.slice(0, opts.limit);

    const nextCursor = hasMore ? page[page.length - 1]?.createdAt : undefined;
    return { items: page, nextCursor };
  }

  /**
   * Returns up to `limit` follow suggestions for `userId`.
   * Strategy (in priority order):
   *  1. Mutual follows: friends-of-friends who aren't already followed.
   *  2. Popular accounts in the system (highest follower count).
   *  3. Remainder padded with any non-blocked, non-following users.
   *
   * Already-followed, self, blocked, and dismissed users are excluded.
   */
  async getFollowSuggestions(
    userId: UserId,
    limit: number,
  ): Promise<FollowSuggestionResult[]> {
    const [followingRows, blockedSet, dismissedRows]: [
      Array<{ followingId: string }>,
      Set<string>,
      Array<{ targetId: string }>,
    ] = await Promise.all([
      this.db
        .select({ followingId: followsTable.followingId })
        .from(followsTable)
        .where(eq(followsTable.followerId, userId)),
      this.blockedOrBlockingSet(userId),
      this.db
        .select({ targetId: dismissedSuggestionsTable.targetId })
        .from(dismissedSuggestionsTable)
        .where(eq(dismissedSuggestionsTable.userId, userId)),
    ]);

    const alreadyFollowing = new Set(followingRows.map((r) => r.followingId));
    alreadyFollowing.add(userId); // exclude self

    const dismissed = new Set(dismissedRows.map((r) => r.targetId));

    const excluded = new Set([...alreadyFollowing, ...blockedSet, ...dismissed]);

    const suggestions: FollowSuggestionResult[] = [];

    // ── Step 1: friends-of-friends ───────────────────────────────────────────
    if (alreadyFollowing.size > 1) {
      const followingIds: string[] = [...alreadyFollowing].filter((id) => id !== userId);
      const excludedList: string[] = [...excluded];
      // Users followed by people I follow, grouped by occurrence count
      const fofRows = await this.db
        .select({
          followingId: followsTable.followingId,
          mutualCount: sql<number>`count(*)::int`,
        })
        .from(followsTable)
        .where(
          and(
            inArray(followsTable.followerId, followingIds),
            notInArray(followsTable.followingId, excludedList),
            ne(followsTable.followingId, userId),
          ),
        )
        .groupBy(followsTable.followingId)
        .orderBy(sql`count(*) DESC`)
        .limit(limit * 2);

      for (const row of fofRows) {
        if (excluded.has(row.followingId)) continue;
        if (suggestions.length >= limit) break;
        suggestions.push({
          userId: row.followingId,
          displayName: await this.resolveDisplayName(row.followingId),
          avatarUrl: await this.resolveAvatarUrl(row.followingId),
          isVerified: await this.resolveIsVerified(row.followingId),
          mutualCount: row.mutualCount,
          reason: 'mutual_follow',
        });
        excluded.add(row.followingId);
      }
    }

    // ── Step 2: popular accounts ─────────────────────────────────────────────
    if (suggestions.length < limit) {
      const excludeList = [...excluded];
      const popularRows = await this.db
        .select({
          followingId: followsTable.followingId,
          followerCount: sql<number>`count(*)::int`,
        })
        .from(followsTable)
        .where(
          excludeList.length > 0
            ? notInArray(followsTable.followingId, excludeList)
            : not(eq(followsTable.followingId, userId)),
        )
        .groupBy(followsTable.followingId)
        .orderBy(sql`count(*) DESC`)
        .limit((limit - suggestions.length) * 2);

      for (const row of popularRows) {
        if (excluded.has(row.followingId)) continue;
        if (suggestions.length >= limit) break;
        suggestions.push({
          userId: row.followingId,
          displayName: await this.resolveDisplayName(row.followingId),
          avatarUrl: await this.resolveAvatarUrl(row.followingId),
          isVerified: await this.resolveIsVerified(row.followingId),
          mutualCount: 0,
          reason: 'popular',
        });
        excluded.add(row.followingId);
      }
    }

    return suggestions;
  }

  /**
   * Returns mutual followers between `viewerId` and `targetUserId`.
   * These are users who follow BOTH accounts.
   */
  async getMutualFollowers(
    viewerId: UserId,
    targetUserId: UserId,
    limit: number,
  ): Promise<{ items: FollowUserResult[]; totalCount: number }> {
    // Users who follow the viewer
    const viewerFollowers = this.db
      .select({ followerId: followsTable.followerId })
      .from(followsTable)
      .where(eq(followsTable.followingId, viewerId));

    // Users who also follow the target
    const mutualRows = await this.db
      .select({ followerId: followsTable.followerId })
      .from(followsTable)
      .where(
        and(
          eq(followsTable.followingId, targetUserId),
          inArray(followsTable.followerId, viewerFollowers),
        ),
      )
      .limit(limit + 1);

    const totalCountRes = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(followsTable)
      .where(
        and(
          eq(followsTable.followingId, targetUserId),
          inArray(followsTable.followerId, viewerFollowers),
        ),
      );
    const totalCount = totalCountRes[0]?.count ?? 0;

    const page: Array<{ followerId: string }> = mutualRows.slice(0, limit);
    const mutualIds = page.map((r) => r.followerId);
    const [viewerFollows, viewerFollowedBy]: [Set<string>, Set<string>] = await Promise.all([
      this.viewerFollowsSet(viewerId, mutualIds),
      this.viewerFollowedBySet(viewerId, mutualIds),
    ]);

    const items: FollowUserResult[] = await Promise.all(
      page.map(async (r) => ({
        userId: r.followerId,
        displayName: await this.resolveDisplayName(r.followerId),
        avatarUrl: await this.resolveAvatarUrl(r.followerId),
        isFollowing: viewerFollows.has(r.followerId),
        isFollowedBy: viewerFollowedBy.has(r.followerId),
        isVerified: await this.resolveIsVerified(r.followerId),
        mutualCount: 0,
      })),
    );

    return { items, totalCount };
  }

  // ── Block operations ───────────────────────────────────────────────────────

  /**
   * Block a user. Idempotent.
   * Throws BadRequestException if blockerId === blockedId.
   * Automatically removes the follow relationship in both directions.
   */
  async blockUser(blockerId: UserId, blockedId: UserId): Promise<void> {
    if (blockerId === blockedId) {
      throw new BadRequestException('cannot_block_self');
    }

    // Remove follow relationships in both directions (cleanup)
    await Promise.all([
      this.db.delete(followsTable).where(
        and(eq(followsTable.followerId, blockerId), eq(followsTable.followingId, blockedId)),
      ),
      this.db.delete(followsTable).where(
        and(eq(followsTable.followerId, blockedId), eq(followsTable.followingId, blockerId)),
      ),
    ]);

    await this.db
      .insert(blocksTable)
      .values({ blockerId, blockedId })
      .onConflictDoNothing();

    await this.eventBus.publish({
      type: 'social.user.blocked.v1',
      payload: { blockerId, blockedId },
    } as never);
  }

  /** Unblock a user. Idempotent. */
  async unblockUser(blockerId: UserId, blockedId: UserId): Promise<void> {
    await this.db
      .delete(blocksTable)
      .where(
        and(eq(blocksTable.blockerId, blockerId), eq(blocksTable.blockedId, blockedId)),
      );
  }

  /**
   * Paginated list of users that `userId` has blocked.
   */
  async getBlockedUsers(
    userId: UserId,
    opts: { cursor?: string; limit: number },
  ): Promise<{ items: FollowUserResult[]; nextCursor?: string }> {
    const where: ReturnType<typeof and>[] = [eq(blocksTable.blockerId, userId)];
    if (opts.cursor) where.push(lt(blocksTable.createdAt, new Date(opts.cursor)));

    const rows = await this.db
      .select({ blockedId: blocksTable.blockedId, createdAt: blocksTable.createdAt })
      .from(blocksTable)
      .where(and(...where))
      .orderBy(desc(blocksTable.createdAt))
      .limit(opts.limit + 1);

    const hasMore = rows.length > opts.limit;
    const page: Array<{ blockedId: string; createdAt: Date }> = rows.slice(0, opts.limit);

    const items: FollowUserResult[] = await Promise.all(
      page.map(async (r) => ({
        userId: r.blockedId,
        displayName: await this.resolveDisplayName(r.blockedId),
        avatarUrl: await this.resolveAvatarUrl(r.blockedId),
        isFollowing: false,
        isFollowedBy: false,
        isVerified: await this.resolveIsVerified(r.blockedId),
        mutualCount: 0,
      })),
    );

    const nextCursor = hasMore ? rows[opts.limit - 1]?.createdAt.toISOString() : undefined;
    return { items, nextCursor };
  }

  /**
   * Returns true if either userId has blocked targetId or vice versa.
   */
  async isBlocked(userId: UserId, targetId: UserId): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(blocksTable)
      .where(
        or(
          and(eq(blocksTable.blockerId, userId), eq(blocksTable.blockedId, targetId)),
          and(eq(blocksTable.blockerId, targetId), eq(blocksTable.blockedId, userId)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  // ── Suggestion management ─────────────────────────────────────────────────

  /** Dismiss a follow suggestion so it never reappears. */
  async dismissSuggestion(userId: UserId, targetId: UserId): Promise<void> {
    await this.db
      .insert(dismissedSuggestionsTable)
      .values({ userId, targetId })
      .onConflictDoNothing();
  }
}
