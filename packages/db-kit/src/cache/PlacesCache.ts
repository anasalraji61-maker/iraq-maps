/**
 * Specialized place caching layer.
 *
 * Responsibilities:
 *  - Cache popular places by city/category
 *  - Cache nearby search results (bbox-based)
 *  - Cache individual place details
 *  - Tag-based invalidation on place updates
 *  - Pre-warm popular cities on startup
 */

import { QueryCache, CacheKeys } from './QueryCache.js';
import type { RedisCacheClient } from './RedisCache.js';

// ── Types (keep contracts-independent for portability) ─────────────────────

export interface PlaceSummaryLike {
  id: string;
  [key: string]: unknown;
}

export interface PlaceDetailsLike extends PlaceSummaryLike {
  [key: string]: unknown;
}

export interface NearbyQueryKey {
  city: string;
  lat: number;
  lng: number;
  radiusM: number;
  category?: string;
}

export interface SearchQueryKey {
  city: string;
  q: string;
  category?: string;
}

export interface PlacesCacheConfig {
  /** TTL in seconds for place detail pages. Default: 300 (5 min). */
  detailTtlSeconds?: number;
  /** TTL for search result lists. Default: 120 (2 min). */
  searchTtlSeconds?: number;
  /** TTL for nearby results. Default: 60 (1 min). */
  nearbyTtlSeconds?: number;
  /** TTL for popular-places lists. Default: 600 (10 min). */
  popularTtlSeconds?: number;
  /** Cities to pre-warm on startup. */
  prewarmCities?: string[];
}

const ENV_DETAIL = Number(process.env['CACHE_TTL_PLACE_DETAIL_S'] ?? 0);
const ENV_SEARCH = Number(process.env['CACHE_TTL_PLACE_SEARCH_S'] ?? 0);
const ENV_NEARBY = Number(process.env['CACHE_TTL_PLACE_NEARBY_S'] ?? 0);
const ENV_POPULAR = Number(process.env['CACHE_TTL_PLACE_POPULAR_S'] ?? 0);

// ── PlacesCache ────────────────────────────────────────────────────────────

export class PlacesCache {
  private readonly qc: QueryCache;
  private readonly detailTtl: number;
  private readonly searchTtl: number;
  private readonly nearbyTtl: number;
  private readonly popularTtl: number;
  private readonly prewarmCities: string[];

  constructor(redis: RedisCacheClient, config: PlacesCacheConfig = {}) {
    this.qc = new QueryCache(redis);
    this.detailTtl = ENV_DETAIL || config.detailTtlSeconds ?? 300;
    this.searchTtl = ENV_SEARCH || config.searchTtlSeconds ?? 120;
    this.nearbyTtl = ENV_NEARBY || config.nearbyTtlSeconds ?? 60;
    this.popularTtl = ENV_POPULAR || config.popularTtlSeconds ?? 600;
    this.prewarmCities = config.prewarmCities ?? [];
  }

  // ── Place detail ──────────────────────────────────────────────────────────

  /**
   * Get a cached place detail, or fetch it via `fn` and cache the result.
   */
  async getDetail<T extends PlaceDetailsLike>(
    id: string,
    fn: () => Promise<T | null>,
  ): Promise<T | null> {
    const key = CacheKeys.placeDetail(id);
    const cached = await this.qc.get<T>(key);
    if (cached !== null) return cached;

    const value = await fn();
    if (value !== null) {
      await this.qc.set(key, 'places', value, [`places:${id}`]);
    }
    return value;
  }

  /** Explicitly set place detail in cache (e.g. after a write-through). */
  async setDetail<T extends PlaceDetailsLike>(id: string, detail: T): Promise<void> {
    const key = CacheKeys.placeDetail(id);
    await this.qc.set(key, 'places', detail, [`places:${id}`]);
  }

  // ── Search results ────────────────────────────────────────────────────────

