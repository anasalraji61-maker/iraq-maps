/**
 * Unit tests for useCollections hook.
 */
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-native';

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

import { useCollections } from './useCollections';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('useCollections', () => {
  it('starts empty with loading false after mount', async () => {
    const hook = await renderHook(() => useCollections());
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.collections).toHaveLength(0);
  });

  it('createCollection adds a collection', async () => {
    const hook = await renderHook(() => useCollections());
    await act(async () => { await Promise.resolve(); });

    let col: Awaited<ReturnType<typeof hook.result.current.createCollection>>;
    await act(async () => {
      col = await hook.result.current.createCollection('My Collection');
    });

    expect(col!.name).toBe('My Collection');
    expect(col!.id).toMatch(/^col_/);
    expect(hook.result.current.collections).toHaveLength(1);
  });

  it('deleteCollection removes a collection by id', async () => {
    const hook = await renderHook(() => useCollections());
    await act(async () => { await Promise.resolve(); });

    let col: Awaited<ReturnType<typeof hook.result.current.createCollection>>;
    await act(async () => { col = await hook.result.current.createCollection('To Delete'); });
    await act(async () => { await hook.result.current.deleteCollection(col!.id); });

    expect(hook.result.current.collections).toHaveLength(0);
  });

  it('addPostToCollection and removePostFromCollection work', async () => {
    const hook = await renderHook(() => useCollections());
    await act(async () => { await Promise.resolve(); });

    let col: Awaited<ReturnType<typeof hook.result.current.createCollection>>;
    await act(async () => { col = await hook.result.current.createCollection('Posts Col'); });
    await act(async () => { await hook.result.current.addPostToCollection(col!.id, 'post-1'); });

    const colsForPost = hook.result.current.getCollectionsForPost('post-1');
    expect(colsForPost).toHaveLength(1);

    await act(async () => { await hook.result.current.removePostFromCollection(col!.id, 'post-1'); });

    const colsAfterRemove = hook.result.current.getCollectionsForPost('post-1');
    expect(colsAfterRemove).toHaveLength(0);
  });

  it('addPostToCollection is idempotent', async () => {
    const hook = await renderHook(() => useCollections());
    await act(async () => { await Promise.resolve(); });

    let col: Awaited<ReturnType<typeof hook.result.current.createCollection>>;
    await act(async () => { col = await hook.result.current.createCollection('Idem'); });
    await act(async () => { await hook.result.current.addPostToCollection(col!.id, 'post-2'); });
    await act(async () => { await hook.result.current.addPostToCollection(col!.id, 'post-2'); });

    const updated = hook.result.current.collections.find((c) => c.id === col!.id)!;
    expect(updated.postIds.filter((id) => id === 'post-2')).toHaveLength(1);
  });
});
