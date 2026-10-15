import { describe, it, expect } from 'vitest';
import { SocialGraphService } from './social.service';
import { BadRequestException } from '@nestjs/common';

/**
 * Unit tests for SocialGraphService.
 * Integration tests (real DB) run against local PostGIS per CLAUDE.md.
 */

/** Minimal in-memory Drizzle-shape DB stub. */
function makeStubDb() {
  type Row = Record<string, unknown>;
  const follows: Row[] = [];
  const blocks: Row[] = [];
  const dismissed: Row[] = [];

  const noopChain = {
    where: () => noopChain,
    orderBy: () => noopChain,
    limit: async (n: number) => follows.slice(0, n),
    groupBy: () => noopChain,
    then: (_r: unknown) => Promise.resolve([]),
  };

  return {
    _follows: follows,
    _blocks: blocks,
    _dismissed: dismissed,

    insert: (_table: unknown) => ({
      values: (v: Row) => ({
        onConflictDoNothing: async () => {
          if (_table === follows) follows.push(v);
          if (_table === blocks) blocks.push(v);
          if (_table === dismissed) dismissed.push(v);
        },
        returning: async () => [v],
      }),
    }),
    select: (_fields?: unknown) => ({
      from: (_table: unknown) => ({
        where: () => ({
          orderBy: () => ({
            limit: async (n: number) => follows.slice(0, n),
          }),
          limit: async (n: number) => follows.slice(0, n),
          groupBy: () => ({ orderBy: () => ({ limit: async () => [] }) }),
        }),
        limit: async (n: number) => follows.slice(0, n),
      }),
    }),
    delete: (_table: unknown) => ({
      where: async () => {},
    }),
  };
}

describe('SocialGraphService – unit smoke tests', () => {
  it('is importable', () => {
    expect(SocialGraphService).toBeDefined();
  });

  it('rejects self-follow', async () => {
    const svc = new SocialGraphService(makeStubDb() as never);
    await expect(
      svc.followUser('uid-abc' as never, 'uid-abc' as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects self-block', async () => {
    const svc = new SocialGraphService(makeStubDb() as never);
    await expect(
      svc.blockUser('uid-abc' as never, 'uid-abc' as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('isBlocked returns false on empty DB', async () => {
    const db = makeStubDb();
    // Override select to always return empty
    (db as Record<string, unknown>).select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    });
    const svc = new SocialGraphService(db as never);
    const result = await svc.isBlocked('user-a' as never, 'user-b' as never);
    expect(result).toBe(false);
  });

  it('dismissSuggestion does not throw', async () => {
    const svc = new SocialGraphService(makeStubDb() as never);
    await expect(
      svc.dismissSuggestion('user-a' as never, 'user-b' as never),
    ).resolves.toBeUndefined();
  });
});
