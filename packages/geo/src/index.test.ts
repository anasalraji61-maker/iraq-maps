import type { BBox, LngLat } from '@iraq-maps/contracts';
import { describe, expect, it } from 'vitest';
import { bboxContains, bboxOf, cameraBounds, haversineM } from './index';

const baghdad: LngLat = [44.3661, 33.3152];
const erbil: LngLat = [44.0092, 36.1911];
const basra: LngLat = [47.7804, 30.5085];
const within = (actual: number, expected: number, ratio: number) => expect(Math.abs(actual - expected) / expected).toBeLessThan(ratio);

describe('haversineM', () => {
  it('matches WGS84 geodesic distances (Vincenty) within 0.5%', () => {
    within(haversineM(baghdad, erbil), 320_709.6, 0.005);
    within(haversineM(baghdad, basra), 448_434.1, 0.005);
  });

  it('is one sphere degree per degree of latitude, symmetric, and zero for the same point', () => {
    within(haversineM([44, 33], [44, 34]), 111_195, 0.0001);
    expect(haversineM(erbil, baghdad)).toBeCloseTo(haversineM(baghdad, erbil), 6);
    expect(haversineM(baghdad, baghdad)).toBe(0);
  });

  it('stays finite for antipodal points', () => {
    within(haversineM([0, 0], [180, 0]), Math.PI * 6_371_008.8, 1e-9);
  });
});

describe('bboxOf', () => {
  it('is the smallest box around every point', () => {
    expect(bboxOf([baghdad, erbil, basra])).toEqual([44.0092, 30.5085, 47.7804, 36.1911]);
    expect(bboxOf([baghdad])).toEqual([...baghdad, ...baghdad]);
  });

  it('throws on an empty list', () => {
    expect(() => bboxOf([])).toThrow(RangeError);
  });
});

describe('bboxContains', () => {
  const box: BBox = [44, 33, 45, 34];

  it('includes the edges and corners', () => {
    expect(bboxContains(box, [44.5, 33.5])).toBe(true);
    expect(bboxContains(box, [44, 33])).toBe(true);
    expect(bboxContains(box, [45, 34])).toBe(true);
    expect(bboxContains(box, [45, 33.5])).toBe(true);
  });

  it('excludes points outside on any side', () => {
    for (const p of [[43.999, 33.5], [45.001, 33.5], [44.5, 32.999], [44.5, 34.001]] satisfies LngLat[]) expect(bboxContains(box, p)).toBe(false);
  });
});

describe('cameraBounds', () => {
  it('grows the box by padRatio of its width and height (default 0.1)', () => {
    const [w, s, e, n] = cameraBounds([44, 33, 46, 34]);
    expect([w, s, e, n].map((v) => Number(v.toFixed(9)))).toEqual([43.8, 32.9, 46.2, 34.1]);
    expect(cameraBounds([44, 33, 46, 34], 0)).toEqual([44, 33, 46, 34]);
    expect(cameraBounds([44, 33, 46, 34], 0.5)).toEqual([43, 32.5, 47, 34.5]);
  });

  it('contains the original box and clamps to valid coordinates', () => {
    const city: BBox = [44.2, 33.2, 44.5, 33.45];
    const bounds = cameraBounds(city);
    expect(bboxContains(bounds, [city[0], city[1]]) && bboxContains(bounds, [city[2], city[3]])).toBe(true);
    expect(cameraBounds([-180, -90, 180, 90])).toEqual([-180, -90, 180, 90]);
  });
});
