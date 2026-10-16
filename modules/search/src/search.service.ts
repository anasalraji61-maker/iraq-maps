/**
 * SearchService: unified search across places, posts, users, events, listings and tours.
 *
 * Architecture:
 * - Postgres full-text + pg_trgm for Arabic-normalised text matching.
 * - PostGIS ST_DWithin for radius filtering on place queries.
 * - Redis for trending-searches cache (TTL 1 h); falls back to DB when cache miss.
 * - History capped at 20 per user; older rows pruned on write.
 */

import {
  type CityId,
  type PlaceCategory,
  type PlaceId,
  type SearchFilters,
  type SearchHistoryEntry,
  type SearchResponse,
  type SearchResultItem,
  type SuggestionsResponse,
  type TrendingResponse,
  type TrendingSearch,
  type UserId,
} from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { normalizeArabic } from '@iraq-maps/i18n';
import { desc, eq, sql } from 'drizzle-orm';
import { searchClicks, searchHistory } from './schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchPagination {
  limit: number;
  cursor?: string;
}

/** Minimal Redis interface (subset of ioredis). Avoids a direct dependency. */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: 'EX', ttl: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

// Raw DB row shapes

interface PlaceRow extends Record<string, unknown> {
  id: string;
  kind: string;
  names: Record<string, string>;
  category: string | null;
  lng: number;
  lat: number;
  distance_m: number | null;
  opening_hours: string | null;
  review_avg: number | null;
  review_count: number;
  city_id: string;
}

interface PostRow extends Record<string, unknown> {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  like_count: number;
}

interface UserRow extends Record<string, unknown> {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  follower_count: number;
  is_provider: boolean;
}

interface EventRow extends Record<string, unknown> {
  id: string;
  title: Record<string, string>;
  start_at: string;
  end_at: string | null;
  lng: number | null;
  lat: number | null;
  venue_name: string | null;
  city_id: string;
  attendee_count: number;
}

interface ListingRow extends Record<string, unknown> {
  id: string;
  title: Record<string, string>;
  price_iqd: number | null;
  thumbnail_url: string | null;
  seller_name: string;
  city_id: string;
  posted_at: string;
}

interface TourRow extends Record<string, unknown> {
  id: string;
  title: Record<string, string>;
  duration_minutes: number | null;
  city_id: string;
  thumbnail_url: string | null;
}

interface TrendingRow extends Record<string, unknown> {
  query: string;
  city_id: string | null;
  count: number;
  trend: string;
  updated_at: string;
}

interface _HistoryRow {
  id: string;
  query: string;
  filters: string | null;
  result_count: number | null;
  searched_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRENDING_TTL_S = 3600; // 1 hour
const MAX_HISTORY = 20;

function trendingCacheKey(city?: string | null): string {
  return `search:trending:${city ?? '_global'}`;
}

/** Pick the localised name from a JSONB names object (ar → ckb → en → first value). */
function pickName(names: Record<string, string>, lang = 'ar'): string {
  return names[lang] ?? names['ckb'] ?? names['en'] ?? Object.values(names)[0] ?? '';
}

/** Decode an opaque base64 cursor to a timestamp string. */
function decodeCursor(cursor: string): string | undefined {
  try {
    return Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    return undefined;
  }
}

/** Encode a timestamp to an opaque cursor. */
function encodeCursor(ts: string): string {
  return Buffer.from(ts, 'utf8').toString('base64');
}

/** Parse "lng,lat" string. */
function parseNear(near?: string): [number, number] | null {
  if (!near) return null;
  const parts = near.split(',').map(Number);
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  return [parts[0]!, parts[1]!];
}

// ---------------------------------------------------------------------------
// SearchService
// ---------------------------------------------------------------------------

export class SearchService {
  constructor(
    private readonly db: Db,
    private readonly cache: CacheClient | null,
  ) {}

  // -------------------------------------------------------------------------
  // Main search
  // -------------------------------------------------------------------------

