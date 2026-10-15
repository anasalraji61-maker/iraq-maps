import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { InquiryOutbox } from './outbox';

const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn((key: string) => Promise.resolve((store as Record<string,string>)[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      (store as Record<string,string>)[key] = value;
      return Promise.resolve();
    }),
  },
  getItem: jest.fn((key: string) => Promise.resolve((store as Record<string,string>)[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    (store as Record<string,string>)[key] = value;
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('InquiryOutbox', () => {
  it('getPending returns empty list when nothing is queued', async () => {
    const outbox = new InquiryOutbox();
    expect(await outbox.getPending()).toEqual([]);
  });

  it('enqueue adds a pending entry', async () => {
    const outbox = new InquiryOutbox();
    await outbox.enqueue({ id: 'id-1', text: 'مرحبا', placeIds: ['place-1'], queuedAt: Date.now() });
    const pending = await outbox.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe('id-1');
    expect(pending[0]!.status).toBe('pending');
    expect(pending[0]!.attempts).toBe(0);
  });

  it('enqueue is idempotent', async () => {
    const outbox = new InquiryOutbox();
    const entry = { id: 'id-2', text: 'test', placeIds: [], queuedAt: Date.now() };
    await outbox.enqueue(entry);
    await outbox.enqueue(entry);
    expect(await outbox.getPending()).toHaveLength(1);
  });

  it('markSent removes entry from pending', async () => {
    const outbox = new InquiryOutbox();
    await outbox.enqueue({ id: 'id-3', text: 'test', placeIds: [], queuedAt: Date.now() });
    await outbox.markSent('id-3');
    expect(await outbox.getPending()).toHaveLength(0);
  });

  it('markFailed removes entry from pending (status becomes failed)', async () => {
    const outbox = new InquiryOutbox();
    await outbox.enqueue({ id: 'id-4', text: 'test', placeIds: [], queuedAt: Date.now() });
    // getPending returns the entry while still pending
    expect(await outbox.getPending()).toHaveLength(1);
    await outbox.markFailed('id-4');
    // After markFailed the entry's status is 'failed' — getPending excludes it
    expect(await outbox.getPending()).toHaveLength(0);
  });

  it('flush calls sendFn and marks entries sent', async () => {
    const outbox = new InquiryOutbox();
    await outbox.enqueue({ id: 'id-5', text: 'hello', placeIds: ['p1'], queuedAt: Date.now() });
    const sendFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await outbox.flush(sendFn);
    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(await outbox.getPending()).toHaveLength(0);
  });

  it('flush marks entry as failed (not pending) when sendFn throws', async () => {
    const outbox = new InquiryOutbox();
    await outbox.enqueue({ id: 'id-6', text: 'fail', placeIds: [], queuedAt: Date.now() });
    const sendFn = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('network'));
    await outbox.flush(sendFn);
    // After flush with a failed send, entry is failed — no longer pending
    expect(await outbox.getPending()).toHaveLength(0);
    // A second flush should not retry (entry is now 'failed', not 'pending')
    const sendFn2 = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await outbox.flush(sendFn2);
    expect(sendFn2).not.toHaveBeenCalled();
  });

  it('flush processes all pending entries', async () => {
    const outbox = new InquiryOutbox();
    await outbox.enqueue({ id: 'id-7', text: 'a', placeIds: [], queuedAt: Date.now() });
    await outbox.enqueue({ id: 'id-8', text: 'b', placeIds: [], queuedAt: Date.now() });
    const sendFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    await outbox.flush(sendFn);
    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(await outbox.getPending()).toHaveLength(0);
  });
});
