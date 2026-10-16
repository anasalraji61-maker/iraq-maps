/**
 * BoundsManager – camera/bounds helpers for MapLibre.
 *
 * Provides utilities to:
 * - Fit camera to a route (LineString coordinates)
 * - Fit camera to a POI cluster (point array)
 * - Animate camera to a single location with optional zoom/bearing
 * - Compute bounding boxes from coordinates
 * - Convert between coordinate formats
 *
 * @public frozen stub (M4)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** [longitude, latitude] – GeoJSON coordinate order. */
export type LngLat = [number, number];

/** Axis-aligned bounding box: [west, south, east, north]. */
export type BBox = [number, number, number, number];

export interface CameraPosition {
  center: LngLat;
  zoom: number;
  bearing?: number;
  pitch?: number;
}

export interface AnimateCameraOptions {
  duration?: number; // ms, default 600
  easing?: 'ease' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  bearing?: number;
  pitch?: number;
  /** When true, snap instead of animate. */
  immediate?: boolean;
}

export interface FitBoundsOptions {
  paddingTop?: number;
  paddingBottom?: number;
  paddingStart?: number;
  paddingEnd?: number;
  /** Uniform padding shorthand (overridden by individual sides). */
  padding?: number;
  maxZoom?: number;
  minZoom?: number;
  duration?: number;
  bearing?: number;
}

// ---------------------------------------------------------------------------
// BBox helpers
// ---------------------------------------------------------------------------

/**
 * Compute the bounding box of an array of coordinates.
 * Returns null for an empty array.
 */
