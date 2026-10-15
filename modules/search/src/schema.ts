/** Drizzle schema for the search module (schema: search). */

import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgSchema, text, timestamp, integer, uuid, unique } from 'drizzle-orm/pg-core';

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
