/**
 * Tests for InsightsService.getSummary().
 */
import type { PlaceId, PriceLevel } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';
import { InsightsService } from './insights.service.js';

class FixedClock {
  private current = new Date('2026-06-01T10:00:00Z');
  now() { return new Date(this.current); }
  advanceMs(ms: number) { this.current = new Date(this.current.getTime() + ms); }
}

const p = (n: number) => `place-${n}` as PlaceId;

describe('InsightsService.getSummary()', () => {
  it('returns empty arrays when no reports', () => {
    const svc = new InsightsService(new FixedClock());
    const summary = svc.getSummary();
    expect(summary.recentPriceReports).toHaveLength(0);
    expect(summary.recentCrowdingReports).toHaveLength(0);
  });

  it('includes a fresh price report in recentPriceReports', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportPrice(p(1), 'moderate' as PriceLevel, clock.now());
    const summary = svc.getSummary();
    expect(summary.recentPriceReports).toHaveLength(1);
    expect(summary.recentPriceReports[0]!.placeId).toBe(p(1));
    expect(summary.recentPriceReports[0]!.priceLevel).toBe('moderate');
  });

  it('excludes stale price reports (> 24 h old)', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportPrice(p(2), 'cheap' as PriceLevel, clock.now());
    clock.advanceMs(25 * 60 * 60 * 1000); // 25 hours
    const summary = svc.getSummary();
    expect(summary.recentPriceReports).toHaveLength(0);
  });

  it('includes active crowding reports in recentCrowdingReports', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(p(3), clock.now());
    await svc.reportCrowded(p(3), clock.now());
    const summary = svc.getSummary();
    expect(summary.recentCrowdingReports).toHaveLength(1);
    expect(summary.recentCrowdingReports[0]!.reportCount).toBe(2);
  });

  it('excludes decayed crowding reports from summary', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(p(4), clock.now());
    clock.advanceMs(61 * 60 * 1000); // 61 min — past 60-min decay
    const summary = svc.getSummary();
    expect(summary.recentCrowdingReports).toHaveLength(0);
  });

  it('sorts crowding reports by reportCount descending', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(p(5), clock.now());
    await svc.reportCrowded(p(6), clock.now());
    await svc.reportCrowded(p(6), clock.now());
    await svc.reportCrowded(p(6), clock.now());
    const summary = svc.getSummary();
    const counts = summary.recentCrowdingReports.map((r) => r.reportCount);
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1] ?? 0);
  });
});