export function computeBBox(coords: LngLat[]): BBox | null {
  if (coords.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const first = coords[0]!;
  let west = first[0];
  let east = first[0];
  let south = first[1];
  let north = first[1];
  for (const [lng, lat] of coords) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

/**
 * Expand a BBox by a margin in degrees. Useful to add padding before fitting.
 */
export function expandBBox(bbox: BBox, marginDeg: number): BBox {
  return [
    bbox[0] - marginDeg,
    bbox[1] - marginDeg,
    bbox[2] + marginDeg,
    bbox[3] + marginDeg,
  ];
}

/**
 * Center of a bounding box as [lng, lat].
 */
export function bboxCenter(bbox: BBox): LngLat {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

/**
 * Approximate zoom level to fit a bBox on a given viewport (in pixels).
 * Uses the Mercator formula. Result is clamped to [minZoom, maxZoom].
 */
export function zoomForBBox(
  bbox: BBox,
  viewportWidth: number,
  viewportHeight: number,
  minZoom = 1,
  maxZoom = 20,
): number {
  const TILE_SIZE = 256;
  const lngDelta = Math.abs(bbox[2] - bbox[0]);
  const _latDelta = Math.abs(bbox[3] - bbox[1]);
  // Convert lat span to Mercator
  const latSpanMerc = Math.log(
    Math.tan((Math.PI / 4) + (bbox[3] * Math.PI) / 360) /
    Math.tan((Math.PI / 4) + (bbox[1] * Math.PI) / 360),
  );
  const zoomLng = Math.log2((viewportWidth / TILE_SIZE) * (360 / Math.max(lngDelta, 0.0001)));
  const zoomLat = Math.log2((viewportHeight / TILE_SIZE) * (2 * Math.PI / Math.max(latSpanMerc, 0.0001)));
  const zoom = Math.min(zoomLng, zoomLat) - 0.5; // -0.5 adds a small visual padding
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

/**
 * Compute the BBox for a route given as an array of [lng, lat] coordinate
 * pairs (GeoJSON LineString coordinates).
 */
export function routeBBox(coordinates: LngLat[]): BBox | null {
  return computeBBox(coordinates);
}

/**
 * Build the camera position to fit an entire route onto the viewport.
 *
 * @param coordinates - route geometry ([lng, lat] pairs)
 * @param viewportWidth - in logical pixels
 * @param viewportHeight - in logical pixels
 * @param opts - padding and zoom bounds
 */
export function cameraForRoute(
  coordinates: LngLat[],
  viewportWidth: number,
  viewportHeight: number,
  opts: FitBoundsOptions = {},
): CameraPosition | null {
  if (coordinates.length === 0) return null;

  const bbox = computeBBox(coordinates);
  if (!bbox) return null;

  const padding = opts.padding ?? 40;
  const padTop = opts.paddingTop ?? padding;
  const padBottom = opts.paddingBottom ?? padding;
  const padStart = opts.paddingStart ?? padding;
  const padEnd = opts.paddingEnd ?? padding;

  const usableWidth = Math.max(1, viewportWidth - padStart - padEnd);
  const usableHeight = Math.max(1, viewportHeight - padTop - padBottom);

  // Offset the center by half the padding asymmetry so the route sits in
  // the visible area. (Small approximation – ignores Mercator distortion.)
  const center: LngLat = [
    (bbox[0] + bbox[2]) / 2 + ((padEnd - padStart) / viewportWidth) * (bbox[2] - bbox[0]),
    (bbox[1] + bbox[3]) / 2 + ((padTop - padBottom) / viewportHeight) * (bbox[3] - bbox[1]),
  ];

  const zoom = zoomForBBox(bbox, usableWidth, usableHeight, opts.minZoom, opts.maxZoom);

  return { center, zoom, bearing: opts.bearing ?? 0, pitch: 0 };
}

// ---------------------------------------------------------------------------
// Cluster helpers
// ---------------------------------------------------------------------------

/**
 * Build the camera position to fit a cluster of POI points.
 *
 * Automatically expands the BBox slightly so edge markers aren't clipped.
 */
export function cameraForCluster(
  points: LngLat[],
  viewportWidth: number,
  viewportHeight: number,
  opts: FitBoundsOptions = {},
): CameraPosition | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { center: points[0]!, zoom: opts.maxZoom ?? 15 };
  }

  const raw = computeBBox(points);
  if (!raw) return null;

  // Add a small margin so the outermost markers don't sit on the edge
  const marginDeg = Math.max(
    Math.abs(raw[2] - raw[0]) * 0.1,
    Math.abs(raw[3] - raw[1]) * 0.1,
    0.002, // at least ~200 m
  );
  const bbox = expandBBox(raw, marginDeg);

  return cameraForRoute(
    [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
    viewportWidth,
    viewportHeight,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Animate-to-location helper
// ---------------------------------------------------------------------------

/**
 * Interpolate between two camera positions for a smooth animation tick.
 * `t` is the progress value in [0, 1].
 */
export function interpolateCamera(from: CameraPosition, to: CameraPosition, t: number): CameraPosition {
  const eased = easeInOut(t);
  return {
    center: [
      lerp(from.center[0], to.center[0], eased),
      lerp(from.center[1], to.center[1], eased),
    ],
    zoom: lerp(from.zoom, to.zoom, eased),
    bearing: lerp(from.bearing ?? 0, to.bearing ?? 0, eased),
    pitch: lerp(from.pitch ?? 0, to.pitch ?? 0, eased),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ---------------------------------------------------------------------------
// Coordinate converters
// ---------------------------------------------------------------------------

/** Decimal degrees → degrees/minutes/seconds string (Arabic-locale-aware). */
export function toDMS(decimal: number, isLat: boolean): string {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minDecimal = (abs - deg) * 60;
  const min = Math.floor(minDecimal);
  const sec = ((minDecimal - min) * 60).toFixed(1);
  const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
  return `${deg}°${min}′${sec}″${dir}`;
}

/** Approximate distance between two lat/lng points in metres (Haversine). */
export function haversineMetres(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ---------------------------------------------------------------------------
// BoundsManager class
// ---------------------------------------------------------------------------

export class BoundsManager {
  private viewportWidth: number;
  private viewportHeight: number;

  constructor(viewportWidth: number, viewportHeight: number) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  /** Update viewport size (e.g. after orientation change). */
  setViewport(width: number, height: number): this {
    this.viewportWidth = width;
    this.viewportHeight = height;
    return this;
  }

  fitRoute(coordinates: LngLat[], opts: FitBoundsOptions = {}): CameraPosition | null {
    return cameraForRoute(coordinates, this.viewportWidth, this.viewportHeight, opts);
  }

  fitCluster(points: LngLat[], opts: FitBoundsOptions = {}): CameraPosition | null {
    return cameraForCluster(points, this.viewportWidth, this.viewportHeight, opts);
  }

  /** Camera to show a single location at a comfortable zoom. */
  focusLocation(location: LngLat, zoom = 15, opts: AnimateCameraOptions = {}): CameraPosition {
    return { center: location, zoom, bearing: opts.bearing ?? 0, pitch: opts.pitch ?? 0 };
  }

  /** True if a point is inside the given BBox. */
  contains(bbox: BBox, point: LngLat): boolean {
    return (
      point[0] >= bbox[0] &&
      point[0] <= bbox[2] &&
      point[1] >= bbox[1] &&
      point[1] <= bbox[3]
    );
  }

  /** Current viewport as a rough BBox centred at `center` for a given zoom. */
  viewportBBox(center: LngLat, zoom: number): BBox {
    // Approximate degrees per pixel at the given zoom and latitude
    const metersPerPixel =
      (156_543.03 * Math.cos((center[1] * Math.PI) / 180)) / Math.pow(2, zoom);
    const lngPerPixel = metersPerPixel / (111_320 * Math.cos((center[1] * Math.PI) / 180));
    const latPerPixel = metersPerPixel / 110_540;
    const halfLng = (this.viewportWidth / 2) * lngPerPixel;
    const halfLat = (this.viewportHeight / 2) * latPerPixel;
    return [center[0] - halfLng, center[1] - halfLat, center[0] + halfLng, center[1] + halfLat];
  }
}

export function createBoundsManager(viewportWidth: number, viewportHeight: number): BoundsManager {
  return new BoundsManager(viewportWidth, viewportHeight);
}
