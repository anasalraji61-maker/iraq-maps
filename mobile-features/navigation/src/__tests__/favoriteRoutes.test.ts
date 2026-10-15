/**
 * Unit tests for favoriteRoutes store.
 * Note: the module uses require() for AsyncStorage internally, so we mock via jest.mock.
 * The internal cache persists between calls within a test (reset by clearing the store).
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  },
}));

// Import after mock is established
import { favoriteRoutes } from '../favoriteRoutes';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
  // Clear the internal module-level cache by setting _cache to null via a trick:
  // We prime storage empty so the next load() call re-reads from store (which is now empty)
});

describe('favoriteRoutes', () => {
  it('REACTION_EMOJIS — favoriteRoutes object has list/add/remove', () => {
    expect(typeof favoriteRoutes.list).toBe('function');
    expect(typeof favoriteRoutes.add).toBe('function');
    expect(typeof favoriteRoutes.remove).toBe('function');
  });

  it('add returns a route with id and savedAt', async () => {
    const entry = await favoriteRoutes.add({
      label: 'إلى البيت',
      placeId: 'place_123' as never,
      destinationName: 'البيت',
      mode: 'car',
      distanceM: 5000,
      durationS: 600,
    });

    expect(entry.id).toMatch(/^fav_/);
    expect(typeof entry.savedAt).toBe('string');
    expect(entry.label).toBe('إلى البيت');
    expect(entry.mode).toBe('car');
    expect(entry.distanceM).toBe(5000);
  });

  it('add sets placeId and destinationName correctly', async () => {
    const entry = await favoriteRoutes.add({
      label: 'Route',
      placeId: 'place_ABC' as never,
      destinationName: 'Downtown',
      mode: 'walk',
      distanceM: 1200,
      durationS: 900,
    });
    expect(entry.placeId).toBe('place_ABC');
    expect(entry.destinationName).toBe('Downtown');
  });

  it('savedAt is a valid ISO string', async () => {
    const entry = await favoriteRoutes.add({
      label: 'R',
      placeId: 'place_X' as never,
      destinationName: 'X',
      mode: 'car',
      distanceM: 100,
      durationS: 60,
    });
    expect(() => new Date(entry.savedAt)).not.toThrow();
    expect(new Date(entry.savedAt).toISOString()).toBe(entry.savedAt);
  });

  it('add generates unique ids for successive routes', async () => {
    const e1 = await favoriteRoutes.add({
      label: 'R1',
      placeId: 'p1' as never,
      destinationName: 'A',
      mode: 'car',
      distanceM: 100,
      durationS: 60,
    });
    // small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 2));
    const e2 = await favoriteRoutes.add({
      label: 'R2',
      placeId: 'p2' as never,
      destinationName: 'B',
      mode: 'car',
      distanceM: 200,
      durationS: 120,
    });
    expect(e1.id).not.toBe(e2.id);
  });

  it('remove does not throw on unknown id', async () => {
    await expect(favoriteRoutes.remove('does-not-exist')).resolves.toBeUndefined();
  });
});
