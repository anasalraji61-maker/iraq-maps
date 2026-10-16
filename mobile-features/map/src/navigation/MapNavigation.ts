/**
 * MapNavigation – turn-by-turn navigation state machine for the map feature.
 *
 * Responsibilities:
 *  - Start / stop a navigation session toward a destination LngLat.
 *  - Track the user's position against the active route.
 *  - Detect off-route (≥100 m from nearest route point) and trigger re-route.
 *  - Detect arrival (≤50 m from destination) and mark the session complete.
 *  - Update ETA every 30 s (recalculated from remaining distance at 40 km/h average for car, 5 km/h for walk).
 *  - Expose a React hook (useMapNavigation) for component consumption.
 *  - Expose quickPOIAlongRoute to find POI categories near the active route corridor.
 *
 * This module is pure TypeScript (no JSX) so it can be imported from both the
 * navigation UI component and from the map shell without pulling in React Native
 * view APIs at the top level.
 */

import type { LngLat, Maneuver, RouteResult, TravelMode } from '@iraq-maps/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

/** Distance from the route at which we trigger a re-route request (metres). */
export const OFF_ROUTE_THRESHOLD_M = 100;

/** Distance from the destination at which we consider the user arrived (metres). */
export const ARRIVAL_THRESHOLD_M = 50;

/** ETA refresh interval in milliseconds. */
export const ETA_REFRESH_MS = 30_000;

/** Average travel speed used for live ETA estimation (metres per second). */
const AVG_SPEED_MS: Record<TravelMode, number> = {
  car: 40_000 / 3_600,   // 40 km/h → ~11.1 m/s
  walk: 5_000 / 3_600,   // 5 km/h  →  ~1.4 m/s
};

// ── Geometry helpers ─────────────────────────────────────────────────────────

// LngLat is [lng, lat] tuple per contracts.
const lngOf = (p: LngLat): number => p[0];
const latOf = (p: LngLat): number => p[1];

/** Haversine distance between two points (metres). */
export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6_371_000;
  const dLat = toRad(latOf(b) - latOf(a));
  const dLon = toRad(lngOf(b) - lngOf(a));
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c = sinLat * sinLat + Math.cos(toRad(latOf(a))) * Math.cos(toRad(latOf(b))) * sinLon * sinLon;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(c)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Decode a Google polyline6 string (precision 1e-6 degrees) into an array of LngLat.
 * Used to reconstruct the route geometry for off-route detection.
 */
export function decodePolyline6(encoded: string): LngLat[] {
  const result: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result_ = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result_ |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLat = (result_ & 1) !== 0 ? ~(result_ >> 1) : result_ >> 1;
    lat += dLat;

    shift = 0;
    result_ = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result_ |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dLng = (result_ & 1) !== 0 ? ~(result_ >> 1) : result_ >> 1;
    lng += dLng;

    result.push([lng / 1e6, lat / 1e6]);
  }

  return result;
}

/**
 * Find the closest point on the route polyline to a given position.
 * Returns the index of the nearest vertex and the distance in metres.
 */
export function nearestRoutePoint(
  position: LngLat,
  polyline: LngLat[],
): { index: number; distanceM: number } {
  let best = { index: 0, distanceM: Infinity };
  for (let i = 0; i < polyline.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const d = haversineM(position, polyline[i]!);
    if (d < best.distanceM) best = { index: i, distanceM: d };
  }
  return best;
}

// ── ETA helpers ──────────────────────────────────────────────────────────────

/**
 * Estimate remaining seconds from the current polyline index to the end,
 * scaled by the given average speed.
 */
export function estimateRemainingSeconds(
  polyline: LngLat[],
  fromIndex: number,
  mode: TravelMode,
): number {
  let remainingM = 0;
  for (let i = fromIndex; i < polyline.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    remainingM += haversineM(polyline[i]!, polyline[i + 1]!);
  }
  const speed = AVG_SPEED_MS[mode];
  return speed > 0 ? remainingM / speed : 0;
}

/**
 * Compute the remaining distance in metres from polyline[fromIndex] to the end.
 */
