import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { loadReceipts, saveReceipts, RECEIPTS_KEY } from './readReceiptsStore';

const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => {
  const impl = {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  };
  return { default: impl, ...impl, __esModule: true };
});

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('readReceiptsStore', () => {
  it('loadReceipts returns empty object when nothing stored', async () => {
    expect(await loadReceipts()).toEqual({});
  });

  it('saveReceipts persists receipts and loadReceipts reads them back', async () => {
    const receipts = { 'inq-1': '2026-01-01T00:00:00.000Z', 'inq-2': '2026-01-02T00:00:00.000Z' };
    await saveReceipts(receipts);
    const loaded = await loadReceipts();
    expect(loaded).toEqual(receipts);
  });

  it('loadReceipts returns empty object on corrupt data', async () => {
    store[RECEIPTS_KEY] = 'not-json';
    expect(await loadReceipts()).toEqual({});
  });

  it('saveReceipts overwrites existing receipts', async () => {
    await saveReceipts({ 'inq-1': '2026-01-01T00:00:00.000Z' });
    await saveReceipts({ 'inq-2': '2026-01-02T00:00:00.000Z' });
    const loaded = await loadReceipts();
    expect(loaded).toEqual({ 'inq-2': '2026-01-02T00:00:00.000Z' });
  });
});
