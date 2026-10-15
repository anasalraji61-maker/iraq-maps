import { describe, it, expect, vi } from 'vitest';
import { AnalyticsService } from './analytics.service.js';

vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, __sql: true }),
}));

function makeDb(overviewRows?: object) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    execute: vi.fn().mockResolvedValue({ rows: overviewRows ?? [] }),
  } as unknown as import('drizzle-orm/node-postgres').NodePgDatabase;
}

describe('AnalyticsService.track', () => {
  it('inserts an event row', async () => {
    const db = makeDb();
    const svc = new AnalyticsService(db);
    await svc.track({ eventType: 'app_open', userId: 'u-1' });
    expect(db.insert).toHaveBeenCalledOnce();
  });
});

describe('AnalyticsService.getOverview', () => {
  it('returns zeros when db returns empty rows', async () => {
    const db = makeDb();
    const svc = new AnalyticsService(db);
    const result = await svc.getOverview();
    expect(result.dau).toBe(0);
    expect(result.totalEvents).toBe(0);
    expect(result.topEventTypes).toHaveLength(0);
    expect(result.eventsByDay).toHaveLength(0);
  });
});

describe('AnalyticsService.getRetention', () => {
  it('returns mapped retention rows', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ cohort_date: '2026-10-01', day_offset: 1, retained_count: 42 }],
      }),
    } as unknown as import('drizzle-orm/node-postgres').NodePgDatabase;
    const svc = new AnalyticsService(db);
    const result = await svc.getRetention(7);
    expect(result[0]).toEqual({ cohortDate: '2026-10-01', dayOffset: 1, retainedCount: 42 });
  });
});

describe('AnalyticsService.getFunnel', () => {
  it('returns four funnel steps', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ count: 100 }] }),
    } as unknown as import('drizzle-orm/node-postgres').NodePgDatabase;
    const svc = new AnalyticsService(db);
    const result = await svc.getFunnel();
    expect(result).toHaveLength(4);
    expect(result[0]!.step).toBe('App Open');
    // First step has no dropoff rate
    expect(result[0]!.dropoffRate).toBeNull();
    // Second step: same count so 0% dropoff
    expect(result[1]!.dropoffRate).toBe(0);
  });
});
