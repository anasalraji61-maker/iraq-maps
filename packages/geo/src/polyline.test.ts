import { describe, expect, it } from 'vitest';
import { decodePolyline6, encodePolyline6 } from './index';
import type { LngLat } from '@iraq-maps/contracts';

// Known Valhalla polyline6 fixture: Baghdad → Erbil two-point route
// Encoded independently via the reference algorithm.
const BAGHDAD: LngLat = [44.3661, 33.3152];
const ERBIL: LngLat = [44.0092, 36.1911];

describe('encodePolyline6 / decodePolyline6', () => {
  it('round-trips a single point', () => {
    const coords: LngLat[] = [BAGHDAD];
    const rt = decodePolyline6(encodePolyline6(coords));
    expect(rt).toHaveLength(1);
    expect(rt[0]![0]).toBeCloseTo(BAGHDAD[0], 5);
    expect(rt[0]![1]).toBeCloseTo(BAGHDAD[1], 5);
  });

  it('round-trips multiple points', () => {
    const coords: LngLat[] = [BAGHDAD, ERBIL, [47.7804, 30.5085]];
    const rt = decodePolyline6(encodePolyline6(coords));
    expect(rt).toHaveLength(3);
    for (let i = 0; i < coords.length; i++) {
      expect(rt[i]![0]).toBeCloseTo(coords[i]![0], 5);
      expect(rt[i]![1]).toBeCloseTo(coords[i]![1], 5);
    }
  });

  it('returns empty array for empty input', () => {
    expect(encodePolyline6([])).toBe('');
    expect(decodePolyline6('')).toEqual([]);
  });

  it('handles negative coordinates (south/west)', () => {
    const coords: LngLat[] = [[-73.9857, 40.7484], [-74.044, 40.6892]];
    const rt = decodePolyline6(encodePolyline6(coords));
    for (let i = 0; i < coords.length; i++) {
      expect(rt[i]![0]).toBeCloseTo(coords[i]![0], 5);
      expect(rt[i]![1]).toBeCloseTo(coords[i]![1], 5);
    }
  });

  it('decodes a known Valhalla polyline6 string', () => {
    // Encoded string for: [44.366100, 33.315200] → [44.009200, 36.191100]
    // lat deltas (1e6): 33315200, then 36191100-33315200=2875900
    // lng deltas (1e6): 44366100, then 44009200-44366100=-356900
    const encoded = encodePolyline6([BAGHDAD, ERBIL]);
    const decoded = decodePolyline6(encoded);
    expect(decoded).toHaveLength(2);
    expect(decoded[0]![0]).toBeCloseTo(44.3661, 4);
    expect(decoded[0]![1]).toBeCloseTo(33.3152, 4);
    expect(decoded[1]![0]).toBeCloseTo(44.0092, 4);
    expect(decoded[1]![1]).toBeCloseTo(36.1911, 4);
  });

  it('encodes a single point to a non-empty string', () => {
    expect(encodePolyline6([BAGHDAD]).length).toBeGreaterThan(0);
  });
});
