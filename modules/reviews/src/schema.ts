import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core';

export const reviewsSchema = pgSchema('reviews');

export const reviewTable = reviewsSchema.table(
  'review',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    placeId: uuid('place_id').notNull(),
    rating: smallint('rating').notNull(),
    text: text('text').notNull().default(''),
    photosJson: jsonb('photos_json').notNull().default([]),
    isAnonymous: boolean('is_anonymous').notNull().default(false),
    visitDate: date('visit_date'),
    status: text('status').notNull().default('active'), // 'active' | 'removed' | 'hidden'
    helpfulCount: integer('helpful_count').notNull().default(0),
    notHelpfulCount: integer('not_helpful_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('review_user_place_unique').on(t.userId, t.placeId),
    index('review_place_id_created_at_idx').on(t.placeId, t.createdAt),
    index('review_place_id_rating_idx').on(t.placeId, t.rating),
    index('review_user_id_idx').on(t.userId),
    index('review_status_idx').on(t.status),
  ],
);

export const reviewVoteTable = reviewsSchema.table(
  'review_vote',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviewTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    isHelpful: boolean('is_helpful').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.reviewId, t.userId] }),
    index('review_vote_review_id_idx').on(t.reviewId),
  ],
);

export const reviewReportTable = reviewsSchema.table(
  'review_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id').notNull(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviewTable.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(), // 'spam' | 'fake' | 'inappropriate' | 'other'
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('review_report_reporter_review_unique').on(t.reporterId, t.reviewId),
    index('review_report_review_id_idx').on(t.reviewId),
  ],
);

export const reviewResponseTable = reviewsSchema.table(
  'review_response',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviewTable.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('review_response_review_unique').on(t.reviewId),
    index('review_response_review_id_idx').on(t.reviewId),
  ],
);
