// M2 stub: recent routes stored on-device only (AsyncStorage, max 20 entries).
// builder-map-kit-m2 owns this file.
import type { TravelMode } from '@iraq-maps/contracts';
import type { PlaceId } from '@iraq-maps/contracts';

/** A route the user navigated recently, kept on-device only (max 20). @public frozen stub (M2) */
export interface RecentRoute {
  placeId: PlaceId;
  /** Display name in the user's language. */
  name: string;
  mode: TravelMode;
  distanceM: number;
  durationS: number;
  /** ISO-8601 timestamp. */
  at: string;
}

// These are stubs; the real implementation in builder-map-kit-m2 will replace them.
const MAX = 20;
let _cache: RecentRoute[] | null = null;
const KEY = 'iraq_maps.recent_routes';

async function load(): Promise<RecentRoute[]> {
  if (_cache) return _cache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default as {
      getItem: (key: string) => Promise<string | null>;
      setItem: (key: string, value: string) => Promise<void>;
    };
    const raw = await AsyncStorage.getItem(KEY);
    _cache = raw ? (JSON.parse(raw) as RecentRoute[]) : [];
  } catch {
    _cache = [];
  }
  return _cache!;
}

async function save(entries: RecentRoute[]): Promise<void> {
  _cache = entries;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default as {
      setItem: (key: string, value: string) => Promise<void>;
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // storage failure is non-fatal; the cache stays in memory
  }
}

/** @public frozen stub (M2) */
export const recentRoutes = {
  /** Returns routes newest-first. */
  async list(): Promise<RecentRoute[]> {
    return load();
  },

  /** Prepends `entry`, deduplicates by placeId+mode, trims to MAX. */
  async add(entry: RecentRoute): Promise<void> {
    const prev = await load();
    const filtered = prev.filter((r) => !(r.placeId === entry.placeId && r.mode === entry.mode));
    await save([entry, ...filtered].slice(0, MAX));
  },

  /** Removes the route matching placeId+mode and persists the result. */
  async remove(placeId: PlaceId, mode: TravelMode): Promise<void> {
    const prev = await load();
    await save(prev.filter((r) => !(r.placeId === placeId && r.mode === mode)));
  },
};