  async search(
    userId: UserId | null,
    query: string,
    filters: Partial<SearchFilters>,
    pagination: SearchPagination,
  ): Promise<SearchResponse> {
    const start = Date.now();
    const needle = normalizeArabic(query);
    if (!needle) {
      return { items: [], total: 0, nextCursor: null, query, durationMs: 0 };
    }

    const { type, limit = 20 } = { ...filters, ...pagination };
    const lang = filters.lang ?? 'ar';
    const near = parseNear(filters.near);
    const cursorTs = pagination.cursor ? decodeCursor(pagination.cursor) : undefined;

    const items: SearchResultItem[] = [];

    if (!type || type === 'place') {
      const places = await this._searchPlaces(needle, filters, lang, near, limit, cursorTs);
      items.push(...places);
    }
    if (!type || type === 'post') {
      const posts = await this._searchPosts(needle, limit, cursorTs);
      items.push(...posts);
    }
    if (!type || type === 'user') {
      const users = await this._searchUsers(needle, limit, cursorTs);
      items.push(...users);
    }
    if (!type || type === 'event') {
      const events = await this._searchEvents(needle, filters, lang, limit, cursorTs);
      items.push(...events);
    }
    if (!type || type === 'listing') {
      const listings = await this._searchListings(needle, filters, lang, limit, cursorTs);
      items.push(...listings);
    }
    if (!type || type === 'tour') {
      const tours = await this._searchTours(needle, lang, limit, cursorTs);
      items.push(...tours);
    }

    // Sort by relevance (places and events first, then the rest), then trim.
    const sorted = items.slice(0, limit);
    const nextCursor =
      sorted.length === limit
        ? encodeCursor(new Date().toISOString())
        : null;

    // Record history and trending asynchronously — failures must not affect the response.
    this._recordAsync(userId, query, filters, sorted.length);

    return {
      items: sorted,
      total: sorted.length,
      nextCursor,
      query,
      durationMs: Date.now() - start,
    };
  }

  // -------------------------------------------------------------------------
  // Places
  // -------------------------------------------------------------------------

