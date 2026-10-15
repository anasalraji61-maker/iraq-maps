/**
 * Unit tests for useArchive hook.
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

import { useArchive } from './useArchive';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('useArchive', () => {
  it('starts with empty archivedIds', async () => {
    const hook = await renderHook(() => useArchive());
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.archivedIds.size).toBe(0);
  });

  it('isArchived returns false for unknown id', async () => {
    const hook = await renderHook(() => useArchive());
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.isArchived('inq-1')).toBe(false);
  });

  it('toggles an id into the archived set', async () => {
    const hook = await renderHook(() => useArchive());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await hook.result.current.toggle('inq-1'); });
    expect(hook.result.current.isArchived('inq-1')).toBe(true);
    expect(hook.result.current.archivedIds.has('inq-1')).toBe(true);
  });

  it('toggles an id back out of the archived set', async () => {
    const hook = await renderHook(() => useArchive());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await hook.result.current.toggle('inq-1'); });
    await act(async () => { await hook.result.current.toggle('inq-1'); });
    expect(hook.result.current.isArchived('inq-1')).toBe(false);
  });

  it('can archive multiple ids independently', async () => {
    const hook = await renderHook(() => useArchive());
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await hook.result.current.toggle('inq-A'); });
    await act(async () => { await hook.result.current.toggle('inq-B'); });
    expect(hook.result.current.isArchived('inq-A')).toBe(true);
    expect(hook.result.current.isArchived('inq-B')).toBe(true);
    expect(hook.result.current.isArchived('inq-C')).toBe(false);
  });
});
