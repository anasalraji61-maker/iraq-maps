// Saved places stored on-device only (AsyncStorage, max 200 entries).
import type { PlaceId } from '@iraq-maps/contracts';

export interface SavedPlace {
  placeId: PlaceId;
  /** Display name in the user's preferred language. */
  name: string;
  /** Optional Arabic category label. */
  category?: string;
  /** ISO-8601 timestamp when saved. */
  savedAt: string;
}

const MAX = 200;
let _cache: SavedPlace[] | null = null;
const KEY = 'iraq_maps.saved_places';

type AS = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
function getStorage(): AS {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as { default: AS }).default;
}

async function load(): Promise<SavedPlace[]> {
  if (_cache) return _cache;
  try {
    const raw = await getStorage().getItem(KEY);
    _cache = raw ? (JSON.parse(raw) as SavedPlace[]) : [];
  } catch {
    _cache = [];
  }
  return _cache!;
}

async function persist(entries: SavedPlace[]): Promise<void> {
  _cache = entries;
  try {
    await getStorage().setItem(KEY, JSON.stringify(entries));
  } catch {
    // non-fatal
  }
}

export const savedPlaces = {
  /** Returns saved places newest-first. */
  async list(): Promise<SavedPlace[]> {
    return load();
  },

  /** Returns true if the place is saved. */
  async isSaved(placeId: PlaceId): Promise<boolean> {
    const all = await load();
    return all.some((p) => p.placeId === placeId);
  },

  /** Saves a place. No-op if already saved. */
  async save(entry: Omit<SavedPlace, 'savedAt'>): Promise<void> {
    const prev = await load();
    if (prev.some((p) => p.placeId === entry.placeId)) return;
    await persist([{ ...entry, savedAt: new Date().toISOString() }, ...prev].slice(0, MAX));
  },

  /** Removes a saved place. */
  async remove(placeId: PlaceId): Promise<void> {
    const prev = await load();
    await persist(prev.filter((p) => p.placeId !== placeId));
  },

  /** Clears the in-memory cache (for testing). */
  _reset(): void { _cache = null; },
};
