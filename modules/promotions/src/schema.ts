/**
 * Drizzle schema for the `promotions` Postgres schema.
 * Mirrors 0001_promotions_init.sql — keep in sync.
 */
import { boolean, index, integer, numeric, pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const promotionsSchema = pgSchema('promotions');

export const promotionTypeEnum = promotionsSchema.enum('promotion_type', [
  'percentage_discount',
  'fixed_discount',
  'buy_one_get_one',
  'free_item',
  'happy_hour',
  'first_visit',
]);

export const promotionCategoryEnum = promotionsSchema.enum('promotion_category', [
  'food',
  'shopping',
  'services',
  'entertainment',
  'other',
]);

export const promotionTable = promotionsSchema.table(
  'promotion',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    providerId:     uuid('provider_id').notNull(),
    cityId:         text('city_id').notNull(),
    type:           promotionTypeEnum('type').notNull(),
    category:       promotionCategoryEnum('category').notNull().default('other'),
    titleAr:        text('title_ar').notNull(),
    titleEn:        text('title_en'),
    descriptionAr:  text('description_ar'),
    descriptionEn:  text('description_en'),
    discountValue:  numeric('discount_value', { precision: 12, scale: 2 }),
    code:           text('code'),
    maxRedemptions: integer('max_redemptions'),
    redeemedCount:  integer('redeemed_count').notNull().default(0),
    validFrom:      timestamp('valid_from', { withTimezone: true }).notNull(),
    validTo:        timestamp('valid_to',   { withTimezone: true }).notNull(),
    daysOfWeek:     smallint('days_of_week').notNull().default(0),
    hoursFrom:      text('hours_from'),
    hoursTo:        text('hours_to'),
    isActive:       boolean('is_active').notNull().default(true),
    isFeatured:     boolean('is_featured').notNull().default(false),
    isDeleted:      boolean('is_deleted').notNull().default(false),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('promotion_provider_idx').on(t.providerId),
    index('promotion_city_active_idx').on(t.cityId, t.isActive, t.isDeleted, t.validTo),
    index('promotion_featured_idx').on(t.isFeatured, t.cityId),
  ],
);

export type PromotionRow = typeof promotionTable.$inferSelect;
export type NewPromotionRow = typeof promotionTable.$inferInsert;

export const redemptionTable = promotionsSchema.table(
  'redemption',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull(),
    promotionId: uuid('promotion_id').notNull().references(() => promotionTable.id, { onDelete: 'cascade' }),
    redeemedAt:  timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('redemption_promotion_idx').on(t.promotionId),
    index('redemption_user_idx').on(t.userId),
  ],
);

export type RedemptionRow = typeof redemptionTable.$inferSelect;
