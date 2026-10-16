/**
 * Query result cache wrapping Drizzle ORM results.
 *
 * Features:
 *  - TTL by entity type (places, providers, users, reviews, static)
 *  - Tag-based invalidation: invalidate all keys tagged with 'place:123'
 *  - Configurable TTLs via environment variables
 *  - Mutation-triggered invalidation helpers
 *  - Graceful fallback: cache errors never propagate to callers
 */

import { RedisCache, type RedisCacheClient } from './RedisCache.js';

// ── Entity TTL defaults (seconds) ──────────────────────────────────────────

export const DEFAULT_TTL: Record<EntityKind, number> = {
  places: 5 * 60,       // 5 minutes
  providers: 2 * 60,    // 2 minutes
  users: 1 * 60,        // 1 minute
  reviews: 3 * 60,      // 3 minutes
  static: 60 * 60,      // 1 hour (categories, governorates, etc.)
};

export type EntityKind = 'places' | 'providers' | 'users' | 'reviews' | 'static';

// ── Config ─────────────────────────────────────────────────────────────────

export interface QueryCacheConfig {
  /** Override default TTLs per entity kind. Values in seconds. */
  ttlOverrides?: Partial<Record<EntityKind, number>>;
  /**
   * When true, the cache is effectively disabled (getOrQuery always calls fn).
   * Useful for integration-test runs that want fresh DB state.
   */
  disabled?: boolean;
}

/** Read per-entity TTL overrides from env vars (CACHE_TTL_PLACES_S, etc.). */
export function ttlFromEnv(): Partial<Record<EntityKind, number>> {
  const read = (key: string): number | undefined => {
    const v = process.env[key];
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    places: read('CACHE_TTL_PLACES_S'),
    providers: read('CACHE_TTL_PROVIDERS_S'),
    users: read('CACHE_TTL_USERS_S'),
    reviews: read('CACHE_TTL_REVIEWS_S'),
    static: read('CACHE_TTL_STATIC_S'),
  };
}

// ── QueryCache ─────────────────────────────────────────────────────────────

/**
 * Cache for Drizzle query results, keyed by a stable cache key you derive
 * from the query parameters.
 *
 * Usage:
 *   const qc = new QueryCache(redis);
 *   const places = await qc.getOrQuery('places:search:baghdad:food', 'places', () => db.query...());
 */
export class QueryCache {
  private readonly cache: RedisCache;
  private readonly ttl: Record<EntityKind, number>;
  private readonly disabled: boolean;

  /** tag → Set<cacheKey> index (in-process, ephemeral) */
  private readonly tagIndex = new Map<string, Set<string>>();

  constructor(redis: RedisCacheClient, config: QueryCacheConfig = {}) {
    this.cache = new RedisCache(redis, 'qc');
    const overrides = { ...ttlFromEnv(), ...config.ttlOverrides };
    this.ttl = {
      places: overrides.places ?? DEFAULT_TTL.places,
      providers: overrides.providers ?? DEFAULT_TTL.providers,
      users: overrides.users ?? DEFAULT_TTL.users,
      reviews: overrides.reviews ?? DEFAULT_TTL.reviews,
      static: overrides.static ?? DEFAULT_TTL.static,
    };
    this.disabled = config.disabled ?? false;
  }

  // ── Core ──────────────────────────────────────────────────────────────────

  /**
   * Fetch from cache, or run `fn` and cache the result.
   *
   * @param cacheKey    Stable, deterministic key for this query result
   * @param kind        Entity type — governs TTL
   * @param fn          DB query to execute on a cache miss
   * @param tags        Optional tags for group-invalidation (e.g. ['place:42'])
   */
  async getOrQuery<T>(
    cacheKey: string,
    kind: EntityKind,
    fn: () => Promise<T>,
    tags?: string[],
  ): Promise<T> {
    if (this.disabled) return fn();

    const cached = await this.cache.get<T>(cacheKey);
    if (cached !== null) return cached;

    const value = await fn();
    const ttlSeconds = this.ttl[kind];
    await this.cache.set(cacheKey, value, { ttlSeconds });

    // Register tags
    for (const tag of tags ?? []) {
      const set = this.tagIndex.get(tag) ?? new Set();
      set.add(cacheKey);
      this.tagIndex.set(tag, set);
    }

    return value;
  }

  // ── Single-key operations ─────────────────────────────────────────────────

