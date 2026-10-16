import { boolean, doublePrecision, index, integer, numeric, pgSchema, text, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core';

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
  (t) => [
    index('post_created_at_idx').on(t.createdAt),
    index('post_author_id_idx').on(t.authorId),
    index('post_place_id_idx').on(t.placeId),
    index('post_removed_at_created_at_idx').on(t.removedAt, t.createdAt),
  ],
);

export const postLikeTable = discoverSchema.table(
  'post_like',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => postTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('post_like_user_id_idx').on(t.userId),
  ],
);

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

// ─── Stories ──────────────────────────────────────────────────────────────────

export const storyTable = discoverSchema.table(
  'story',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id').notNull(),
    mediaUrl: text('media_url').notNull(),
    mediaType: text('media_type').notNull().$type<'image' | 'video'>(),
    duration: integer('duration').notNull().default(5),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('story_author_id_idx').on(t.authorId),
    index('story_expires_at_idx').on(t.expiresAt),
  ],
);

export const storyViewTable = discoverSchema.table(
  'story_view',
  {
    storyId: uuid('story_id').notNull().references(() => storyTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.userId] }),
    index('story_view_user_id_idx').on(t.userId),
  ],
);

// ─── Events ──────────────────────────────────────────────────────────────────

export const eventTable = discoverSchema.table(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizerId: uuid('organizer_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    address: text('address').notNull().default(''),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    maxAttendees: integer('max_attendees'),
    imageUrl: text('image_url'),
    category: text('category').notNull().default('other'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('event_organizer_idx').on(t.organizerId),
    index('event_start_time_idx').on(t.startTime),
    index('event_category_idx').on(t.category),
  ],
);

export const eventRsvpTable = discoverSchema.table(
  'event_rsvp',
  {
    eventId: uuid('event_id').notNull().references(() => eventTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index('event_rsvp_user_idx').on(t.userId),
  ],
);

// ─── Challenges ───────────────────────────────────────────────────────────────

export const challengeTable = discoverSchema.table(
  'challenge',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').notNull().default('checkin'),
    targetCount: integer('target_count').notNull().default(1),
    reward: text('reward'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('challenge_starts_at_idx').on(t.startsAt),
    index('challenge_ends_at_idx').on(t.endsAt),
  ],
);

export const challengeProgressTable = discoverSchema.table(
  'challenge_progress',
  {
    challengeId: uuid('challenge_id').notNull().references(() => challengeTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    progress: integer('progress').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.challengeId, t.userId] }),
    index('challenge_progress_challenge_idx').on(t.challengeId),
  ],
);

// ─── Marketplace ──────────────────────────────────────────────────────────────

export const listingTable = discoverSchema.table(
  'listing',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerId: uuid('seller_id').notNull(),
    sellerName: text('seller_name').notNull().default(''),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    price: numeric('price', { precision: 18, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('IQD'),
    category: text('category').notNull().default('other'),
    images: text('images').array().notNull().default([]),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('listing_seller_id_idx').on(t.sellerId),
    index('listing_category_idx').on(t.category),
    index('listing_status_created_idx').on(t.status, t.createdAt),
  ],
);
