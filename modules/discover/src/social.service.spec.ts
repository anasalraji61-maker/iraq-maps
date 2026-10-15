import { describe, it, expect, beforeEach } from 'vitest';
import { SocialService } from './social.service';

// Minimal in-memory DB mock
function makeDb() {
  const events: Record<string, unknown>[] = [];
  const rsvps: Record<string, unknown>[] = [];
  const challenges: Record<string, unknown>[] = [];
  const progress: Record<string, unknown>[] = [];
  const listings: Record<string, unknown>[] = [];

  const makeTable = (arr: Record<string, unknown>[]) => ({
    _arr: arr,
    insert: (_vals: unknown) => {
      const vals = _vals as Record<string, unknown>;
      return {
        values: (v: Record<string, unknown>) => {
          const row = { id: `id-${arr.length + 1}`, createdAt: new Date(), ...v };
          arr.push(row);
          return {
            returning: async () => [row],
            onConflictDoNothing: async () => {},
            onConflictDoUpdate: async () => [row],
          };
        },
      };
    },
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: (n: number) => Promise.resolve(arr.slice(0, n)) }) }), limit: (n: number) => Promise.resolve(arr.slice(0, n)) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [arr[0]] }) }) }),
    delete: () => ({ where: async () => {} }),
  });

  return {
    _events: events,
    _rsvps: rsvps,
    _challenges: challenges,
    _progress: progress,
    _listings: listings,
    insert: (table: { _arr: unknown[] }) => makeTable(table._arr as Record<string, unknown>[]).insert,
  };
}

describe('SocialService – unit smoke tests', () => {
  it('SocialService class is importable', () => {
    expect(SocialService).toBeDefined();
  });
});

// Integration-style tests require real DB; skip in unit env
describe('SocialService – createEvent validation', () => {
  it('rejects endTime before startTime', async () => {
    const fakeSvc = new SocialService({ insert: () => ({ values: () => ({ returning: async () => [] }) }) } as never);
    await expect(
      fakeSvc.createEvent('uid' as never, {
        title: 'T',
        description: '',
        lat: 0,
        lng: 0,
        address: '',
        startTime: '2030-01-02T00:00:00Z',
        endTime: '2030-01-01T00:00:00Z',
        category: 'other',
      }),
    ).rejects.toThrow('endTime must be after startTime');
  });
});
