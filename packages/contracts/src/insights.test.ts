/**
 * Unit tests for insights contract schemas: CrowdLevel, PriceLevel, Estimate,
 * CrowdingEstimate, PriceLevelEstimate, PlaceInsights, InsightReport.
 */
import { describe, expect, it } from 'vitest';
import { CrowdLevel, PriceLevel, CrowdingEstimate, PriceLevelEstimate, PlaceInsights, InsightReport, InsightReportKind } from './insights';

const VALID_ESTIMATE = {
  value: 'low',
  source: 'user_report',
  observedAt: '2026-10-15T12:00:00.000Z',
  confidence: 0.8,
};

describe('CrowdLevel', () => {
  it('accepts low', () => expect(CrowdLevel.parse('low')).toBe('low'));
  it('accepts medium', () => expect(CrowdLevel.parse('medium')).toBe('medium'));
  it('accepts high', () => expect(CrowdLevel.parse('high')).toBe('high'));
  it('rejects extreme', () => expect(() => CrowdLevel.parse('extreme')).toThrow());
});

describe('PriceLevel', () => {
  it('accepts budget', () => expect(PriceLevel.parse('budget')).toBe('budget'));
  it('accepts luxury', () => expect(PriceLevel.parse('luxury')).toBe('luxury'));
  it('rejects free', () => expect(() => PriceLevel.parse('free')).toThrow());
});

describe('CrowdingEstimate', () => {
  it('parses a valid crowding estimate', () => {
    const e = CrowdingEstimate.parse(VALID_ESTIMATE);
    expect(e.value).toBe('low');
    expect(e.confidence).toBe(0.8);
  });

  it('rejects confidence above 1', () => {
    expect(() => CrowdingEstimate.parse({ ...VALID_ESTIMATE, confidence: 1.5 })).toThrow();
  });

  it('rejects confidence below 0', () => {
    expect(() => CrowdingEstimate.parse({ ...VALID_ESTIMATE, confidence: -0.1 })).toThrow();
  });

  it('rejects invalid crowd level value', () => {
    expect(() => CrowdingEstimate.parse({ ...VALID_ESTIMATE, value: 'chaos' })).toThrow();
  });
});

describe('PriceLevelEstimate', () => {
  it('parses a valid price level estimate', () => {
    const e = PriceLevelEstimate.parse({ ...VALID_ESTIMATE, value: 'mid_range' });
    expect(e.value).toBe('mid_range');
  });

  it('rejects invalid price level', () => {
    expect(() => PriceLevelEstimate.parse({ ...VALID_ESTIMATE, value: 'cheap' })).toThrow();
  });
});

describe('PlaceInsights', () => {
  it('parses insights with null crowding and priceLevel', () => {
    const i = PlaceInsights.parse({ placeId: 'n12345', crowding: null, priceLevel: null });
    expect(i.crowding).toBeNull();
    expect(i.priceLevel).toBeNull();
  });

  it('parses insights with populated data', () => {
    const i = PlaceInsights.parse({
      placeId: 'n12345',
      crowding: VALID_ESTIMATE,
      priceLevel: { ...VALID_ESTIMATE, value: 'budget' },
    });
    expect(i.crowding?.value).toBe('low');
    expect(i.priceLevel?.value).toBe('budget');
  });

  it('rejects missing placeId', () => {
    expect(() => PlaceInsights.parse({ crowding: null, priceLevel: null })).toThrow();
  });
});

describe('InsightReportKind', () => {
  it('accepts crowded_now', () => expect(InsightReportKind.parse('crowded_now')).toBe('crowded_now'));
  it('accepts inaccuracy', () => expect(InsightReportKind.parse('inaccuracy')).toBe('inaccuracy'));
  it('rejects unknown kind', () => expect(() => InsightReportKind.parse('broken')).toThrow());
});

describe('InsightReport', () => {
  it('parses a crowding report', () => {
    const r = InsightReport.parse({ placeId: 'n12345', kind: 'crowded_now' });
    expect(r.kind).toBe('crowded_now');
    expect(r.priceLevel).toBeUndefined();
  });

  it('accepts optional priceLevel for price reports', () => {
    const r = InsightReport.parse({ placeId: 'n12345', kind: 'price', priceLevel: 'budget' });
    expect(r.priceLevel).toBe('budget');
  });

  it('rejects invalid kind', () => {
    expect(() => InsightReport.parse({ placeId: 'n12345', kind: 'unknown' })).toThrow();
  });
});
