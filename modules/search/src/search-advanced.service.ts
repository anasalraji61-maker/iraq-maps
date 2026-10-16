/**
 * SearchAdvancedService – advanced filtered search, presets, collections
 * and personalised recommendations.
 *
 * All personalisation signals come from the DB (search history, reviews written,
 * places visited). Never inferred on the client.
 */

import type { PlaceCategory, PlaceId, UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { normalizeArabic } from '@iraq-maps/i18n';
import { sql } from 'drizzle-orm';
import type { CacheClient } from './search.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdvancedPlaceFilters {
  categories?: PlaceCategory[];
  minRating?: number;
  /** metres */
  maxDistance?: number;
  /** free | cheap | moderate | expensive */
  priceRange?: string[];
  openNow?: boolean;
  /** amenity keys: acceptsCards, hasParking, hasWifi, hasDelivery */
  amenities?: string[];
  cuisines?: string[];
  sortBy?: 'relevance' | 'distance' | 'rating' | 'newest' | 'most_reviewed';
  lang?: string;
  limit?: number;
  cursor?: string;
}

export interface SearchPreset {
  id: string;
  userId: string;
  name: string;
  filters: AdvancedPlaceFilters;
  createdAt: string;
}

export interface RecommendationSection {
  key: 'new' | 'reviews' | 'popular' | 'hidden';
  places: RecommendedPlace[];
}

export interface RecommendedPlace {
  id: string;
  name: string;
  category: PlaceCategory | null;
  distanceM: number | null;
  location: [number, number];
  openNow: boolean | null;
  rating: number | null;
  reviewCount: number;
  city: string;
  reason: string;
  sectionKey: string;
  photoUri: string | null;
}

export interface SimilarPlace {
  id: string;
  name: string;
  category: PlaceCategory | null;
  distanceM: number | null;
  location: [number, number];
  rating: number | null;
  reviewCount: number;
  city: string;
  similarity: number;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  icon: string;
  color: string;
  placeCount: number;
  isOwner: boolean;
  ownerName?: string;
  description?: string;
  isOfficial: boolean;
  createdAt: string;
  shareUrl?: string;
}

// ── Raw row shapes ────────────────────────────────────────────────────────────

interface PlaceRow extends Record<string, unknown> {
  id: string;
  names: Record<string, string>;
  category: string | null;
  lng: number;
  lat: number;
  distance_m: number | null;
  review_avg: number | null;
  review_count: number;
  city_id: string;
  opening_hours: string | null;
  price_level: string | null;
  has_cards: boolean | null;
  has_parking: boolean | null;
  has_wifi: boolean | null;
  has_delivery: boolean | null;
  cuisine: string | null;
  created_at: string;
  photo_url: string | null;
}

interface PresetRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  filters: string;
  created_at: string;
}

interface CollectionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  place_count: number;
  owner_name: string;
  description: string | null;
  is_official: boolean;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRESETS_CACHE_TTL = 300; // 5 minutes

function presetsCacheKey(userId: string): string {
  return `search:presets:${userId}`;
}

function collectionsCacheKey(userId: string, scope: string): string {
  return `search:collections:${userId}:${scope}`;
}

/** Pick the localised name (ar → ckb → en → first value). */
function pickName(names: Record<string, string>, lang = 'ar'): string {
  return names[lang] ?? names['ckb'] ?? names['en'] ?? Object.values(names)[0] ?? '';
}

