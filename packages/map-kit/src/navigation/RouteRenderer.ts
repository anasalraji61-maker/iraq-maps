/**
 * RouteRenderer — manages a live navigation route overlay on a MapLibre map.
 *
 * Responsibilities:
 * - Render full route polyline with theming support
 * - Highlight the active (upcoming) segment in a brighter colour
 * - Fade out passed segments progressively
 * - Animate the user-position dot along the route with interpolation
 * - Issue smooth camera updates as the user moves
 *
 * This is a pure-TypeScript controller: it holds no React state. The caller
 * owns the MapLibre MapView ref and passes it via `attach()`. Designed to be
 * constructed once and updated via `update()` on each GPS tick.
 */

import { decodePolyline6 } from '@iraq-maps/geo';
import type { LngLat } from '@iraq-maps/contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouteRendererConfig {
  /** Colour for the not-yet-travelled portion of the route. */
  activeColor?: string;
  /** Colour for the already-travelled portion (faded). */
  passedColor?: string;
  /** Colour for the highlight pulse on the leading segment. */
  pulseColor?: string;
  /** Route line width in pixels. */
  lineWidth?: number;
  /** Whether to auto-follow the user (camera tracks position). */
  followUser?: boolean;
  /** Camera pitch in degrees when following. */
  followPitch?: number;
  /** Camera zoom when following. */
  followZoom?: number;
  /** Bearing offset in degrees so the current road is centred. */
  headingOffset?: number;
  /** Smoothing factor 0–1 for interpolated camera bearing (lower = smoother). */
  bearingSmoothing?: number;
}

export interface RouteRendererState {
  /** GeoJSON FeatureCollection for the full route (passed + active). */
  fullRouteGeoJSON: GeoJSONFeatureCollection;
  /** GeoJSON for the already-passed portion. */
  passedRouteGeoJSON: GeoJSONFeatureCollection;
  /** GeoJSON for the still-active portion. */
  activeRouteGeoJSON: GeoJSONFeatureCollection;
  /** GeoJSON point for the animated position dot. */
  dotGeoJSON: GeoJSONFeatureCollection;
  /** Camera target derived from current user position + heading. */
  camera: RendererCamera;
  /** Index of the closest coordinate on the route to the user's position. */
  closestIndex: number;
  /** Metres from the start of the route to the current position. */
  progressM: number;
}

export interface RendererCamera {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
}

// ─── Minimal GeoJSON types (avoids heavy type deps) ──────────────────────────

interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString;

interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// ─── Geometry utilities ───────────────────────────────────────────────────────

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = deg2rad(b[1] - a[1]);
  const dLng = deg2rad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x =
    sinDLat * sinDLat +
    Math.cos(deg2rad(a[1])) * Math.cos(deg2rad(b[1])) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Bearing in degrees (0 = north, clockwise) from point a to b. */
function bearingDeg(a: [number, number], b: [number, number]): number {
  const dLng = deg2rad(b[0] - a[0]);
  const lat1 = deg2rad(a[1]);
  const lat2 = deg2rad(b[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Linearly interpolate between two coordinates by t (0–1). */
function lerpCoord(
  a: [number, number],
  b: [number, number],
  t: number,
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Smooth angle with previous bearing using exponential moving average. */
function smoothBearing(prev: number, next: number, alpha: number): number {
  // Handle 359 → 1 wrap-around
  let diff = next - prev;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (prev + alpha * diff + 360) % 360;
}

/** Find the index of the coordinate on the route nearest to `pos`. */
function closestSegmentIndex(
  coords: [number, number][],
  pos: [number, number],
  startFrom: number,
): number {
  let bestIdx = startFrom;
  let bestDist = Infinity;
  // Only scan forward (up to 50 points ahead) for performance
  const end = Math.min(coords.length, startFrom + 50);
  for (let i = startFrom; i < end; i++) {
    const d = haversineM(coords[i]!, pos);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Sum of segment lengths from index 0 to `idx`. */
function cumulativeDistanceM(coords: [number, number][], idx: number): number {
  let total = 0;
  for (let i = 0; i < idx && i + 1 < coords.length; i++) {
    total += haversineM(coords[i]!, coords[i + 1]!);
  }
  return total;
}

function emptyCollection(): GeoJSONFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function lineCollection(coords: [number, number][]): GeoJSONFeatureCollection {
  if (coords.length < 2) return emptyCollection();
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      },
    ],
  };
}

function pointCollection(coord: [number, number]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {},
      },
    ],
  };
}

// ─── RouteRenderer ────────────────────────────────────────────────────────────

const DEFAULTS: Required<RouteRendererConfig> = {
  activeColor: '#2563EB',
  passedColor: '#9CA3AF',
  pulseColor: '#60A5FA',
  lineWidth: 6,
  followUser: true,
  followPitch: 30,
  followZoom: 17,
  headingOffset: 0,
  bearingSmoothing: 0.25,
};

export class RouteRenderer {
  private readonly cfg: Required<RouteRendererConfig>;

