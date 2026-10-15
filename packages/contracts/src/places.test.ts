/**
 * Unit tests for places contract schemas: SearchQuery, NearbyQuery, PlaceSummary, Review, RatingSummary.
 */
import { describe, expect, it } from 'vitest';
import { SearchQuery, NearbyQuery, PlaceSummary, Review, RatingSummary } from './places';

const VALID_PLACE_SUMMARY = {
  id: 'n12345',
  kind: 'place',
  names: { name: 'Baghdad Restaurant', ar: 'مطعم بغداد' },
  category: 'food',
  area: null,
  location: [44.4, 33.3],
  distanceM: null,
};

describe('SearchQuery', () => {
  it('parses a minimal valid query', () => {
    const q = SearchQuery.parse({ q: 'مطعم', city: 'baghdad' });
    expect(q.lang).toBe('ar'); // default
    expect(q.limit).toBeDefined();
  });

  it('rejects empty search string', () => {
    expect(() => SearchQuery.parse({ q: '', city: 'baghdad' })).toThrow();
  });

  it('rejects query over 100 chars', () => {
    expect(() => SearchQuery.parse({ q: 'a'.repeat(101), city: 'baghdad' })).toThrow();
  });

  it('accepts explicit lang=en', () => {
    const q = SearchQuery.parse({ q: 'restaurant', city: 'baghdad', lang: 'en' });
    expect(q.lang).toBe('en');
  });

  it('rejects invalid lang', () => {
    expect(() => SearchQuery.parse({ q: 'test', city: 'baghdad', lang: 'xx' })).toThrow();
  });

  it('accepts near as "lng,lat" string', () => {
    const q = SearchQuery.parse({ q: 'مطعم', city: 'baghdad', near: '44.4,33.3' });
    expect(q.near).toEqual([44.4, 33.3]);
  });
});

describe('NearbyQuery', () => {
  const BASE = { city: 'baghdad', near: '44.4,33.3' };

  it('parses a valid nearby query with defaults', () => {
    const q = NearbyQuery.parse(BASE);
    expect(q.radiusM).toBe(1000); // default
  });

  it('accepts radiusM within bounds', () => {
    expect(() => NearbyQuery.parse({ ...BASE, radiusM: 500 })).not.toThrow();
  });

  it('rejects radiusM below 50', () => {
    expect(() => NearbyQuery.parse({ ...BASE, radiusM: 10 })).toThrow();
  });

  it('rejects radiusM above 5000', () => {
    expect(() => NearbyQuery.parse({ ...BASE, radiusM: 10000 })).toThrow();
  });

  it('accepts optional category', () => {
    const q = NearbyQuery.parse({ ...BASE, category: 'food' });
    expect(q.category).toBe('food');
  });
});

describe('PlaceSummary', () => {
  it('parses a valid place summary', () => {
    const p = PlaceSummary.parse(VALID_PLACE_SUMMARY);
    expect(p.kind).toBe('place');
    expect(p.distanceM).toBeNull();
  });

  it('accepts distanceM when provided', () => {
    const p = PlaceSummary.parse({ ...VALID_PLACE_SUMMARY, distanceM: 250 });
    expect(p.distanceM).toBe(250);
  });

  it('rejects negative distanceM', () => {
    expect(() => PlaceSummary.parse({ ...VALID_PLACE_SUMMARY, distanceM: -5 })).toThrow();
  });

  it('accepts null area (unknown neighbourhood)', () => {
    const p = PlaceSummary.parse({ ...VALID_PLACE_SUMMARY, area: null });
    expect(p.area).toBeNull();
  });

  it('rejects invalid location longitude', () => {
    expect(() => PlaceSummary.parse({ ...VALID_PLACE_SUMMARY, location: [200, 33.3] })).toThrow();
  });

  it('accepts kind=street', () => {
    const p = PlaceSummary.parse({ ...VALID_PLACE_SUMMARY, kind: 'street', category: null });
    expect(p.kind).toBe('street');
  });
});

describe('Review', () => {
  const VALID_REVIEW = {
    id: '00000000-0000-0000-0000-000000000001',
    placeId: 'n12345',
    userId: '00000000-0000-0000-0000-000000000002',
    rating: 4,
    text: 'Great food!',
    createdAt: '2026-10-15T12:00:00.000Z',
  };

  it('parses a valid review', () => {
    const r = Review.parse(VALID_REVIEW);
    expect(r.rating).toBe(4);
  });

  it('accepts null text', () => {
    const r = Review.parse({ ...VALID_REVIEW, text: null });
    expect(r.text).toBeNull();
  });

  it('rejects rating below 1', () => {
    expect(() => Review.parse({ ...VALID_REVIEW, rating: 0 })).toThrow();
  });

  it('rejects rating above 5', () => {
    expect(() => Review.parse({ ...VALID_REVIEW, rating: 6 })).toThrow();
  });

  it('rejects non-integer rating', () => {
    expect(() => Review.parse({ ...VALID_REVIEW, rating: 3.5 })).toThrow();
  });

  it('rejects text over 500 chars', () => {
    expect(() => Review.parse({ ...VALID_REVIEW, text: 'x'.repeat(501) })).toThrow();
  });
});

describe('RatingSummary', () => {
  it('parses a valid rating summary', () => {
    const r = RatingSummary.parse({ placeId: 'n12345', count: 10, average: 4.2 });
    expect(r.count).toBe(10);
    expect(r.average).toBeCloseTo(4.2);
  });

  it('accepts null average when count is 0', () => {
    const r = RatingSummary.parse({ placeId: 'n12345', count: 0, average: null });
    expect(r.average).toBeNull();
  });

  it('rejects missing placeId', () => {
    expect(() => RatingSummary.parse({ count: 10, average: 4.0 })).toThrow();
  });
});