/** Map DB price_level string to a category bucket. */
function priceLevelToBucket(level: string | null): string {
  if (!level) return 'moderate';
  const n = parseInt(level, 10);
  if (isNaN(n)) return level;
  if (n <= 1) return 'free';
  if (n === 2) return 'cheap';
  if (n === 3) return 'moderate';
  return 'expensive';
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SearchAdvancedService {
  constructor(
    private readonly db: Db,
    private readonly cache: CacheClient | null,
  ) {}

  // ── Advanced filtered place search ─────────────────────────────────────────

  async searchWithFilters(
    query: string,
    filters: AdvancedPlaceFilters,
    location: [number, number] | null,
  ): Promise<RecommendedPlace[]> {
    const needle = normalizeArabic(query);
    const lang = filters.lang ?? 'ar';
    const limit = filters.limit ?? 20;

    const point = location
      ? sql`ST_SetSRID(ST_MakePoint(${location[0]}::float8, ${location[1]}::float8), 4326)::geography`
      : null;

    const distExpr = point
      ? sql`ST_Distance(location, ${point})`
      : sql`NULL::float8`;

    // Radius filter
    const radiusFilter =
      point && filters.maxDistance
        ? sql`AND ST_DWithin(location, ${point}, ${filters.maxDistance})`
        : sql``;

    // Rating filter
    const ratingFilter =
      filters.minRating != null
        ? sql`AND COALESCE(review_avg, 0) >= ${filters.minRating}`
        : sql``;

    // Category filter (multi)
    const categoryFilter =
      filters.categories && filters.categories.length > 0
        ? sql`AND category = ANY(${filters.categories})`
        : sql``;

    // Price range filter
    const priceFilter =
      filters.priceRange && filters.priceRange.length > 0
        ? sql`AND price_level_bucket = ANY(${filters.priceRange})`
        : sql``;

    // Open now filter — simplified (full OSM hours parsing is deferred)
    const openNowFilter = filters.openNow
      ? sql`AND opening_hours IS NOT NULL`
      : sql``;

    // Amenity filters
    const cardFilter =
      filters.amenities?.includes('acceptsCards')
        ? sql`AND has_cards = true`
        : sql``;
    const parkingFilter =
      filters.amenities?.includes('hasParking')
        ? sql`AND has_parking = true`
        : sql``;
    const wifiFilter =
      filters.amenities?.includes('hasWifi')
        ? sql`AND has_wifi = true`
        : sql``;
    const deliveryFilter =
      filters.amenities?.includes('hasDelivery')
        ? sql`AND has_delivery = true`
        : sql``;

    // Cuisine filter
    const cuisineFilter =
      filters.cuisines && filters.cuisines.length > 0
        ? sql`AND cuisine = ANY(${filters.cuisines})`
        : sql``;

    // Sort
    const orderBy = (() => {
      switch (filters.sortBy) {
        case 'distance':
          return sql`distance_m ASC NULLS LAST`;
        case 'rating':
          return sql`COALESCE(review_avg, 0) DESC, distance_m ASC NULLS LAST`;
        case 'newest':
          return sql`created_at DESC`;
        case 'most_reviewed':
          return sql`COALESCE(review_count, 0) DESC`;
        default:
          return needle
            ? sql`GREATEST(similarity(${needle}, search_text), word_similarity(${needle}, search_text)) DESC, distance_m ASC NULLS LAST`
            : sql`distance_m ASC NULLS LAST`;
      }
    })();

    // Text match clause
    const textMatch = needle
      ? sql`(${needle} <% search_text OR similarity(${needle}, search_text) > 0.12)`
      : sql`TRUE`;

    const { rows } = await this.db.execute<PlaceRow>(sql`
      SELECT
        id,
        names,
        category,
        ST_X(location::geometry) AS lng,
        ST_Y(location::geometry) AS lat,
        ${distExpr} AS distance_m,
        review_avg,
        COALESCE(review_count, 0) AS review_count,
        city_id,
        opening_hours,
        price_level,
        has_cards,
        has_parking,
        has_wifi,
        has_delivery,
        cuisine,
        created_at::text AS created_at,
        NULL::text AS photo_url
      FROM places.osm_features
      WHERE ${textMatch}
        ${categoryFilter}
        ${radiusFilter}
        ${ratingFilter}
        ${priceFilter}
        ${openNowFilter}
        ${cardFilter}
        ${parkingFilter}
        ${wifiFilter}
        ${deliveryFilter}
        ${cuisineFilter}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `);

    return rows.map((row): RecommendedPlace => ({
      id: row.id,
      name: pickName(row.names, lang),
      category: (row.category as PlaceCategory) ?? null,
      distanceM: row.distance_m,
      location: [row.lng, row.lat],
      openNow: null, // full OSM parsing deferred
      rating: row.review_avg,
      reviewCount: row.review_count,
      city: row.city_id,
      reason: '',
      sectionKey: 'search',
      photoUri: row.photo_url,
    }));
  }

  // ── Save search preset ─────────────────────────────────────────────────────

  async saveSearchPreset(
    userId: UserId,
    name: string,
    filters: AdvancedPlaceFilters,
  ): Promise<SearchPreset> {
    const { rows } = await this.db.execute<{ id: string; created_at: string }>(sql`
      INSERT INTO search.search_presets (user_id, name, filters)
      VALUES (${userId}, ${name}, ${JSON.stringify(filters)}::jsonb)
      RETURNING id, created_at::text AS created_at
    `);

    const row = rows[0]!;

    // Bust cache
    if (this.cache) {
      await this.cache.del(presetsCacheKey(userId)).catch(() => null);
    }

    return {
      id: row.id,
      userId,
      name,
      filters,
      createdAt: row.created_at,
    };
  }

  // ── Get saved presets ──────────────────────────────────────────────────────

  async getSavedSearches(userId: UserId): Promise<SearchPreset[]> {
    const cacheKey = presetsCacheKey(userId);

    if (this.cache) {
      const raw = await this.cache.get(cacheKey).catch(() => null);
      if (raw) {
        try {
          return JSON.parse(raw) as SearchPreset[];
        } catch {
          // fall through
        }
      }
    }

    const { rows } = await this.db.execute<PresetRow>(sql`
      SELECT id, user_id, name, filters::text AS filters, created_at::text AS created_at
      FROM search.search_presets
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `);

    const presets: SearchPreset[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      filters: JSON.parse(row.filters) as AdvancedPlaceFilters,
      createdAt: row.created_at,
    }));

    if (this.cache) {
      await this.cache
        .set(cacheKey, JSON.stringify(presets), 'EX', PRESETS_CACHE_TTL)
        .catch(() => null);
    }

    return presets;
  }

  // ── Delete preset ──────────────────────────────────────────────────────────

  async deleteSavedSearch(userId: UserId, searchId: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM search.search_presets
      WHERE id = ${searchId} AND user_id = ${userId}
    `);

    if (this.cache) {
      await this.cache.del(presetsCacheKey(userId)).catch(() => null);
    }
  }

  // ── Personalised recommendations ───────────────────────────────────────────

  async getRecommendations(
    userId: UserId,
    lat: number,
    lng: number,
  ): Promise<RecommendationSection[]> {
    const point = sql`ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geography`;

    // Popular near user (top rated within 5 km, not visited)
    const popularRows = await this._fetchPopularNearby(point, userId);

    // New places the user hasn't seen (added in last 30 days, within 10 km)
    const newRows = await this._fetchNewNearby(point, userId);

    // Based on categories from past reviews
    const reviewBasedRows = await this._fetchBasedOnReviews(point, userId);

    // Hidden gems: low review count but high rating, within 15 km
    const hiddenRows = await this._fetchHiddenGems(point, userId);

    return [
      {
        key: 'new',
        places: newRows.map((p) => ({ ...p, reason: t_reason('new'), sectionKey: 'new' })),
      },
      {
        key: 'reviews',
        places: reviewBasedRows.map((p) => ({ ...p, reason: t_reason('reviews'), sectionKey: 'reviews' })),
      },
      {
        key: 'popular',
        places: popularRows.map((p) => ({ ...p, reason: t_reason('popular'), sectionKey: 'popular' })),
      },
      {
        key: 'hidden',
        places: hiddenRows.map((p) => ({ ...p, reason: t_reason('hidden'), sectionKey: 'hidden' })),
      },
    ].filter((s) => s.places.length > 0) as RecommendationSection[];
  }

  private async _fetchPopularNearby(
    point: ReturnType<typeof sql>,
    userId: UserId,
  ): Promise<Omit<RecommendedPlace, 'reason' | 'sectionKey'>[]> {
    try {
      const { rows } = await this.db.execute<PlaceRow>(sql`
        SELECT
          f.id,
          f.names,
          f.category,
          ST_X(f.location::geometry) AS lng,
          ST_Y(f.location::geometry) AS lat,
          ST_Distance(f.location, ${point}) AS distance_m,
          f.review_avg,
          COALESCE(f.review_count, 0) AS review_count,
          f.city_id,
          f.opening_hours,
          NULL AS price_level,
          NULL AS has_cards,
          NULL AS has_parking,
          NULL AS has_wifi,
          NULL AS has_delivery,
          NULL AS cuisine,
          f.created_at::text AS created_at,
          NULL::text AS photo_url
        FROM places.osm_features f
        WHERE ST_DWithin(f.location, ${point}, 5000)
          AND COALESCE(f.review_avg, 0) >= 4.0
          AND COALESCE(f.review_count, 0) >= 5
          AND f.id NOT IN (
            SELECT DISTINCT result_id FROM search.search_clicks
            WHERE user_id = ${userId}
          )
        ORDER BY f.review_avg DESC, distance_m ASC
        LIMIT 10
      `);
      return rows.map((row) => this._mapRow(row));
    } catch {
      return [];
    }
  }

  private async _fetchNewNearby(
    point: ReturnType<typeof sql>,
    userId: UserId,
  ): Promise<Omit<RecommendedPlace, 'reason' | 'sectionKey'>[]> {
    try {
      const { rows } = await this.db.execute<PlaceRow>(sql`
        SELECT
          f.id,
          f.names,
          f.category,
          ST_X(f.location::geometry) AS lng,
          ST_Y(f.location::geometry) AS lat,
          ST_Distance(f.location, ${point}) AS distance_m,
          f.review_avg,
          COALESCE(f.review_count, 0) AS review_count,
          f.city_id,
          f.opening_hours,
          NULL AS price_level,
          NULL AS has_cards,
          NULL AS has_parking,
          NULL AS has_wifi,
          NULL AS has_delivery,
          NULL AS cuisine,
          f.created_at::text AS created_at,
          NULL::text AS photo_url
        FROM places.osm_features f
        WHERE ST_DWithin(f.location, ${point}, 10000)
          AND f.created_at >= now() - INTERVAL '30 days'
          AND f.id NOT IN (
            SELECT DISTINCT result_id FROM search.search_clicks
            WHERE user_id = ${userId}
          )
        ORDER BY f.created_at DESC, distance_m ASC
        LIMIT 8
      `);
      return rows.map((row) => this._mapRow(row));
    } catch {
      return [];
    }
  }

  private async _fetchBasedOnReviews(
    point: ReturnType<typeof sql>,
    userId: UserId,
  ): Promise<Omit<RecommendedPlace, 'reason' | 'sectionKey'>[]> {
    try {
      // Find user's top reviewed categories
      const { rows: catRows } = await this.db.execute<{ category: string }>(sql`
        SELECT f.category
        FROM reviews.place_reviews r
        JOIN places.osm_features f ON f.id = r.place_id
        WHERE r.user_id = ${userId}
          AND r.rating >= 4
          AND f.category IS NOT NULL
        GROUP BY f.category
        ORDER BY COUNT(*) DESC
        LIMIT 3
      `);

      if (catRows.length === 0) return [];

      const categories = catRows.map((r) => r.category);

      const { rows } = await this.db.execute<PlaceRow>(sql`
        SELECT
          f.id,
          f.names,
          f.category,
          ST_X(f.location::geometry) AS lng,
          ST_Y(f.location::geometry) AS lat,
          ST_Distance(f.location, ${point}) AS distance_m,
          f.review_avg,
          COALESCE(f.review_count, 0) AS review_count,
          f.city_id,
          f.opening_hours,
          NULL AS price_level,
          NULL AS has_cards,
          NULL AS has_parking,
          NULL AS has_wifi,
          NULL AS has_delivery,
          NULL AS cuisine,
          f.created_at::text AS created_at,
          NULL::text AS photo_url
        FROM places.osm_features f
        WHERE ST_DWithin(f.location, ${point}, 10000)
          AND f.category = ANY(${categories})
          AND COALESCE(f.review_avg, 0) >= 3.5
          AND f.id NOT IN (
            SELECT place_id FROM reviews.place_reviews WHERE user_id = ${userId}
          )
        ORDER BY f.review_avg DESC NULLS LAST, distance_m ASC
        LIMIT 8
      `);

      return rows.map((row) => this._mapRow(row));
    } catch {
      return [];
    }
  }

  private async _fetchHiddenGems(
    point: ReturnType<typeof sql>,
    _userId: UserId,
  ): Promise<Omit<RecommendedPlace, 'reason' | 'sectionKey'>[]> {
    try {
      const { rows } = await this.db.execute<PlaceRow>(sql`
        SELECT
          f.id,
          f.names,
          f.category,
          ST_X(f.location::geometry) AS lng,
          ST_Y(f.location::geometry) AS lat,
          ST_Distance(f.location, ${point}) AS distance_m,
          f.review_avg,
          COALESCE(f.review_count, 0) AS review_count,
          f.city_id,
          f.opening_hours,
          NULL AS price_level,
          NULL AS has_cards,
          NULL AS has_parking,
          NULL AS has_wifi,
          NULL AS has_delivery,
          NULL AS cuisine,
          f.created_at::text AS created_at,
          NULL::text AS photo_url
        FROM places.osm_features f
        WHERE ST_DWithin(f.location, ${point}, 15000)
          AND COALESCE(f.review_avg, 0) >= 4.2
          AND COALESCE(f.review_count, 0) BETWEEN 1 AND 10
        ORDER BY f.review_avg DESC, distance_m ASC
        LIMIT 8
      `);
      return rows.map((row) => this._mapRow(row));
    } catch {
      return [];
    }
  }

  private _mapRow(row: PlaceRow, lang = 'ar'): Omit<RecommendedPlace, 'reason' | 'sectionKey'> {
    return {
      id: row.id,
      name: pickName(row.names, lang),
      category: (row.category as PlaceCategory) ?? null,
      distanceM: row.distance_m,
      location: [row.lng, row.lat],
      openNow: null,
      rating: row.review_avg,
      reviewCount: row.review_count,
      city: row.city_id,
      photoUri: row.photo_url,
    };
  }

  // ── Similar places ────────────────────────────────────────────────────────

  async getSimilarPlaces(placeId: PlaceId, limit = 5): Promise<SimilarPlace[]> {
    try {
      // Fetch the source place
      const { rows: source } = await this.db.execute<{
        category: string | null;
        lng: number;
        lat: number;
        search_text: string;
      }>(sql`
        SELECT
          category,
          ST_X(location::geometry) AS lng,
          ST_Y(location::geometry) AS lat,
          search_text
        FROM places.osm_features
        WHERE id = ${placeId}
        LIMIT 1
      `);

      if (source.length === 0) return [];
      const src = source[0]!;

      const point = sql`ST_SetSRID(ST_MakePoint(${src.lng}::float8, ${src.lat}::float8), 4326)::geography`;
      const categoryFilter = src.category
        ? sql`AND f.category = ${src.category}`
        : sql``;

      const { rows } = await this.db.execute<
        PlaceRow & { sim: number }
      >(sql`
        SELECT
          f.id,
          f.names,
          f.category,
          ST_X(f.location::geometry) AS lng,
          ST_Y(f.location::geometry) AS lat,
          ST_Distance(f.location, ${point}) AS distance_m,
          f.review_avg,
          COALESCE(f.review_count, 0) AS review_count,
          f.city_id,
          f.opening_hours,
          NULL AS price_level,
          NULL AS has_cards,
          NULL AS has_parking,
          NULL AS has_wifi,
          NULL AS has_delivery,
          NULL AS cuisine,
          f.created_at::text AS created_at,
          NULL::text AS photo_url,
          similarity(${src.search_text}, f.search_text) AS sim
        FROM places.osm_features f
        WHERE f.id != ${placeId}
          ${categoryFilter}
          AND ST_DWithin(f.location, ${point}, 3000)
          AND similarity(${src.search_text}, f.search_text) > 0.1
        ORDER BY sim DESC, distance_m ASC
        LIMIT ${limit}
      `);

      return rows.map((row) => ({
        id: row.id,
        name: pickName(row.names),
        category: (row.category as PlaceCategory) ?? null,
        distanceM: row.distance_m,
        location: [row.lng, row.lat] as [number, number],
        rating: row.review_avg,
        reviewCount: row.review_count,
        city: row.city_id,
        similarity: row.sim,
      }));
    } catch {
      return [];
    }
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async getCollections(userId: UserId, scope: 'mine' | 'friends' | 'official'): Promise<Collection[]> {
    const cacheKey = collectionsCacheKey(userId, scope);

    if (this.cache) {
      const raw = await this.cache.get(cacheKey).catch(() => null);
      if (raw) {
        try {
          return JSON.parse(raw) as Collection[];
        } catch {
          // fall through
        }
      }
    }

    let rows: CollectionRow[] = [];

    try {
      if (scope === 'mine') {
        const result = await this.db.execute<CollectionRow>(sql`
          SELECT
            c.id,
            c.user_id,
            c.name,
            c.icon,
            c.color,
            COALESCE(c.place_count, 0) AS place_count,
            u.display_name AS owner_name,
            c.description,
            false AS is_official,
            c.created_at::text AS created_at
          FROM search.collections c
          JOIN identity.users u ON u.id = c.user_id
          WHERE c.user_id = ${userId} AND c.is_official = false
          ORDER BY c.created_at DESC
          LIMIT 50
        `);
        rows = result.rows;
      } else if (scope === 'friends') {
        const result = await this.db.execute<CollectionRow>(sql`
          SELECT
            c.id,
            c.user_id,
            c.name,
            c.icon,
            c.color,
            COALESCE(c.place_count, 0) AS place_count,
            u.display_name AS owner_name,
            c.description,
            false AS is_official,
            c.created_at::text AS created_at
          FROM search.collections c
          JOIN identity.users u ON u.id = c.user_id
          JOIN identity.follows f ON f.followee_id = c.user_id AND f.follower_id = ${userId}
          WHERE c.is_public = true AND c.is_official = false
          ORDER BY c.created_at DESC
          LIMIT 50
        `);
        rows = result.rows;
      } else {
        const result = await this.db.execute<CollectionRow>(sql`
          SELECT
            c.id,
            c.user_id,
            c.name,
            c.icon,
            c.color,
            COALESCE(c.place_count, 0) AS place_count,
            'Iraq Smart Maps' AS owner_name,
            c.description,
            true AS is_official,
            c.created_at::text AS created_at
          FROM search.collections c
          WHERE c.is_official = true
          ORDER BY c.sort_order ASC, c.created_at DESC
          LIMIT 30
        `);
        rows = result.rows;
      }
    } catch {
      return [];
    }

    const collections: Collection[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      placeCount: row.place_count,
      isOwner: row.user_id === userId,
      ownerName: row.owner_name,
      description: row.description ?? undefined,
      isOfficial: row.is_official,
      createdAt: row.created_at,
    }));

    if (this.cache) {
      await this.cache
        .set(cacheKey, JSON.stringify(collections), 'EX', 120)
        .catch(() => null);
    }

    return collections;
  }

  async createCollection(
    userId: UserId,
    name: string,
    icon: string,
    color: string,
    description?: string,
  ): Promise<Collection> {
    const { rows } = await this.db.execute<{ id: string; created_at: string }>(sql`
      INSERT INTO search.collections (user_id, name, icon, color, description, is_official, is_public, place_count)
      VALUES (${userId}, ${name}, ${icon}, ${color}, ${description ?? null}, false, false, 0)
      RETURNING id, created_at::text AS created_at
    `);

    const row = rows[0]!;

    if (this.cache) {
      await this.cache.del(collectionsCacheKey(userId, 'mine')).catch(() => null);
    }

    return {
      id: row.id,
      userId,
      name,
      icon,
      color,
      placeCount: 0,
      isOwner: true,
      description,
      isOfficial: false,
      createdAt: row.created_at,
    };
  }

  async updateCollection(
    userId: UserId,
    collectionId: string,
    update: { name?: string; icon?: string; color?: string },
  ): Promise<void> {
    const parts: ReturnType<typeof sql>[] = [];
    if (update.name !== undefined) parts.push(sql`name = ${update.name}`);
    if (update.icon !== undefined) parts.push(sql`icon = ${update.icon}`);
    if (update.color !== undefined) parts.push(sql`color = ${update.color}`);
    if (parts.length === 0) return;

    // Build SET clause safely
    await this.db.execute(sql`
      UPDATE search.collections
      SET name = COALESCE(${update.name ?? null}, name),
          icon = COALESCE(${update.icon ?? null}, icon),
          color = COALESCE(${update.color ?? null}, color)
      WHERE id = ${collectionId} AND user_id = ${userId}
    `);

    if (this.cache) {
      await this.cache.del(collectionsCacheKey(userId, 'mine')).catch(() => null);
    }
  }

  async deleteCollection(userId: UserId, collectionId: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM search.collections
      WHERE id = ${collectionId} AND user_id = ${userId} AND is_official = false
    `);

    if (this.cache) {
      await this.cache.del(collectionsCacheKey(userId, 'mine')).catch(() => null);
    }
  }

  async addPlaceToCollection(
    userId: UserId,
    collectionId: string,
    placeId: PlaceId,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO search.collection_places (collection_id, place_id, added_at)
      SELECT ${collectionId}, ${placeId}, now()
      FROM search.collections
      WHERE id = ${collectionId} AND user_id = ${userId}
      ON CONFLICT DO NOTHING
    `);

    // Update count
    await this.db.execute(sql`
      UPDATE search.collections
      SET place_count = (
        SELECT COUNT(*) FROM search.collection_places WHERE collection_id = ${collectionId}
      )
      WHERE id = ${collectionId}
    `);

    if (this.cache) {
      await this.cache.del(collectionsCacheKey(userId, 'mine')).catch(() => null);
    }
  }

  async removePlaceFromCollection(
    userId: UserId,
    collectionId: string,
    placeId: PlaceId,
  ): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM search.collection_places cp
      USING search.collections c
      WHERE cp.collection_id = c.id
        AND c.id = ${collectionId}
        AND c.user_id = ${userId}
        AND cp.place_id = ${placeId}
    `);

    await this.db.execute(sql`
      UPDATE search.collections
      SET place_count = (
        SELECT COUNT(*) FROM search.collection_places WHERE collection_id = ${collectionId}
      )
      WHERE id = ${collectionId}
    `);

    if (this.cache) {
      await this.cache.del(collectionsCacheKey(userId, 'mine')).catch(() => null);
    }
  }

  // ── Recommendation feedback ───────────────────────────────────────────────

  async recordRecommendationFeedback(
    userId: UserId,
    placeId: PlaceId,
    feedback: 'up' | 'down',
  ): Promise<void> {
    await this.db
      .execute(sql`
        INSERT INTO search.recommendation_feedback (user_id, place_id, feedback, created_at)
        VALUES (${userId}, ${placeId}, ${feedback}, now())
        ON CONFLICT (user_id, place_id)
          DO UPDATE SET feedback = EXCLUDED.feedback, created_at = now()
      `)
      .catch(() => null);
  }
}

/** Hard-coded reason strings for recommendations. In production these would
 *  come from the DB row or be translated via the i18n module. */
function t_reason(key: string): string {
  const reasons: Record<string, string> = {
    new: 'مكان جديد في منطقتك',
    reviews: 'بناءً على تقييماتك السابقة',
    popular: 'شائع بالقرب منك',
    hidden: 'جوهرة خفية ذات تقييم عالٍ',
  };
  return reasons[key] ?? '';
}