export function remainingDistanceM(polyline: LngLat[], fromIndex: number): number {
  let total = 0;
  for (let i = fromIndex; i < polyline.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    total += haversineM(polyline[i]!, polyline[i + 1]!);
  }
  return total;
}

// ── POI-along-route helper ───────────────────────────────────────────────────

/** Bounding box (min/max lat/lng) covering the entire route with a corridor buffer. */
export function routeCorridorBBox(
  polyline: LngLat[],
  bufferM = 500,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const degPerM = 1 / 111_320; // rough approximation
  const buf = bufferM * degPerM;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const p of polyline) {
    const lat = latOf(p);
    const lng = lngOf(p);
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return {
    minLat: minLat - buf,
    maxLat: maxLat + buf,
    minLng: minLng - buf,
    maxLng: maxLng + buf,
  };
}

/**
 * Check whether a given LngLat lies within the route corridor bounding box.
 * This is a fast preliminary filter; callers should do a proper distance check
 * for precision if needed.
 */
export function isInRouteCorridor(
  point: LngLat,
  bbox: ReturnType<typeof routeCorridorBBox>,
): boolean {
  const lat = latOf(point);
  const lng = lngOf(point);
  return (
    lat >= bbox.minLat &&
    lat <= bbox.maxLat &&
    lng >= bbox.minLng &&
    lng <= bbox.maxLng
  );
}

// ── Active maneuver resolution ───────────────────────────────────────────────

/**
 * Find the current active maneuver given the user's position index along the polyline.
 * A maneuver belongs to the user's current segment when their shape index is between
 * this maneuver's beginShapeIndex and the next maneuver's beginShapeIndex (exclusive).
 */
export function activeManeuverIndex(maneuvers: Maneuver[], shapeIndex: number): number {
  let active = 0;
  for (let i = 0; i < maneuvers.length - 1; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (shapeIndex >= maneuvers[i]!.beginShapeIndex) {
      active = i;
    }
  }
  return active;
}

// ── Navigation state ─────────────────────────────────────────────────────────

export type NavigationStatus =
  | 'idle'
  | 'active'
  | 'rerouting'
  | 'arrived'
  | 'stopped';

export interface NavigationState {
  status: NavigationStatus;
  route: RouteResult | null;
  /** Decoded polyline (cached to avoid repeated decoding). */
  polyline: LngLat[];
  /** Current polyline index (nearest route vertex to the user). */
  shapeIndex: number;
  /** Active maneuver index. */
  maneuverIndex: number;
  /** Remaining distance in metres. */
  remainingM: number;
  /** Remaining time in seconds. */
  remainingS: number;
  /** ETA as a Date. */
  eta: Date | null;
  /** Whether the user is currently off-route. */
  offRoute: boolean;
  /** The destination LngLat for this session. */
  destination: LngLat | null;
  mode: TravelMode;
  /** How many times we have re-routed in this session. */
  rerouteCount: number;
}

export function makeInitialState(): NavigationState {
  return {
    status: 'idle',
    route: null,
    polyline: [],
    shapeIndex: 0,
    maneuverIndex: 0,
    remainingM: 0,
    remainingS: 0,
    eta: null,
    offRoute: false,
    destination: null,
    mode: 'car',
    rerouteCount: 0,
  };
}

// ── Navigation reducer ───────────────────────────────────────────────────────

