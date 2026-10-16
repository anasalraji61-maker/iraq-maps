import {
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const reputationSchema = pgSchema('reputation');

// ── user_reputation ──────────────────────────────────────────────────────────

export const userReputationTable = reputationSchema.table(
  'user_reputation',
  {
    userId:      uuid('user_id').primaryKey(),
    totalPoints: integer('total_points').notNull().default(0),
    level:       text('level').notNull().default('explorer'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_reputation_total_points_idx').on(t.totalPoints),
    index('user_reputation_level_idx').on(t.level),
  ],
);

// ── points_ledger ────────────────────────────────────────────────────────────

export const pointsLedgerTable = reputationSchema.table(
  'points_ledger',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    userId:    uuid('user_id').notNull(),
    points:    integer('points').notNull(),
    reason:    text('reason').notNull(),
    meta:      jsonb('meta').notNull().default({}),
    city:      text('city'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('points_ledger_user_id_idx').on(t.userId, t.createdAt),
    index('points_ledger_reason_idx').on(t.reason),
    index('points_ledger_city_idx').on(t.city),
  ],
);

// ── badge_definition ─────────────────────────────────────────────────────────

export const badgeDefinitionTable = reputationSchema.table('badge_definition', {
  id:             text('id').primaryKey(),
  nameAr:         text('name_ar').notNull(),
  nameCkb:        text('name_ckb').notNull(),
  nameEn:         text('name_en').notNull(),
  descriptionAr:  text('description_ar').notNull(),
  descriptionCkb: text('description_ckb').notNull(),
  descriptionEn:  text('description_en').notNull(),
  emoji:          text('emoji').notNull(),
  category:       text('category').notNull(),
  threshold:      integer('threshold'),
  sortOrder:      integer('sort_order').notNull().default(0),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── user_badge ────────────────────────────────────────────────────────────────

export const userBadgeTable = reputationSchema.table(
  'user_badge',
  {
    userId:    uuid('user_id').notNull(),
    badgeId:   text('badge_id')
      .notNull()
      .references(() => badgeDefinitionTable.id),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.badgeId] }),
    index('user_badge_user_id_idx').on(t.userId, t.awardedAt),
    index('user_badge_badge_id_idx').on(t.badgeId),
  ],
);
