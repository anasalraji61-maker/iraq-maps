import { index, integer, pgSchema, text, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core';

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
