/**
 * Unit tests for useReaction hook.
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

import { useReaction, REACTION_EMOJIS } from './useReactions';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  jest.clearAllMocks();
});

describe('useReaction', () => {
  it('returns undefined reaction initially', async () => {
    const hook = await renderHook(() => useReaction('inq-1'));
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.reaction).toBeUndefined();
  });

  it('sets and reads back a reaction', async () => {
    const hook = await renderHook(() => useReaction('inq-1'));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await hook.result.current.setReaction('👍'); });
    expect(hook.result.current.reaction).toBe('👍');
  });

  it('clears reaction when set to undefined', async () => {
    const hook = await renderHook(() => useReaction('inq-1'));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await hook.result.current.setReaction('❤️'); });
    await act(async () => { await hook.result.current.setReaction(undefined); });
    expect(hook.result.current.reaction).toBeUndefined();
  });

  it('REACTION_EMOJIS contains at least 4 entries', () => {
    expect(REACTION_EMOJIS.length).toBeGreaterThanOrEqual(4);
  });

  it('setReaction updates to different emoji', async () => {
    const hook = await renderHook(() => useReaction('inq-1'));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await hook.result.current.setReaction('👍'); });
    await act(async () => { await hook.result.current.setReaction('😂'); });
    expect(hook.result.current.reaction).toBe('😂');
  });
});