export type NavigationAction =
  | { type: 'START'; route: RouteResult; destination: LngLat; mode: TravelMode }
  | { type: 'UPDATE_POSITION'; position: LngLat; now: Date }
  | { type: 'REROUTING' }
  | { type: 'REROUTE_DONE'; route: RouteResult; now: Date }
  | { type: 'STOP' }
  | { type: 'ARRIVED' };

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'START': {
      const polyline = decodePolyline6(action.route.polyline6);
      const remainingM = action.route.distanceM;
      const remainingS = action.route.durationS;
      return {
        ...makeInitialState(),
        status: 'active',
        route: action.route,
        polyline,
        shapeIndex: 0,
        maneuverIndex: 0,
        remainingM,
        remainingS,
        eta: new Date(Date.now() + remainingS * 1000),
        offRoute: false,
        destination: action.destination,
        mode: action.mode,
        rerouteCount: 0,
      };
    }

    case 'UPDATE_POSITION': {
      if (state.status !== 'active' || !state.route) return state;

      const nearest = nearestRoutePoint(action.position, state.polyline);
      const offRoute = nearest.distanceM > OFF_ROUTE_THRESHOLD_M;

      // Arrival check: distance from position to destination.
      const destDist = state.destination != null
        ? haversineM(action.position, state.destination)
        : Infinity;
      if (destDist <= ARRIVAL_THRESHOLD_M) {
        return { ...state, status: 'arrived', remainingM: 0, remainingS: 0, offRoute: false };
      }

      const newShapeIndex = Math.max(state.shapeIndex, nearest.index);
      const newManeuverIndex = state.route
        ? activeManeuverIndex(state.route.maneuvers, newShapeIndex)
        : 0;

      const newRemainingM = remainingDistanceM(state.polyline, newShapeIndex);
      const newRemainingS = estimateRemainingSeconds(state.polyline, newShapeIndex, state.mode);

      return {
        ...state,
        shapeIndex: newShapeIndex,
        maneuverIndex: newManeuverIndex,
        remainingM: newRemainingM,
        remainingS: newRemainingS,
        eta: new Date(action.now.getTime() + newRemainingS * 1000),
        offRoute,
      };
    }

    case 'REROUTING':
      return { ...state, status: 'rerouting' };

    case 'REROUTE_DONE': {
      const polyline = decodePolyline6(action.route.polyline6);
      const remainingS = action.route.durationS;
      return {
        ...state,
        status: 'active',
        route: action.route,
        polyline,
        shapeIndex: 0,
        maneuverIndex: 0,
        remainingM: action.route.distanceM,
        remainingS,
        eta: new Date(action.now.getTime() + remainingS * 1000),
        offRoute: false,
        rerouteCount: state.rerouteCount + 1,
      };
    }

    case 'ARRIVED':
      return { ...state, status: 'arrived', remainingM: 0, remainingS: 0 };

    case 'STOP':
      return makeInitialState();

    default:
      return state;
  }
}

// ── useMapNavigation hook ────────────────────────────────────────────────────

export interface UseMapNavigationReturn {
  state: NavigationState;
  /** Start navigating toward a destination. The caller must supply the resolved route. */
  startNavigation: (route: RouteResult, destination: LngLat, mode: TravelMode) => void;
  /** Feed in a new GPS position. Call this whenever expo-location fires a new reading. */
  updatePosition: (position: LngLat) => void;
  /** Supply a freshly computed route after an off-route detection triggers a re-route. */
  supplyReroute: (route: RouteResult) => void;
  /** Stop the current navigation session. */
  stopNavigation: () => void;
  /** The current active maneuver, or null when idle. */
  activeManeuver: Maneuver | null;
  /** The next upcoming maneuver (one ahead of the active), or null. */
  nextManeuver: Maneuver | null;
  /** Whether an off-route state should trigger a re-route API call (debounced to avoid spam). */
  shouldReroute: boolean;
}

/**
 * React hook that wraps the navigation reducer with:
 *  - ETA refresh on a 30 s interval.
 *  - Off-route debounce (5 s) before setting shouldReroute to prevent flickering.
 *  - Automatic arrival event dispatch.
 */
