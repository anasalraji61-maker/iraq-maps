/**
 * Drizzle schema for the `listings` Postgres schema.
 * Touches only the `listings.*` tables — never joins other schemas.
 */
import { boolean, bigint, geometry, index, jsonb, pgEnum, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const listingsSchema = pgSchema('listings');

// ── Enum ──────────────────────────────────────────────────────────────────────

export const listingTypeEnum = pgEnum('listing_type', [
  'product',
  'service',
  'food_item',
  'rental',
  'package',
]);

// ── Tables ────────────────────────────────────────────────────────────────────

export const listingCategoryTable = listingsSchema.table('listing_category', {
  id:       uuid('id').primaryKey().defaultRandom(),
  nameAr:   text('name_ar').notNull(),
  nameEn:   text('name_en').notNull(),
  icon:     text('icon').notNull().default('🏷️'),
  slug:     text('slug').notNull().unique(),
  parentId: uuid('parent_id'),
});

export const listingTable = listingsSchema.table(
  'listing',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    providerId:       uuid('provider_id').notNull(),
    type:             listingTypeEnum('type').notNull(),
    titleAr:          text('title_ar').notNull(),
    titleEn:          text('title_en').notNull(),
    descriptionAr:    text('description_ar').notNull().default(''),
    descriptionEn:    text('description_en').notNull().default(''),
    priceIqd:         bigint('price_iqd', { mode: 'number' }).notNull(),
    photoAssetIds:    jsonb('photo_asset_ids').notNull().default([]),
    categoryId:       uuid('category_id').notNull(),
    isAvailable:      boolean('is_available').notNull().default(true),
    deliveryAvailable: boolean('delivery_available').notNull().default(false),
    deliveryNotes:    text('delivery_notes'),
    cityId:           text('city_id').notNull(),
    location:         geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
    isFeatured:       boolean('is_featured').notNull().default(false),
    isDeleted:        boolean('is_deleted').notNull().default(false),
    viewCount:        bigint('view_count', { mode: 'number' }).notNull().default(0),
    inquiryCount:     bigint('inquiry_count', { mode: 'number' }).notNull().default(0),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('listings_listing_provider_idx').on(t.providerId).where(/* sql */`NOT is_deleted` as unknown as never),
    index('listings_listing_city_avail_idx').on(t.cityId, t.isAvailable, t.createdAt),
    index('listings_listing_category_idx').on(t.categoryId, t.cityId),
    index('listings_listing_price_idx').on(t.priceIqd, t.cityId),
  ],
);

export type ListingRow = typeof listingTable.$inferSelect;
export type NewListingRow = typeof listingTable.$inferInsert;
export type ListingCategoryRow = typeof listingCategoryTable.$inferSelect;
