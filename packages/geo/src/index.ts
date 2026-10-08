// Pure functions, usable from Node and React Native. Coordinates are [lng, lat] (WGS84), no antimeridian handling.
import type { BBox, LngLat } from '@iraq-maps/contracts';

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;
const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));

/** Great-circle distance in metres.
 * @public frozen stub (M1) */
export function haversineM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Smallest [west, south, east, north] that contains every point. Throws on an empty list.
 * @public frozen stub (M1) */
export function bboxOf(points: readonly LngLat[]): BBox {
  if (points.length === 0) throw new RangeError('bboxOf needs at least one point');
  return points.reduce<BBox>(
    ([w, s, e, n], [lng, lat]) => [Math.min(w, lng), Math.min(s, lat), Math.max(e, lng), Math.max(n, lat)],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

/** Edges are inclusive.
 * @public frozen stub (M1) */
export function bboxContains([w, s, e, n]: BBox, [lng, lat]: LngLat): boolean {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** Camera limits for a city: its bbox grown on each side by padRatio of its width and height (MapLibre maxBounds),
 * clamped to valid coordinates.
 * @public frozen stub (M1) */
export function cameraBounds([w, s, e, n]: BBox, padRatio = 0.1): BBox {
  const dx = (e - w) * padRatio;
  const dy = (n - s) * padRatio;
  return [clamp(w - dx, 180), clamp(s - dy, 90), clamp(e + dx, 180), clamp(n + dy, 90)];
}