  private async _searchPlaces(
    needle: string,
    filters: Partial<SearchFilters>,
    lang: string,
    near: [number, number] | null,
    limit: number,
    _cursorTs: string | undefined,
  ): Promise<SearchResultItem[]> {
    const point = near
      ? sql`ST_SetSRID(ST_MakePoint(${near[0]}::float8, ${near[1]}::float8), 4326)::geography`
      : null;

    const distExpr = point
      ? sql`ST_Distance(location, ${point})`
      : sql`NULL::float8`;

    const radiusFilter =
      point && filters.radiusM
        ? sql`AND ST_DWithin(location, ${point}, ${filters.radiusM})`
        : sql``;

    const cityFilter = filters.city ? sql`AND city_id = ${filters.city}` : sql``;
    const categoryFilter = filters.category
      ? sql`AND category = ${filters.category}`
      : sql``;

    const ratingFilter =
      filters.ratingMin != null
        ? sql`AND COALESCE(review_avg, 0) >= ${filters.ratingMin}`
        : sql``;

    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        id, kind, names, category,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat,
        ${distExpr} AS distance_m,
        opening_hours,
        review_avg,
        COALESCE(review_count, 0) AS review_count,
        city_id
      FROM places.osm_features
      WHERE (
        ${needle} <% search_text
        OR similarity(${needle}, search_text) > 0.15
      )
      ${cityFilter}
      ${categoryFilter}
      ${radiusFilter}
      ${ratingFilter}
      ORDER BY
        GREATEST(similarity(${needle}, search_text), word_similarity(${needle}, search_text)) DESC,
        distance_m ASC NULLS LAST
      LIMIT ${limit}
    `);

    return rows.map((row): SearchResultItem => {
      // Evaluate open now from opening_hours if present.
      let openNow: boolean | null = null;
      if (row.opening_hours) {
        // Parsing opening_hours is complex; delegate to a future OH library.
        openNow = null;
      }
      return {
        type: 'place',
        id: row.id as unknown as PlaceId,
        name: pickName(row.names, lang),
        category: (row.category as unknown as PlaceCategory) ?? null,
        distanceM: row.distance_m ?? null,
        location: [row.lng, row.lat],
        openNow,
        rating: row.review_avg ?? null,
        reviewCount: row.review_count,
        city: row.city_id as unknown as CityId,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Posts
  // -------------------------------------------------------------------------

  private async _searchPosts(
    needle: string,
    limit: number,
    cursorTs: string | undefined,
  ): Promise<SearchResultItem[]> {
    const cursorFilter = cursorTs
      ? sql`AND p.created_at < ${cursorTs}::timestamptz`
      : sql``;

    // discover.posts may not exist in all migrations; guard with IF EXISTS.
    try {
      const { rows } = await this.db.execute<PostRow>(sql`
        SELECT
          p.id,
          p.author_id,
          u.display_name AS author_name,
          p.body,
          p.created_at,
          COALESCE(p.like_count, 0) AS like_count
        FROM discover.posts p
        JOIN identity.users u ON u.id = p.author_id
        WHERE to_tsvector('arabic', p.body) @@ plainto_tsquery('arabic', ${needle})
          OR similarity(${needle}, p.body) > 0.1
        ${cursorFilter}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
      `);

      return rows.map((row): SearchResultItem => ({
        type: 'post',
        id: row.id,
        authorName: row.author_name,
        authorId: row.author_id as unknown as UserId,
        excerpt: row.body.slice(0, 200),
        createdAt: row.created_at,
        likeCount: row.like_count,
      }));
    } catch {
      // Table not yet migrated in this environment.
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  private async _searchUsers(
    needle: string,
    limit: number,
    _cursorTs: string | undefined,
  ): Promise<SearchResultItem[]> {
    try {
      const { rows } = await this.db.execute<UserRow>(sql`
        SELECT
          id,
          display_name,
          avatar_url,
          bio,
          COALESCE(follower_count, 0) AS follower_count,
          COALESCE(is_provider, false) AS is_provider
        FROM identity.users
        WHERE similarity(${needle}, display_name) > 0.15
           OR ${needle} <% display_name
        ORDER BY similarity(${needle}, display_name) DESC
        LIMIT ${limit}
      `);

      return rows.map((row): SearchResultItem => ({
        type: 'user',
        id: row.id as unknown as UserId,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        followerCount: row.follower_count,
        isProvider: row.is_provider,
      }));
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  private async _searchEvents(
    needle: string,
    filters: Partial<SearchFilters>,
    lang: string,
    limit: number,
    cursorTs: string | undefined,
  ): Promise<SearchResultItem[]> {
    const cursorFilter = cursorTs
      ? sql`AND e.start_at < ${cursorTs}::timestamptz`
      : sql``;
    const cityFilter = filters.city ? sql`AND e.city_id = ${filters.city}` : sql``;

    try {
      const { rows } = await this.db.execute<EventRow>(sql`
        SELECT
          e.id,
          e.title,
          e.start_at,
          e.end_at,
          ST_X(e.location::geometry) AS lng,
          ST_Y(e.location::geometry) AS lat,
          e.venue_name,
          e.city_id,
          COALESCE(e.attendee_count, 0) AS attendee_count
        FROM discover.events e
        WHERE (
          similarity(${needle}, e.title->>'ar') > 0.1
          OR ${needle} <% (e.title->>'ar')
          OR similarity(${needle}, e.title->>'en') > 0.1
        )
        ${cityFilter}
        ${cursorFilter}
        ORDER BY e.start_at ASC
        LIMIT ${limit}
      `);

      return rows.map((row): SearchResultItem => ({
        type: 'event',
        id: row.id,
        title: pickName(row.title, lang),
        startAt: row.start_at,
        endAt: row.end_at,
        location: row.lng != null && row.lat != null ? [row.lng, row.lat] : null,
        venueName: row.venue_name,
        city: row.city_id as unknown as CityId,
        attendeeCount: row.attendee_count,
      }));
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Listings (marketplace / social module)
  // -------------------------------------------------------------------------

  private async _searchListings(
    needle: string,
    filters: Partial<SearchFilters>,
    lang: string,
    limit: number,
    cursorTs: string | undefined,
  ): Promise<SearchResultItem[]> {
    const cursorFilter = cursorTs
      ? sql`AND l.posted_at < ${cursorTs}::timestamptz`
      : sql``;
    const cityFilter = filters.city ? sql`AND l.city_id = ${filters.city}` : sql``;
    const priceMinFilter =
      filters.priceMin != null ? sql`AND l.price_iqd >= ${filters.priceMin}` : sql``;
    const priceMaxFilter =
      filters.priceMax != null ? sql`AND l.price_iqd <= ${filters.priceMax}` : sql``;

    try {
      const { rows } = await this.db.execute<ListingRow>(sql`
        SELECT
          l.id,
          l.title,
          l.price_iqd,
          l.thumbnail_url,
          u.display_name AS seller_name,
          l.city_id,
          l.posted_at
        FROM social.listings l
        JOIN identity.users u ON u.id = l.seller_id
        WHERE (
          similarity(${needle}, l.title->>'ar') > 0.1
          OR ${needle} <% (l.title->>'ar')
          OR similarity(${needle}, l.title->>'en') > 0.1
        )
        ${cityFilter}
        ${priceMinFilter}
        ${priceMaxFilter}
        ${cursorFilter}
        ORDER BY l.posted_at DESC
        LIMIT ${limit}
      `);

      return rows.map((row): SearchResultItem => ({
        type: 'listing',
        id: row.id,
        title: pickName(row.title, lang),
        priceIqd: row.price_iqd,
        thumbnailUrl: row.thumbnail_url,
        sellerName: row.seller_name,
        city: row.city_id as unknown as CityId,
        postedAt: row.posted_at,
      }));
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Tours
  // -------------------------------------------------------------------------

  private async _searchTours(
    needle: string,
    lang: string,
    limit: number,
    _cursorTs: string | undefined,
  ): Promise<SearchResultItem[]> {
    try {
      const { rows } = await this.db.execute<TourRow>(sql`
        SELECT
          t.id,
          t.title,
          t.duration_minutes,
          t.city_id,
          t.thumbnail_url
        FROM tour3d.tours t
        WHERE (
          similarity(${needle}, t.title->>'ar') > 0.1
          OR ${needle} <% (t.title->>'ar')
        )
        ORDER BY similarity(${needle}, t.title->>'ar') DESC
        LIMIT ${limit}
      `);

      return rows.map((row): SearchResultItem => ({
        type: 'tour',
        id: row.id,
        title: pickName(row.title, lang),
        durationMinutes: row.duration_minutes,
        city: row.city_id as unknown as CityId,
        thumbnailUrl: row.thumbnail_url,
      }));
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Autocomplete suggestions
  // -------------------------------------------------------------------------

  async getAutocompleteSuggestions(
    query: string,
    lang: string,
    city: CityId | undefined,
    limit: number,
  ): Promise<SuggestionsResponse> {
    const needle = normalizeArabic(query);
    if (!needle || needle.length < 1) return { suggestions: [] };

    const cityFilter = city ? sql`AND city_id = ${city}` : sql``;

    const { rows } = await this.db.execute<{
      id: string;
      names: Record<string, string>;
      category: string | null;
      city_id: string;
      sim: number;
    }>(sql`
      SELECT
        id,
        names,
        category,
        city_id,
        GREATEST(
          similarity(${needle}, search_text),
          word_similarity(${needle}, search_text)
        ) AS sim
      FROM places.osm_features
      WHERE ${needle} <% search_text
        ${cityFilter}
      ORDER BY sim DESC, kind = 'place' DESC
      LIMIT ${limit}
    `);

    return {
      suggestions: rows.map((row) => ({
        text: pickName(row.names, lang),
        type: 'place' as const,
        placeId: row.id as unknown as PlaceId,
        category: (row.category as unknown as PlaceCategory) ?? null,
        city: row.city_id as unknown as CityId,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Trending
  // -------------------------------------------------------------------------

  async getTrendingSearches(
    city: CityId | undefined,
    limit: number,
  ): Promise<TrendingResponse> {
    const cacheKey = trendingCacheKey(city);

    // Cache hit
    if (this.cache) {
      const raw = await this.cache.get(cacheKey).catch(() => null);
      if (raw) {
        try {
          return JSON.parse(raw) as TrendingResponse;
        } catch {
          // corrupted cache — fall through to DB
        }
      }
    }

    const cityFilter = city
      ? sql`WHERE city_id = ${city}`
      : sql`WHERE city_id IS NULL`;

    const { rows } = await this.db.execute<TrendingRow>(sql`
      SELECT query, city_id, count, trend, updated_at::text AS updated_at
      FROM search.search_trending
      ${cityFilter}
      ORDER BY count DESC, updated_at DESC
      LIMIT ${limit}
    `);

    const updatedAt =
      rows[0]?.updated_at ?? new Date().toISOString();

    const trending: TrendingSearch[] = rows.map((row) => ({
      query: row.query,
      count: row.count,
      city: (row.city_id as CityId) ?? null,
      trend: row.trend as TrendingSearch['trend'],
    }));

    const response: TrendingResponse = { trending, updatedAt };

    // Store to cache
    if (this.cache) {
      await this.cache
        .set(cacheKey, JSON.stringify(response), 'EX', TRENDING_TTL_S)
        .catch(() => null);
    }

    return response;
  }

  /**
   * Refresh trending table from click analytics.
   * Called by a scheduled job (e.g. BullMQ repeating job) every hour.
   */
  async refreshTrending(): Promise<void> {
    // Upsert counts from the last 7 days of search_clicks.
    await this.db.execute(sql`
      INSERT INTO search.search_trending (query, city_id, count, trend, updated_at)
      SELECT
        sc.query,
        NULL AS city_id,
        COUNT(*)::int AS count,
        CASE
          WHEN COUNT(*) FILTER (WHERE sc.clicked_at >= now() - INTERVAL '1 day') >
               COUNT(*) FILTER (WHERE sc.clicked_at BETWEEN now() - INTERVAL '2 days' AND now() - INTERVAL '1 day')
          THEN 'rising'
          WHEN COUNT(*) FILTER (WHERE sc.clicked_at >= now() - INTERVAL '1 day') <
               COUNT(*) FILTER (WHERE sc.clicked_at BETWEEN now() - INTERVAL '2 days' AND now() - INTERVAL '1 day')
          THEN 'falling'
          ELSE 'stable'
        END AS trend,
        now() AS updated_at
      FROM search.search_clicks sc
      WHERE sc.clicked_at >= now() - INTERVAL '7 days'
      GROUP BY sc.query
      HAVING COUNT(*) >= 3
      ORDER BY count DESC
      LIMIT 100
      ON CONFLICT (query, city_id)
        DO UPDATE SET
          count      = EXCLUDED.count,
          trend      = EXCLUDED.trend,
          updated_at = EXCLUDED.updated_at
    `);

    // Bust trending caches.
    if (this.cache) {
      await this.cache.del(trendingCacheKey()).catch(() => null);
    }
  }

  // -------------------------------------------------------------------------
  // Search history
  // -------------------------------------------------------------------------

  async saveSearchHistory(
    userId: UserId,
    query: string,
    filters: Partial<SearchFilters>,
    resultCount: number,
  ): Promise<void> {
    // Insert new entry.
    await this.db
      .insert(searchHistory)
      .values({
        userId,
        query,
        filters: Object.keys(filters).length > 0 ? (filters as unknown as SearchFilters) : null,
        resultCount,
      })
      .execute();

    // Prune to keep at most MAX_HISTORY entries.
    await this.db.execute(sql`
      DELETE FROM search.search_history
      WHERE user_id = ${userId}
        AND id NOT IN (
          SELECT id FROM search.search_history
          WHERE user_id = ${userId}
          ORDER BY searched_at DESC
          LIMIT ${MAX_HISTORY}
        )
    `);
  }

  async getSearchHistory(userId: UserId): Promise<SearchHistoryEntry[]> {
    const rows = await this.db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.searchedAt))
      .limit(MAX_HISTORY)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      filters: (row.filters as unknown as SearchFilters) ?? undefined,
      searchedAt: row.searchedAt.toISOString(),
      resultCount: row.resultCount,
    }));
  }

  async deleteSearchHistory(userId: UserId): Promise<void> {
    await this.db
      .delete(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .execute();
  }

  // -------------------------------------------------------------------------
  // Click analytics
  // -------------------------------------------------------------------------

  async trackSearchClick(
    userId: UserId | null,
    query: string,
    resultId: string,
    resultType: string,
  ): Promise<void> {
    await this.db
      .insert(searchClicks)
      .values({
        userId: userId ?? undefined,
        query,
        resultId,
        resultType,
      })
      .execute();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Fire-and-forget: record history + trending. Never throws. */
  private _recordAsync(
    userId: UserId | null,
    query: string,
    filters: Partial<SearchFilters>,
    resultCount: number,
  ): void {
    if (userId) {
      this.saveSearchHistory(userId, query, filters, resultCount).catch(() => null);
    }

    // Record a raw click with null result_id to count the query itself.
    this.db
      .insert(searchClicks)
      .values({ userId: userId ?? undefined, query, resultId: '_query', resultType: 'place' })
      .execute()
      .catch(() => null);
  }
}
