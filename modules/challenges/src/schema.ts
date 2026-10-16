import {
  boolean,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const challengesSchema = pgSchema('challenges');

export const challengeTable = challengesSchema.table(
  'challenge',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull().default('review_count'),
    titleAr: text('title_ar').notNull().default(''),
    titleEn: text('title_en').notNull().default(''),
    descriptionAr: text('description_ar').notNull().default(''),
    descriptionEn: text('description_en').notNull().default(''),
    difficulty: text('difficulty').notNull().default('medium'),
    cityId: text('city_id'),
    target: integer('target').notNull().default(1),
    rewardPoints: integer('reward_points').notNull().default(0),
    rewardBadge: text('reward_badge'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isFeatured: boolean('is_featured').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ch_challenge_starts_at_idx').on(t.startsAt),
    index('ch_challenge_ends_at_idx').on(t.endsAt),
    index('ch_challenge_kind_idx').on(t.kind),
    index('ch_challenge_city_id_idx').on(t.cityId),
    index('ch_challenge_is_active_idx').on(t.isActive),
    index('ch_challenge_is_featured_idx').on(t.isFeatured),
  ],
);

export const userChallengeTable = challengesSchema.table(
  'user_challenge',
  {
    userId: uuid('user_id').notNull(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challengeTable.id, { onDelete: 'cascade' }),
    progress: integer('progress').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rewardClaimedAt: timestamp('reward_claimed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.challengeId] }),
    index('ch_user_challenge_challenge_idx').on(t.challengeId),
    index('ch_user_challenge_completed_idx').on(t.completedAt),
    index('ch_user_challenge_progress_idx').on(t.challengeId, t.progress),
  ],
);
