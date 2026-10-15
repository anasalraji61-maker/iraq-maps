/**
 * FakeSocialService — in-memory social graph service fake for testing.
 * Covers follow/unfollow, block, suggestions, mutual followers.
 */

export type UserId = string;

export interface FollowEdge {
  followerId: UserId;
  followedId: UserId;
  createdAt: Date;
}

export interface BlockEdge {
  blockerId: UserId;
  blockedId: UserId;
  createdAt: Date;
}

export class FakeSocialService {
  private readonly follows: FollowEdge[] = [];
  private readonly blocks: BlockEdge[] = [];

  // ─── Follow ────────────────────────────────────────────────────────────────

  async follow(followerId: UserId, followedId: UserId): Promise<void> {
    if (followerId === followedId) {
      throw new Error('Cannot follow yourself');
    }
    const exists = this.follows.some(
      (f) => f.followerId === followerId && f.followedId === followedId,
    );
    if (!exists) {
      this.follows.push({ followerId, followedId, createdAt: new Date() });
    }
  }

  async unfollow(followerId: UserId, followedId: UserId): Promise<void> {
    const idx = this.follows.findIndex(
      (f) => f.followerId === followerId && f.followedId === followedId,
    );
    if (idx !== -1) this.follows.splice(idx, 1);
  }

  async isFollowing(followerId: UserId, followedId: UserId): Promise<boolean> {
    return this.follows.some(
      (f) => f.followerId === followerId && f.followedId === followedId,
    );
  }

  async getFollowers(
    userId: UserId,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Array<{ userId: UserId; followedAt: string }>; nextCursor?: string }> {
    const limit = opts.limit ?? 20;
    const items = this.follows
      .filter((f) => f.followedId === userId)
      .map((f) => ({ userId: f.followerId, followedAt: f.createdAt.toISOString() }))
      .slice(0, limit);
    return { items };
  }

  async getFollowing(
    userId: UserId,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Array<{ userId: UserId; followedAt: string }>; nextCursor?: string }> {
    const limit = opts.limit ?? 20;
    const items = this.follows
      .filter((f) => f.followerId === userId)
      .map((f) => ({ userId: f.followedId, followedAt: f.createdAt.toISOString() }))
      .slice(0, limit);
    return { items };
  }

  async getFollowerCount(userId: UserId): Promise<number> {
    return this.follows.filter((f) => f.followedId === userId).length;
  }

  async getFollowingCount(userId: UserId): Promise<number> {
    return this.follows.filter((f) => f.followerId === userId).length;
  }

  // ─── Block ─────────────────────────────────────────────────────────────────

  async block(blockerId: UserId, blockedId: UserId): Promise<void> {
    if (blockerId === blockedId) throw new Error('Cannot block yourself');
    const exists = this.blocks.some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId,
    );
    if (!exists) {
      this.blocks.push({ blockerId, blockedId, createdAt: new Date() });
      // Auto-unfollow both directions on block
      await this.unfollow(blockerId, blockedId);
      await this.unfollow(blockedId, blockerId);
    }
  }

  async unblock(blockerId: UserId, blockedId: UserId): Promise<void> {
    const idx = this.blocks.findIndex(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId,
    );
    if (idx !== -1) this.blocks.splice(idx, 1);
  }

  async isBlocked(blockerId: UserId, blockedId: UserId): Promise<boolean> {
    return this.blocks.some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId,
    );
  }

  async getBlocked(
    userId: UserId,
    opts: { limit?: number } = {},
  ): Promise<{ items: Array<{ userId: UserId }> }> {
    const limit = opts.limit ?? 50;
    const items = this.blocks
      .filter((b) => b.blockerId === userId)
      .map((b) => ({ userId: b.blockedId }))
      .slice(0, limit);
    return { items };
  }

  // ─── Suggestions ───────────────────────────────────────────────────────────

  async getSuggestions(
    userId: UserId,
    allUserIds: UserId[],
    opts: { limit?: number } = {},
  ): Promise<{ items: Array<{ userId: UserId; mutualCount: number }> }> {
    const limit = opts.limit ?? 10;

    const alreadyFollowing = new Set(
      this.follows.filter((f) => f.followerId === userId).map((f) => f.followedId),
    );
    const blockedByMe = new Set(
      this.blocks.filter((b) => b.blockerId === userId).map((b) => b.blockedId),
    );
    const blockedMe = new Set(
      this.blocks.filter((b) => b.blockedId === userId).map((b) => b.blockerId),
    );

    const candidates = allUserIds.filter(
      (uid) =>
        uid !== userId &&
        !alreadyFollowing.has(uid) &&
        !blockedByMe.has(uid) &&
        !blockedMe.has(uid),
    );

    const items = candidates.slice(0, limit).map((uid) => ({
      userId: uid,
      mutualCount: this.getMutualFollowerCount(userId, uid),
    }));

    return { items };
  }

  // ─── Mutual followers ──────────────────────────────────────────────────────

  getMutualFollowerCount(userA: UserId, userB: UserId): number {
    const followersOfA = new Set(
      this.follows.filter((f) => f.followedId === userA).map((f) => f.followerId),
    );
    const followersOfB = new Set(
      this.follows.filter((f) => f.followedId === userB).map((f) => f.followerId),
    );
    let count = 0;
    for (const id of followersOfA) {
      if (followersOfB.has(id)) count++;
    }
    return count;
  }

  // ─── Feed ──────────────────────────────────────────────────────────────────

  /** Returns IDs of users that userId follows (to filter feed). */
  async getFollowedUserIds(userId: UserId): Promise<UserId[]> {
    return this.follows.filter((f) => f.followerId === userId).map((f) => f.followedId);
  }

  // ─── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.follows.length = 0;
    this.blocks.length = 0;
  }
}
