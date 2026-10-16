import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import type { SavedPlace } from './saved-places';
import type { PlaceId } from '@iraq-maps/contracts';

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

type SP = typeof import('./saved-places');

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.resetModules();
});

function id(s: string): PlaceId { return s as PlaceId; }

function makeEntry(placeId: string): Omit<SavedPlace, 'savedAt'> {
  return { placeId: id(placeId), name: placeId };
}

function getModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./saved-places') as SP).savedPlaces;
}

describe('savedPlaces', () => {
  it('returns empty list when nothing is stored', async () => {
    const sp = getModule();
    expect(await sp.list()).toEqual([]);
  });

  it('saves a place and returns it in list', async () => {
    const sp = getModule();
    await sp.save(makeEntry('place-1'));
    const result = await sp.list();
    expect(result).toHaveLength(1);
    expect(result[0]!.placeId).toBe('place-1');
    expect(result[0]!.savedAt).toBeTruthy();
  });

  it('isSaved returns true for a saved place', async () => {
    const sp = getModule();
    await sp.save(makeEntry('place-2'));
    expect(await sp.isSaved(id('place-2'))).toBe(true);
  });

  it('isSaved returns false for an unsaved place', async () => {
    const sp = getModule();
    expect(await sp.isSaved(id('place-99'))).toBe(false);
  });

  it('save is idempotent — no duplicate entries', async () => {
    const sp = getModule();
    await sp.save(makeEntry('place-3'));
    await sp.save(makeEntry('place-3'));
    expect(await sp.list()).toHaveLength(1);
  });

  it('removes a saved place', async () => {
    const sp = getModule();
    await sp.save(makeEntry('place-4'));
    await sp.remove(id('place-4'));
    expect(await sp.list()).toHaveLength(0);
    expect(await sp.isSaved(id('place-4'))).toBe(false);
  });

  it('remove is a no-op for an unsaved place', async () => {
    const sp = getModule();
    await sp.save(makeEntry('place-5'));
    await sp.remove(id('place-99'));
    expect(await sp.list()).toHaveLength(1);
  });

  it('list returns newest-first', async () => {
    const sp = getModule();
    await sp.save(makeEntry('place-a'));
    await sp.save(makeEntry('place-b'));
    const result = await sp.list();
    expect(result[0]!.placeId).toBe('place-b');
    expect(result[1]!.placeId).toBe('place-a');
  });
});
