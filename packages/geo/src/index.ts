// Pure functions, usable from Node and React Native. Coordinates are [lng, lat] (WGS84), no antimeridian handling.
export * from './iraq-data';
export * from './iraq-routing';
export * from './iraq-search';
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

// ── M2 stubs (frozen Phase B) ────────────────────────────────────────────────

/**
 * Encodes an array of [lng, lat] pairs to a Google / Valhalla polyline6 string (1e-6 degree precision).
 * @public M2
 */
export function encodePolyline6(coords: LngLat[]): string {
  let result = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const [lng, lat] of coords) {
    const latE6 = Math.round(lat * 1e6);
    const lngE6 = Math.round(lng * 1e6);
    result += encodeValue(latE6 - prevLat);
    result += encodeValue(lngE6 - prevLng);
    prevLat = latE6;
    prevLng = lngE6;
  }
  return result;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode(((0x20 | (v & 0x1f)) + 63));
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

/**
 * Decodes a Google / Valhalla polyline6 string (1e-6 degree precision) to LngLat pairs.
 * @public frozen stub (M2)
 */
export function decodePolyline6(encoded: string): LngLat[] {
  const result: LngLat[] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < encoded.length) {
    let shift = 0;
    let result5 = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result5 |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result5 & 1 ? ~(result5 >> 1) : result5 >> 1;
    shift = 0;
    result5 = 0;
    do {
      b = encoded.charCodeAt(i++) - 63;
      result5 |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result5 & 1 ? ~(result5 >> 1) : result5 >> 1;
    result.push([lng / 1e6, lat / 1e6]);
  }
  return result;
}

/**
 * Minimum perpendicular distance from `point` to the polyline in metres.
 * Throws when `line` is empty.
 * @public frozen stub (M2)
 */
export function distanceToPolylineM(point: LngLat, line: readonly LngLat[]): number {
  if (line.length === 0) throw new RangeError('distanceToPolylineM needs at least one point');
  return nearestPointOnLine(point, line).distanceM;
}

/**
 * Nearest point on the polyline to `point`, together with the segment index and distance.
 * Throws when `line` is empty.
 * @public frozen stub (M2)
 */
export function nearestPointOnLine(point: LngLat, line: readonly LngLat[]): { point: LngLat; index: number; distanceM: number } {
  if (line.length === 0) throw new RangeError('nearestPointOnLine needs at least one point');
  let best = { point: line[0]!, index: 0, distanceM: haversineM(point, line[0]!) };
  for (let i = 0; i + 1 < line.length; i++) {
    const p = closestOnSegment(point, line[i]!, line[i + 1]!);
    const d = haversineM(point, p);
    if (d < best.distanceM) best = { point: p, index: i, distanceM: d };
  }
  return best;
}

function closestOnSegment([px, py]: LngLat, [ax, ay]: LngLat, [bx, by]: LngLat): LngLat {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return [ax, ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return [ax + t * dx, ay + t * dy];
}

/**
 * Iraqi address format: `{streetName}، {neighborhood}، {city}` (Arabic comma ،).
 * Missing parts are omitted; returns an empty string when all parts are absent.
 * @public
 */
export function formatIraqiAddress(parts: { street?: string | null; neighborhood?: string | null; city?: string | null }): string {
  return [parts.street, parts.neighborhood, parts.city].filter((p): p is string => Boolean(p)).join('، ');
}

/**
 * Initial bearing from `from` to `to` in degrees clockwise from north (0–360).
 * Returns 0 when the points are identical.
 * @public frozen stub (M2)
 */
export function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const φ1 = rad(lat1);
  const φ2 = rad(lat2);
  const Δλ = rad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