  /** Decoded route coordinates [lng, lat][]. */
  private coords: [number, number][] = [];

  /** Last closest-index (avoids re-scanning the full route each tick). */
  private lastClosestIdx = 0;

  /** Smoothed camera bearing from the previous frame. */
  private smoothedBearing = 0;

  constructor(config?: RouteRendererConfig) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load a new route from an encoded polyline6 string.
   * Call this when a new route is planned or re-calculated.
   */
  loadRoute(polyline6: string): void {
    this.coords = decodePolyline6(polyline6) as [number, number][];
    this.lastClosestIdx = 0;
    this.smoothedBearing = 0;
  }

  /** True when a route is loaded and has at least two coordinates. */
  get hasRoute(): boolean {
    return this.coords.length >= 2;
  }

  /** Total route length in metres. */
  get totalDistanceM(): number {
    return cumulativeDistanceM(this.coords, this.coords.length - 1);
  }

  /**
   * Update the renderer with a new GPS position and heading.
   * Returns a new `RouteRendererState` describing what to render.
   *
   * @param position  Current [lng, lat] from GPS.
   * @param heading   GPS/compass heading in degrees (0 = north). Used for
   *                  camera bearing when `followUser` is enabled.
   */
  update(position: [number, number], heading?: number): RouteRendererState {
    if (!this.hasRoute) {
      return this.emptyState(position);
    }

    // Find the closest point on the route.
    const closestIdx = closestSegmentIndex(
      this.coords,
      position,
      this.lastClosestIdx,
    );
    this.lastClosestIdx = closestIdx;

    // Interpolate the dot position onto the route line.
    const dotCoord = this.interpolateDot(position, closestIdx);

    // Split route into passed (before closestIdx) and active (from closestIdx).
    const passedCoords = this.coords.slice(0, closestIdx + 1);
    const activeCoords = this.coords.slice(closestIdx);

    const progressM = cumulativeDistanceM(this.coords, closestIdx);

    // Camera bearing: use GPS heading when available, else infer from route.
    let targetBearing = heading ?? this.inferBearing(closestIdx);
    targetBearing = smoothBearing(this.smoothedBearing, targetBearing, this.cfg.bearingSmoothing);
    this.smoothedBearing = targetBearing;

    const camera: RendererCamera = {
      center: dotCoord,
      zoom: this.cfg.followZoom,
      pitch: this.cfg.followPitch,
      bearing: this.cfg.followUser ? (targetBearing + this.cfg.headingOffset) % 360 : 0,
    };

    return {
      fullRouteGeoJSON: lineCollection(this.coords),
      passedRouteGeoJSON: lineCollection(passedCoords),
      activeRouteGeoJSON: lineCollection(activeCoords),
      dotGeoJSON: pointCollection(dotCoord),
      camera,
      closestIndex: closestIdx,
      progressM,
    };
  }

  /**
   * Return the MapLibre layer paint properties for each sub-layer.
   * The caller applies these to their GeoJSONSource layers.
   */
  layerPaints(): {
    passed: Record<string, unknown>;
    active: Record<string, unknown>;
    activeBorder: Record<string, unknown>;
    dot: Record<string, unknown>;
  } {
    return {
      passed: {
        'line-color': this.cfg.passedColor,
        'line-width': this.cfg.lineWidth - 2,
        'line-opacity': 0.5,
      },
      active: {
        'line-color': this.cfg.activeColor,
        'line-width': this.cfg.lineWidth,
        'line-opacity': 0.92,
      },
      activeBorder: {
        'line-color': '#FFFFFF',
        'line-width': this.cfg.lineWidth + 4,
        'line-opacity': 0.3,
        'line-blur': 2,
      },
      dot: {
        'circle-color': this.cfg.activeColor,
        'circle-radius': 8,
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': 3,
      },
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private interpolateDot(
    pos: [number, number],
    closestIdx: number,
  ): [number, number] {
    if (closestIdx + 1 >= this.coords.length) {
      return this.coords[this.coords.length - 1]!;
    }
    const a = this.coords[closestIdx]!;
    const b = this.coords[closestIdx + 1]!;
    const segLen = haversineM(a, b);
    if (segLen < 1) return a;
    const dA = haversineM(a, pos);
    const t = Math.min(1, Math.max(0, dA / segLen));
    return lerpCoord(a, b, t);
  }

  private inferBearing(closestIdx: number): number {
    const next = Math.min(closestIdx + 1, this.coords.length - 1);
    if (next === closestIdx) return this.smoothedBearing;
    return bearingDeg(this.coords[closestIdx]!, this.coords[next]!);
  }

  private emptyState(position: [number, number]): RouteRendererState {
    return {
      fullRouteGeoJSON: emptyCollection(),
      passedRouteGeoJSON: emptyCollection(),
      activeRouteGeoJSON: emptyCollection(),
      dotGeoJSON: pointCollection(position),
      camera: {
        center: position as LngLat,
        zoom: this.cfg.followZoom,
        pitch: 0,
        bearing: 0,
      },
      closestIndex: 0,
      progressM: 0,
    };
  }
}