  async get<T>(cacheKey: string): Promise<T | null> {
    if (this.disabled) return null;
    return this.cache.get<T>(cacheKey);
  }

  async set<T>(cacheKey: string, kind: EntityKind, value: T, extraTags?: string[]): Promise<void> {
    if (this.disabled) return;
    await this.cache.set(cacheKey, value, { ttlSeconds: this.ttl[kind] });
    for (const tag of extraTags ?? []) {
      const set = this.tagIndex.get(tag) ?? new Set();
      set.add(cacheKey);
      this.tagIndex.set(tag, set);
    }
  }

  async del(cacheKey: string): Promise<void> {
    await this.cache.del(cacheKey);
  }

  // ── Invalidation ──────────────────────────────────────────────────────────

  /**
   * Invalidate all cache keys registered under `tag`.
   * Also removes the tag from the in-process index.
   *
   * Example:
   *   await qc.invalidateTag('place:42')
   *   // invalidates 'places:detail:42', 'places:reviews:42', etc.
   */
  async invalidateTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    this.tagIndex.delete(tag);
    if (!keys || keys.size === 0) {
      // Also try pattern-based invalidation in Redis as a safety net
      await this.cache.invalidatePattern(`*:${tag}:*`);
      return;
    }
    await Promise.allSettled(Array.from(keys).map((k) => this.cache.del(k)));
  }

  /**
   * Invalidate by Redis pattern (glob).
   * Use this when the tag index may be cold (e.g. after a restart).
   */
  async invalidatePattern(rawPattern: string): Promise<number> {
    return this.cache.invalidatePattern(rawPattern);
  }

  /**
   * Called on entity mutation: invalidates all keys for this entity.
   *
   * @param kind  Entity type
   * @param id    Entity ID (invalidates 'kind:id:*' pattern)
   */
  async onMutation(kind: EntityKind, id: string): Promise<void> {
    await Promise.allSettled([
      this.invalidateTag(`${kind}:${id}`),
      this.cache.invalidatePattern(`${kind}:*:${id}:*`),
      this.cache.invalidatePattern(`${kind}:${id}:*`),
    ]);
  }

  // ── Batch ─────────────────────────────────────────────────────────────────

  /**
   * Fetch multiple cache keys in one round trip.
   * On misses, calls `fn(key)` for each missing key and backfills.
   */
  async mgetOrQuery<T>(
    keys: string[],
    kind: EntityKind,
    fn: (key: string) => Promise<T | null>,
    tags?: (key: string) => string[],
  ): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    if (this.disabled) {
      await Promise.allSettled(
        keys.map(async (k) => { results.set(k, await fn(k)); }),
      );
      return results;
    }

    const cached = await this.cache.mget<T>(keys);
    const misses: string[] = [];

    keys.forEach((k, i) => {
      const v = cached[i] ?? null;
      if (v !== null) results.set(k, v);
      else misses.push(k);
    });

    await Promise.allSettled(
      misses.map(async (k) => {
        const v = await fn(k);
        results.set(k, v);
        if (v !== null) {
          await this.set(k, kind, v, tags?.(k));
        }
      }),
    );

    return results;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  getCacheMetrics() {
    return this.cache.getMetrics();
  }

  getTagIndexSize(): number {
    let total = 0;
    for (const set of this.tagIndex.values()) total += set.size;
    return total;
  }
}

// ── Key builders ───────────────────────────────────────────────────────────

/** Stable cache-key helpers for common query shapes. */
export const CacheKeys = {
  placeDetail: (id: string) => `places:detail:${id}`,
  placeSearch: (city: string, q: string, category?: string) =>
    `places:search:${city}:${encodeURIComponent(q)}:${category ?? 'all'}`,
  placeNearby: (city: string, lat: number, lng: number, radiusM: number, category?: string) =>
    `places:nearby:${city}:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusM}:${category ?? 'all'}`,
  providerDetail: (id: string) => `providers:detail:${id}`,
  providerSearch: (city: string, q: string) => `providers:search:${city}:${encodeURIComponent(q)}`,
  userProfile: (id: string) => `users:profile:${id}`,
  placeReviews: (placeId: string, page: number) => `reviews:place:${placeId}:${page}`,
  governorates: () => 'static:governorates',
  categories: () => 'static:categories',
  popularPlaces: (city: string) => `places:popular:${city}`,
} as const;
