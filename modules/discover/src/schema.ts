import { boolean, index, integer, pgSchema, text, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core';

export const discoverSchema = pgSchema('discover');

export const postTable = discoverSchema.table(
  'post',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id').notNull(),
    placeId: uuid('place_id'),
    type: text('type').notNull(), // 'photo' | 'tip' | 'event' | 'offer'
    category: text('category'), // 'food' | 'transport' | 'tourism' | 'shopping' | 'services' | 'other' | null
    body: text('body').notNull(),
    mediaAssetIds: uuid('media_asset_ids').array().notNull().default([]),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    bookmarkCount: integer('bookmark_count').notNull().default(0),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('post_created_at_idx').on(t.createdAt)],
);

export const postLikeTable = discoverSchema.table('post_like', {
  postId: uuid('post_id')
    .notNull()
    .references(() => postTable.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const postReportTable = discoverSchema.table(
  'post_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id').notNull(),
    reason: text('reason').notNull(), // 'spam' | 'inappropriate' | 'misinformation' | 'other'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('post_report_post_id_idx').on(t.postId)],
);

export const commentTable = discoverSchema.table(
  'comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull(),
    body: text('body').notNull(),
    likeCount: integer('like_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [index('comment_post_id_created_at_idx').on(t.postId, t.createdAt)],
);

export const commentLikeTable = discoverSchema.table(
  'comment_like',
  {
    commentId: uuid('comment_id')
      .notNull()
      .references(() => commentTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);

/** Tracks unique post viewers for analytics. @M-analytics */
export const postViewTable = discoverSchema.table(
  'post_view',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    viewerId: text('viewer_id').notNull(), // userId or IP-hash for anon
    isAnon: boolean('is_anon').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.viewerId] }),
    index('post_view_post_id_idx').on(t.postId),
  ],
);

/** User follow relationships for recommendations. @M-recommendations */
export const userFollowTable = discoverSchema.table(
  'user_follow',
  {
    followerId: uuid('follower_id').notNull(),
    followeeId: uuid('followee_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index('user_follow_follower_idx').on(t.followerId),
    index('user_follow_followee_idx').on(t.followeeId),
  ],
);

/** @mention references extracted from post bodies. */
export const postMentionTable = discoverSchema.table(
  'post_mention',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    mentionedUserId: uuid('mentioned_user_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.mentionedUserId] }),
    index('post_mention_mentioned_user_idx').on(t.mentionedUserId),
  ],
);

/** User bookmarks on posts. */
export const postBookmarkTable = discoverSchema.table(
  'post_bookmark',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('post_bookmark_user_idx').on(t.userId),
  ],
);

/** Edit history for posts. */
export const postEditHistoryTable = discoverSchema.table(
  'post_edit_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    previousBody: text('previous_body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('post_edit_history_post_id_idx').on(t.postId)],
);
