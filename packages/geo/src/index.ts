// Frozen M1 signatures; builder-map-kit implements them. Pure functions, usable from Node and React Native.
import type { BBox, LngLat } from '@iraq-maps/contracts';

const notImplemented = (): never => {
  throw new Error('not implemented');
};

/** Great-circle distance in metres.
 * @public frozen stub (M1) */
export function haversineM(_a: LngLat, _b: LngLat): number {
  return notImplemented();
}

/** Smallest [west, south, east, north] that contains every point.
 * @public frozen stub (M1) */
export function bboxOf(_points: readonly LngLat[]): BBox {
  return notImplemented();
}

/** @public frozen stub (M1) */
export function bboxContains(_bbox: BBox, _point: LngLat): boolean {
  return notImplemented();
}

/** Camera limits for a city: its bbox grown on each side by padRatio of its width and height (MapLibre maxBounds).
 * @public frozen stub (M1) */
export function cameraBounds(_bbox: BBox, _padRatio = 0.1): BBox {
  return notImplemented();
}
