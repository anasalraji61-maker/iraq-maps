/**
 * Feature: Favorite routes — save named routes on-device (AsyncStorage, max 30 entries).
 * Stored separately from recentRoutes so users can curate their own list.
 */
import type { TravelMode } from '@iraq-maps/contracts';
import type { PlaceId } from '@iraq-maps/contracts';

export interface FavoriteRoute {
  id: string;
  /** User-given name for the route (e.g. "إلى البيت"). */
  label: string;
  placeId: PlaceId;
  /** Destination display name. */
  destinationName: string;
  mode: TravelMode;
  distanceM: number;
  durationS: number;
  /** ISO-8601 timestamp when saved. */
  savedAt: string;
}

const MAX = 30;
const KEY = 'iraq_maps.favorite_routes';

let _cache: FavoriteRoute[] | null = null;

async function load(): Promise<FavoriteRoute[]> {
  if (_cache) return _cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default as {
      getItem: (key: string) => Promise<string | null>;
    };
    const raw = await AsyncStorage.getItem(KEY);
    _cache = raw ? (JSON.parse(raw) as FavoriteRoute[]) : [];
  } catch {
    _cache = [];
  }
  return _cache!;
}

async function persist(entries: FavoriteRoute[]): Promise<void> {
  _cache = entries;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default as {
      setItem: (key: string, value: string) => Promise<void>;
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // non-fatal; cache stays in memory
  }
}

export const favoriteRoutes = {
  async list(): Promise<FavoriteRoute[]> {
    return load();
  },

  async add(entry: Omit<FavoriteRoute, 'id' | 'savedAt'>): Promise<FavoriteRoute> {
    const prev = await load();
    const newEntry: FavoriteRoute = {
      ...entry,
      id: `fav_${Date.now()}`,
      savedAt: new Date().toISOString(),
    };
    await persist([newEntry, ...prev].slice(0, MAX));
    return newEntry;
  },

  async remove(id: string): Promise<void> {
    const prev = await load();
    await persist(prev.filter((r) => r.id !== id));
  },
};
