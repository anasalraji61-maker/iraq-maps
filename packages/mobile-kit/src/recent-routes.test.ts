import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import type { RecentRoute } from './recent-routes';

// Minimal AsyncStorage mock
const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  },
}));

beforeEach(() => {
  // Clear the store before each test
  for (const k of Object.keys(store)) delete store[k];
  // Clear the module cache so _cache is reset between tests
  jest.resetModules();
});

function makeRoute(placeId: string, mode: 'car' | 'walk' = 'car'): RecentRoute {
  return {
    placeId: placeId as RecentRoute['placeId'],
    mode,
    name: placeId,
    distanceM: 1000,
    durationS: 60,
    at: new Date().toISOString(),
  };
}

describe('recentRoutes', () => {
  it('add and list round-trips through AsyncStorage', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recentRoutes } = require('./recent-routes') as typeof import('./recent-routes');
    await recentRoutes.add(makeRoute('place-1'));
    await recentRoutes.add(makeRoute('place-2'));
    const list = await recentRoutes.list();
    expect(list.map((r) => r.placeId)).toEqual(['place-2', 'place-1']);
  });

  it('remove persists deletion — item is absent from the next list', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recentRoutes } = require('./recent-routes') as typeof import('./recent-routes');
    await recentRoutes.add(makeRoute('place-a'));
    await recentRoutes.add(makeRoute('place-b'));
    await recentRoutes.remove('place-a' as RecentRoute['placeId'], 'car');
    const list = await recentRoutes.list();
    expect(list.map((r) => r.placeId)).toEqual(['place-b']);
  });

  it('remove is a no-op when the entry does not exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { recentRoutes } = require('./recent-routes') as typeof import('./recent-routes');
    await recentRoutes.add(makeRoute('place-x'));
    await recentRoutes.remove('place-z' as RecentRoute['placeId'], 'car');
    const list = await recentRoutes.list();
    expect(list).toHaveLength(1);
  });
});