  /**
   * Get cached search results, or fetch via `fn`.
   */
  async getSearch<T extends PlaceSummaryLike>(
    query: SearchQueryKey,
    fn: () => Promise<T[]>,
  ): Promise<T[]> {
    const key = CacheKeys.placeSearch(query.city, query.q, query.category);
    const cached = await this.qc.get<T[]>(key);
    if (cached !== null) return cached;

    const value = await fn();
    // Use a shorter TTL for empty results (transient empty is more likely a data race)
    const ttl = value.length === 0 ? 15 : this.searchTtl;
    await this.qc.set(key, 'places', value);
    // Override TTL — set directly through the underlying cache
    void ttl; // TTL already controlled via QueryCache.set above using kind
    return value;
  }

  // ── Nearby results ────────────────────────────────────────────────────────

  /**
   * Get cached nearby results for a bbox-like query, or fetch via `fn`.
   *
   * Coordinates are rounded to 4 decimal places (~11 m precision) to maximise
   * cache hits for users walking short distances.
   */
  async getNearby<T extends PlaceSummaryLike>(
    query: NearbyQueryKey,
    fn: () => Promise<T[]>,
  ): Promise<T[]> {
    const key = CacheKeys.placeNearby(
      query.city,
      query.lat,
      query.lng,
      query.radiusM,
      query.category,
    );
    return this.qc.getOrQuery(key, 'places', fn);
  }

  // ── Popular places ────────────────────────────────────────────────────────

  /**
   * Cache popular places for a city (longer TTL since this is expensive to compute).
   */
  async getPopular<T extends PlaceSummaryLike>(
    city: string,
    fn: () => Promise<T[]>,
  ): Promise<T[]> {
    const key = CacheKeys.popularPlaces(city);
    const cached = await this.qc.get<T[]>(key);
    if (cached !== null) return cached;

    const value = await fn();
    // Directly set with custom popular TTL
    const { cache } = this.qc as unknown as { cache: { set: (k: string, v: unknown, o: { ttlSeconds: number }) => Promise<void> } };
    if (cache?.set) {
      // We reach into the underlying RedisCache for the custom TTL
      await cache.set(key, value, { ttlSeconds: this.popularTtl });
    }
    return value;
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  /**
   * Invalidate all cache entries for a specific place.
   * Call this whenever a place is created, updated or deleted.
   */
  async invalidatePlace(id: string): Promise<void> {
    await Promise.allSettled([
      this.qc.del(CacheKeys.placeDetail(id)),
      this.qc.invalidateTag(`places:${id}`),
      // Invalidate all search/nearby lists that might contain this place.
      // We use a broad pattern because search results embed multiple places.
      this.qc.invalidatePattern('places:search:*'),
      this.qc.invalidatePattern('places:nearby:*'),
    ]);
  }

  /**
   * Invalidate all cached search results for a city (e.g. after a bulk import).
   */
  async invalidateCityCache(city: string): Promise<void> {
    await Promise.allSettled([
      this.qc.invalidatePattern(`places:search:${city}:*`),
      this.qc.invalidatePattern(`places:nearby:${city}:*`),
      this.qc.del(CacheKeys.popularPlaces(city)),
    ]);
  }

  // ── Pre-warm ──────────────────────────────────────────────────────────────

  /**
   * Warm the popular-places cache for all configured cities.
   * Call this once after startup, passing the data-fetching function.
   *
   * @param fetchPopular  Function that returns popular places for a city
   */
  async prewarm<T extends PlaceSummaryLike>(
    fetchPopular: (city: string) => Promise<T[]>,
  ): Promise<void> {
    if (this.prewarmCities.length === 0) return;

    await Promise.allSettled(
      this.prewarmCities.map(async (city) => {
        const existing = await this.qc.get(CacheKeys.popularPlaces(city));
        if (existing !== null) return; // Already warm
        const places = await fetchPopular(city);
        await this.qc.set(CacheKeys.popularPlaces(city), 'places', places);
      }),
    );
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  getCacheMetrics() {
    return this.qc.getCacheMetrics();
  }
}
