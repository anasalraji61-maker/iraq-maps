import { index, pgSchema, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

export const socialSchema = pgSchema('social');

/**
 * Directed follow edges: follower_id follows following_id.
 * Composite PK prevents duplicate follows.
 */
export const followsTable = socialSchema.table(
  'follows',
  {
    followerId: uuid('follower_id').notNull(),
    followingId: uuid('following_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index('follows_follower_idx').on(t.followerId),
    index('follows_following_idx').on(t.followingId),
    index('follows_created_at_idx').on(t.createdAt),
  ],
);

/**
 * Block relationships: blocker_id has blocked blocked_id.
 * A block silently prevents the blocked user from appearing in feeds, followers
 * or suggestions and prevents the blocker from appearing in the blocked user's
 * results too (bidirectional hiding).
 */
export const blocksTable = socialSchema.table(
  'blocks',
  {
    blockerId: uuid('blocker_id').notNull(),
    blockedId: uuid('blocked_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('blocks_blocker_idx').on(t.blockerId),
    index('blocks_blocked_idx').on(t.blockedId),
  ],
);

/**
 * Records which suggestions a user has dismissed, so they don't reappear.
 */
export const dismissedSuggestionsTable = socialSchema.table(
  'dismissed_suggestions',
  {
    userId: uuid('user_id').notNull(),
    targetId: uuid('target_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetId] }),
    index('dismissed_user_idx').on(t.userId),
  ],
);
