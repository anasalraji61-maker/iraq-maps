import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { enqueueOfflineAction, dequeueOfflineAction } from './offline-queue';

// The test/setup.ts mock registers AsyncStorage WITHOUT .default
// offline-queue.ts uses require('...').default, so we need to override
// the setup mock to add the .default shape with a working store.
const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn((key: string) => Promise.resolve((store as Record<string,string>)[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      (store as Record<string,string>)[key] = value;
      return Promise.resolve();
    }),
  },
  // also expose top-level for any code that doesn't use .default
  getItem: jest.fn((key: string) => Promise.resolve((store as Record<string,string>)[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    (store as Record<string,string>)[key] = value;
    return Promise.resolve();
  }),
}));

const QUEUE_KEY = '@iraq-maps/offline-queue';

function readQueue<T>(): T[] {
  const raw = store[QUEUE_KEY];
  return raw ? JSON.parse(raw) as T[] : [];
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('offlineQueue', () => {
  it('enqueues an action', async () => {
    await enqueueOfflineAction({ id: 'act-1', tag: 'likePost', payload: { postId: 'p1' } });
    const items = readQueue<{ id: string; attempts: number }>();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('act-1');
    expect(items[0]!.attempts).toBe(0);
  });

  it('enqueue is idempotent — same id not added twice', async () => {
    await enqueueOfflineAction({ id: 'act-2', tag: 'likePost', payload: {} });
    await enqueueOfflineAction({ id: 'act-2', tag: 'likePost', payload: {} });
    expect(readQueue()).toHaveLength(1);
  });

  it('dequeues an action by id', async () => {
    await enqueueOfflineAction({ id: 'act-3', tag: 'savePlace', payload: {} });
    await enqueueOfflineAction({ id: 'act-4', tag: 'savePlace', payload: {} });
    await dequeueOfflineAction('act-3');
    const items = readQueue<{ id: string }>();
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('act-4');
  });

  it('dequeue is a no-op for an unknown id', async () => {
    await enqueueOfflineAction({ id: 'act-5', tag: 'likePost', payload: {} });
    await dequeueOfflineAction('act-99');
    expect(readQueue()).toHaveLength(1);
  });

  it('enqueue sets queuedAt as a number', async () => {
    const before = Date.now();
    await enqueueOfflineAction({ id: 'act-6', tag: 'likePost', payload: {} });
    const after = Date.now();
    const items = readQueue<{ queuedAt: number }>();
    expect(items[0]!.queuedAt).toBeGreaterThanOrEqual(before);
    expect(items[0]!.queuedAt).toBeLessThanOrEqual(after);
  });
});
