import type { CrowdLevel, PlaceId, PriceLevel } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';
import { InsightsService } from './insights.service.js';

const placeId = 'place-001' as PlaceId;

class FixedClock {
  private current = new Date('2026-01-01T12:00:00Z');
  now() {
    return new Date(this.current);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe('InsightsService', () => {
  it('returns null crowding and price when no data', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    const result = await svc.getInsights(placeId);
    expect(result.crowding).toBeNull();
    expect(result.priceLevel).toBeNull();
  });

  it('crowding estimate carries source, observedAt, confidence', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(placeId, clock.now());
    const result = await svc.getInsights(placeId);
    expect(result.crowding).not.toBeNull();
    expect(result.crowding!.source).toBe('user_report');
    expect(typeof result.crowding!.observedAt).toBe('string');
    expect(result.crowding!.confidence).toBeGreaterThan(0);
    expect(result.crowding!.confidence).toBeLessThanOrEqual(1);
  });

  it('single crowded_now report gives medium level', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(placeId, clock.now());
    const result = await svc.getInsights(placeId);
    expect(result.crowding!.value satisfies CrowdLevel).toBe('medium');
  });

  it('three+ crowded_now reports give high level', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(placeId, clock.now());
    await svc.reportCrowded(placeId, clock.now());
    await svc.reportCrowded(placeId, clock.now());
    const result = await svc.getInsights(placeId);
    expect(result.crowding!.value satisfies CrowdLevel).toBe('high');
  });

  it('crowded_now report decays after 60 minutes', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportCrowded(placeId, clock.now());
    clock.advance(61 * 60 * 1000);
    const result = await svc.getInsights(placeId);
    expect(result.crowding).toBeNull();
  });

  it('price report carries source, observedAt, confidence', async () => {
    const clock = new FixedClock();
    const svc = new InsightsService(clock);
    await svc.reportPrice(placeId, 'mid_range' as PriceLevel, clock.now());
    const result = await svc.getInsights(placeId);
    expect(result.priceLevel).not.toBeNull();
    expect(result.priceLevel!.value satisfies PriceLevel).toBe('mid_range');
    expect(result.priceLevel!.source).toBe('user_report');
    expect(result.priceLevel!.confidence).toBeGreaterThan(0);
  });
});