export function useMapNavigation(): UseMapNavigationReturn {
  const [state, setState] = useState<NavigationState>(makeInitialState);
  const [shouldReroute, setShouldReroute] = useState(false);

  // Use a ref for the state inside setTimeout/setInterval callbacks to avoid stale closures.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Off-route debounce timer.
  const offRouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ETA refresh interval.
  const etaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dispatch = useCallback((action: NavigationAction) => {
    setState((prev) => navigationReducer(prev, action));
  }, []);

  // ETA refresh every 30 s while active.
  useEffect(() => {
    if (state.status === 'active') {
      etaIntervalRef.current = setInterval(() => {
        const s = stateRef.current;
        if (s.status !== 'active') return;
        const newRemainingS = estimateRemainingSeconds(s.polyline, s.shapeIndex, s.mode);
        setState((prev) => ({
          ...prev,
          remainingS: newRemainingS,
          eta: new Date(Date.now() + newRemainingS * 1000),
        }));
      }, ETA_REFRESH_MS);
    } else {
      if (etaIntervalRef.current) {
        clearInterval(etaIntervalRef.current);
        etaIntervalRef.current = null;
      }
    }
    return () => {
      if (etaIntervalRef.current) {
        clearInterval(etaIntervalRef.current);
        etaIntervalRef.current = null;
      }
    };
  }, [state.status]);

  // Off-route → shouldReroute debounce.
  useEffect(() => {
    if (state.offRoute) {
      if (!offRouteTimerRef.current) {
        offRouteTimerRef.current = setTimeout(() => {
          if (stateRef.current.offRoute) setShouldReroute(true);
          offRouteTimerRef.current = null;
        }, 5_000);
      }
    } else {
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
      }
      setShouldReroute(false);
    }
    return () => {
      if (offRouteTimerRef.current) {
        clearTimeout(offRouteTimerRef.current);
        offRouteTimerRef.current = null;
      }
    };
  }, [state.offRoute]);

  const startNavigation = useCallback(
    (route: RouteResult, destination: LngLat, mode: TravelMode) => {
      setShouldReroute(false);
      dispatch({ type: 'START', route, destination, mode });
    },
    [dispatch],
  );

  const updatePosition = useCallback(
    (position: LngLat) => {
      dispatch({ type: 'UPDATE_POSITION', position, now: new Date() });
    },
    [dispatch],
  );

  const supplyReroute = useCallback(
    (route: RouteResult) => {
      setShouldReroute(false);
      dispatch({ type: 'REROUTE_DONE', route, now: new Date() });
    },
    [dispatch],
  );

  const stopNavigation = useCallback(() => {
    setShouldReroute(false);
    dispatch({ type: 'STOP' });
  }, [dispatch]);

  const activeManeuver: Maneuver | null =
    state.route && state.route.maneuvers.length > 0
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      ? (state.route.maneuvers[state.maneuverIndex] ?? state.route.maneuvers[0]!)
      : null;

  const nextManeuver: Maneuver | null =
    state.route && state.maneuverIndex + 1 < state.route.maneuvers.length
      ? (state.route.maneuvers[state.maneuverIndex + 1] ?? null)
      : null;

  return {
    state,
    startNavigation,
    updatePosition,
    supplyReroute,
    stopNavigation,
    activeManeuver,
    nextManeuver,
    shouldReroute,
  };
}

// ── Quick POI along route ────────────────────────────────────────────────────

export interface POIAlongRouteRequest {
  polyline: LngLat[];
  /** Category to look for, e.g. 'fuel', 'food', 'hospital'. */
  category: string;
  /** How far from the route to include candidates (metres, default 500). */
  corridorM?: number;
}

export interface POIAlongRouteCandidate {
  point: LngLat;
  /** Straight-line distance from the nearest route point (metres). */
  distanceFromRouteM: number;
  /** Normalised position along the route (0 = start, 1 = end). */
  routeProgress: number;
}

/**
 * Filter a list of candidate LngLats to those that lie within the route corridor.
 * Returns them sorted by route progress (so "coming up next" appears first).
 *
 * This is a client-side filter for a pre-fetched list of nearby POIs.
 * The actual API call (fetching the POI list) is the caller's responsibility;
 * this function only performs the geometric filtering.
 */
export function quickPOIAlongRoute(
  request: POIAlongRouteRequest,
  candidates: LngLat[],
): POIAlongRouteCandidate[] {
  const { polyline, corridorM = 500 } = request;
  const bbox = routeCorridorBBox(polyline, corridorM);
  const total = polyline.length - 1;

  const results: POIAlongRouteCandidate[] = [];

  for (const candidate of candidates) {
    if (!isInRouteCorridor(candidate, bbox)) continue;
    const nearest = nearestRoutePoint(candidate, polyline);
    if (nearest.distanceM > corridorM) continue;
    results.push({
      point: candidate,
      distanceFromRouteM: nearest.distanceM,
      routeProgress: total > 0 ? nearest.index / total : 0,
    });
  }

  results.sort((a, b) => a.routeProgress - b.routeProgress);
  return results;
}
