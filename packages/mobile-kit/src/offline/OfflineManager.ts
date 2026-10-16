/**
 * OfflineManager – caches places, routes, and feed posts in AsyncStorage so
 * the app can render meaningful content even when the device is offline.
 *
 * Storage layout (all keys prefixed @iraq-maps/):
 *   place:<id>          – PlaceSummary JSON + cachedAt timestamp
 *   route:<id>          – Route JSON + cachedAt timestamp
 *   feed                – array of up to 50 FeedPost JSON objects
 *   feed-meta           – { cachedAt: number }
 *   cache-index         – { places: string[], routes: string[] }  (for sweep)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NS = '@iraq-maps';
const MAX_FEED_POSTS = 50;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---------------------------------------------------------------------------
// Minimal shape types (mirrors contracts; avoids a circular dep)
// ---------------------------------------------------------------------------

export interface CachedPlace {
  id: string;
  nameAr: string;
  nameEn?: string;
  nameCkb?: string;
  category?: string;
  kind?: string;
  lat?: number;
  lng?: number;
  /** Any extra fields from the API; stored as-is. */
  [key: string]: unknown;
}

export interface CachedRoute {
  id: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  distanceMetres: number;
  durationSeconds: number;
  geometry?: string; // GeoJSON LineString encoded as JSON
  [key: string]: unknown;
}

export interface CachedFeedPost {
  id: string;
  authorId: string;
  body?: string;
  imageUrl?: string;
  placeId?: string;
  createdAt: string;
  [key: string]: unknown;
}

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
}

interface CacheIndex {
  places: string[];
  routes: string[];
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function placeKey(id: string): string {
  return `${NS}/place:${id}`;
}

function routeKey(id: string): string {
  return `${NS}/route:${id}`;
}

const FEED_KEY = `${NS}/feed`;
const FEED_META_KEY = `${NS}/feed-meta`;
const INDEX_KEY = `${NS}/cache-index`;

// ---------------------------------------------------------------------------
// Index helpers (to allow efficient sweep without getAllKeys)
// ---------------------------------------------------------------------------

async function readIndex(): Promise<CacheIndex> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return { places: [], routes: [] };
    return JSON.parse(raw) as CacheIndex;
  } catch {
    return { places: [], routes: [] };
  }
}

async function writeIndex(index: CacheIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // best-effort
  }
}

async function addToIndex(type: 'places' | 'routes', id: string): Promise<void> {
  const idx = await readIndex();
  if (!idx[type].includes(id)) {
    idx[type] = [...idx[type], id];
    await writeIndex(idx);
  }
}

async function removeFromIndex(type: 'places' | 'routes', id: string): Promise<void> {
  const idx = await readIndex();
  idx[type] = idx[type].filter((i) => i !== id);
  await writeIndex(idx);
}

// ---------------------------------------------------------------------------
// Place cache
// ---------------------------------------------------------------------------

/** Store a place in the offline cache. */
export async function cachePlace(place: CachedPlace): Promise<void> {
  const env: CacheEnvelope<CachedPlace> = { data: place, cachedAt: Date.now() };
  try {
    await AsyncStorage.setItem(placeKey(place.id), JSON.stringify(env));
    await addToIndex('places', place.id);
  } catch {
    // best-effort
  }
}

/** Retrieve a cached place by id. Returns null when missing or expired. */
export async function getCachedPlace(id: string): Promise<CachedPlace | null> {
  try {
    const raw = await AsyncStorage.getItem(placeKey(id));
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<CachedPlace>;
    if (Date.now() - env.cachedAt > CACHE_TTL_MS) {
      await deleteCachedPlace(id);
      return null;
    }
    return env.data;
  } catch {
    return null;
  }
}

