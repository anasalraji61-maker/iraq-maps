/** Drizzle schema for the search module (schema: search). */

import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgSchema, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core';

export const searchSchema = pgSchema('search');

// ---------------------------------------------------------------------------
// search_history
// ---------------------------------------------------------------------------
export const searchHistory = searchSchema.table(
  'search_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    query: text('query').notNull(),
    filters: jsonb('filters'),
    resultCount: integer('result_count'),
    searchedAt: timestamp('searched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_history_user_time_idx').on(t.userId, t.searchedAt),
    check('query_not_empty', sql`length(trim(${t.query})) > 0`),
    check('query_max_len', sql`length(${t.query}) <= 200`),
  ],
);

// ---------------------------------------------------------------------------
// search_clicks
// ---------------------------------------------------------------------------
export const searchClicks = searchSchema.table(
  'search_clicks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id'),
    query: text('query').notNull(),
    resultId: text('result_id').notNull(),
    resultType: text('result_type').notNull(),
    clickedAt: timestamp('clicked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_clicks_query_idx').on(t.query, t.clickedAt),
    index('search_clicks_user_idx').on(t.userId, t.clickedAt),
    check(
      'result_type_enum',
      sql`${t.resultType} IN ('place','post','user','event','listing','tour')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// search_trending
// ---------------------------------------------------------------------------
export const searchTrending = searchSchema.table(
  'search_trending',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    query: text('query').notNull(),
    cityId: text('city_id'),
    count: integer('count').notNull().default(1),
    trend: text('trend').notNull().default('stable'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('search_trending_query_city_uniq').on(t.query, t.cityId),
    index('search_trending_city_count_idx').on(t.cityId, t.count, t.updatedAt),
    check('trend_enum', sql`${t.trend} IN ('rising','stable','falling')`),
    check('count_positive', sql`${t.count} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// search_presets – saved filter configurations per user
// ---------------------------------------------------------------------------
export const searchPresets = searchSchema.table(
  'search_presets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    filters: jsonb('filters').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_presets_user_idx').on(t.userId, t.createdAt),
    check('preset_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('preset_name_max', sql`length(${t.name}) <= 100`),
  ],
);

// ---------------------------------------------------------------------------
// collections – user-created and official place collections
// ---------------------------------------------------------------------------
export const collections = searchSchema.table(
  'collections',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('❤️'),
    color: text('color').notNull().default('#1976D2'),
    description: text('description'),
    isOfficial: boolean('is_official').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(false),
    placeCount: integer('place_count').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('collections_user_idx').on(t.userId, t.createdAt),
    index('collections_official_idx').on(t.isOfficial, t.sortOrder),
    check('collection_name_not_empty', sql`length(trim(${t.name})) > 0`),
    check('collection_name_max', sql`length(${t.name}) <= 100`),
    check('place_count_nonneg', sql`${t.placeCount} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// collection_places – junction table for collections ↔ places
// ---------------------------------------------------------------------------
export const collectionPlaces = searchSchema.table(
  'collection_places',
  {
    collectionId: uuid('collection_id').notNull(),
    placeId: text('place_id').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('collection_places_collection_idx').on(t.collectionId, t.addedAt),
    unique('collection_places_uniq').on(t.collectionId, t.placeId),
  ],
);

// ---------------------------------------------------------------------------
// recommendation_feedback – thumbs up/down on recommended places
// ---------------------------------------------------------------------------
export const recommendationFeedback = searchSchema.table(
  'recommendation_feedback',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').notNull(),
    placeId: text('place_id').notNull(),
    feedback: text('feedback').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('rec_feedback_user_place_uniq').on(t.userId, t.placeId),
    index('rec_feedback_user_idx').on(t.userId, t.createdAt),
    check('feedback_enum', sql`${t.feedback} IN ('up','down')`),
  ],
);