/** Remove a single cached place. */
export async function deleteCachedPlace(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(placeKey(id));
    await removeFromIndex('places', id);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Route cache
// ---------------------------------------------------------------------------

/** Store a route in the offline cache. */
export async function cacheRoute(route: CachedRoute): Promise<void> {
  const env: CacheEnvelope<CachedRoute> = { data: route, cachedAt: Date.now() };
  try {
    await AsyncStorage.setItem(routeKey(route.id), JSON.stringify(env));
    await addToIndex('routes', route.id);
  } catch {
    // best-effort
  }
}

/** Retrieve a cached route by id. Returns null when missing or expired. */
export async function getCachedRoute(id: string): Promise<CachedRoute | null> {
  try {
    const raw = await AsyncStorage.getItem(routeKey(id));
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<CachedRoute>;
    if (Date.now() - env.cachedAt > CACHE_TTL_MS) {
      await deleteCachedRoute(id);
      return null;
    }
    return env.data;
  } catch {
    return null;
  }
}

/** Remove a single cached route. */
export async function deleteCachedRoute(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(routeKey(id));
    await removeFromIndex('routes', id);
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Feed cache
// ---------------------------------------------------------------------------

/** Store the latest feed posts (capped at MAX_FEED_POSTS). */
export async function cacheFeed(posts: CachedFeedPost[]): Promise<void> {
  const capped = posts.slice(0, MAX_FEED_POSTS);
  try {
    await AsyncStorage.setItem(FEED_KEY, JSON.stringify(capped));
    await AsyncStorage.setItem(FEED_META_KEY, JSON.stringify({ cachedAt: Date.now() }));
  } catch {
    // best-effort
  }
}

/** Retrieve the cached feed. Returns empty array when missing. */
export async function getCachedFeed(): Promise<CachedFeedPost[]> {
  try {
    const raw = await AsyncStorage.getItem(FEED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedFeedPost[];
  } catch {
    return [];
  }
}

/** Returns the timestamp of the last feed cache, or null. */
export async function getFeedCacheAge(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(FEED_META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw) as { cachedAt: number };
    return meta.cachedAt;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cache maintenance
// ---------------------------------------------------------------------------

/**
 * Remove all cache entries older than CACHE_TTL_MS (7 days).
 * Also removes entries whose data is no longer parseable.
 */
export async function clearOldCache(): Promise<{ removedPlaces: number; removedRoutes: number }> {
  const idx = await readIndex();
  let removedPlaces = 0;
  let removedRoutes = 0;
  const now = Date.now();

  for (const id of [...idx.places]) {
    try {
      const raw = await AsyncStorage.getItem(placeKey(id));
      if (!raw) {
        await removeFromIndex('places', id);
        continue;
      }
      const env = JSON.parse(raw) as CacheEnvelope<unknown>;
      if (now - env.cachedAt > CACHE_TTL_MS) {
        await AsyncStorage.removeItem(placeKey(id));
        await removeFromIndex('places', id);
        removedPlaces++;
      }
    } catch {
      await removeFromIndex('places', id);
    }
  }

  for (const id of [...idx.routes]) {
    try {
      const raw = await AsyncStorage.getItem(routeKey(id));
      if (!raw) {
        await removeFromIndex('routes', id);
        continue;
      }
      const env = JSON.parse(raw) as CacheEnvelope<unknown>;
      if (now - env.cachedAt > CACHE_TTL_MS) {
        await AsyncStorage.removeItem(routeKey(id));
        await removeFromIndex('routes', id);
        removedRoutes++;
      }
    } catch {
      await removeFromIndex('routes', id);
    }
  }

  // Clear expired feed too
  const feedAge = await getFeedCacheAge();
  if (feedAge !== null && now - feedAge > CACHE_TTL_MS) {
    try {
      await AsyncStorage.removeItem(FEED_KEY);
      await AsyncStorage.removeItem(FEED_META_KEY);
    } catch {
      // best-effort
    }
  }

  return { removedPlaces, removedRoutes };
}

/**
 * Estimate the total cache size in megabytes by summing the lengths of all
 * stored JSON strings (UTF-16 char ≈ 2 bytes in JS; divide by 1 048 576 for MB).
 */
export async function getCacheSize(): Promise<number> {
  const idx = await readIndex();
  let totalChars = 0;

  const allKeys = [
    ...idx.places.map(placeKey),
    ...idx.routes.map(routeKey),
    FEED_KEY,
    FEED_META_KEY,
    INDEX_KEY,
  ];

  try {
    const pairs = await AsyncStorage.multiGet(allKeys);
    for (const [, value] of pairs) {
      if (value) totalChars += value.length;
    }
  } catch {
    return 0;
  }

  // 2 bytes per UTF-16 character → bytes → MB
  return (totalChars * 2) / (1024 * 1024);
}

/** Clear all managed caches. */
export async function clearAllCache(): Promise<void> {
  const idx = await readIndex();
  const keys = [
    ...idx.places.map(placeKey),
    ...idx.routes.map(routeKey),
    FEED_KEY,
    FEED_META_KEY,
    INDEX_KEY,
  ];
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    // best-effort
  }
}

/** Returns statistics useful for the settings screen. */
export async function getCacheStats(): Promise<{
  placeCount: number;
  routeCount: number;
  feedPostCount: number;
  sizeMb: number;
}> {
  const [idx, feed, sizeMb] = await Promise.all([
    readIndex(),
    getCachedFeed(),
    getCacheSize(),
  ]);
  return {
    placeCount: idx.places.length,
    routeCount: idx.routes.length,
    feedPostCount: feed.length,
    sizeMb,
  };
}
