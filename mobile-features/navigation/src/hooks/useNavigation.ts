import { PlaceId, type LngLat, type Maneuver, type RouteRequest, type RouteResult, type TravelMode } from '@iraq-maps/contracts';
import { decodePolyline6 } from '@iraq-maps/geo';
import { recentRoutes, useApi } from '@iraq-maps/mobile-kit';
import { useEffect, useRef, useState } from 'react';
import { ArrivalDetector } from '../engine/arrival';
import { buildInstruction } from '../engine/maneuver';
import { DeviationDetector } from '../engine/deviation';

export type PositionCallback = (pos: LngLat) => void;
export type PositionSubscriber = (cb: PositionCallback) => () => void;

export interface NavigationState {
  currentManeuver: Maneuver | null;
  nextManeuver: Maneuver | null;
  currentInstruction: string;
  nextInstruction: string;
  distanceToManeuver: number;
  isRerouting: boolean;
  hasArrived: boolean;
}

export interface UseNavigationOptions {
  route: RouteResult;
  request: RouteRequest;
  /** Place id for recent-routes entry (optional; uses stringified destination if absent). */
  destinationPlaceId?: PlaceId;
  /** Destination name for recent-routes entry. */
  destinationName: string;
  locale: 'ar' | 'ckb' | 'en';
  /** Injects position updates; the caller (app layer) owns expo-location. */
  subscribe: PositionSubscriber;
  onRerouted?: (newRoute: RouteResult) => void;
  onArrived?: () => void;
}

export function useNavigation({
  route,
  request,
  destinationPlaceId,
  destinationName,
  locale,
  subscribe,
  onRerouted,
  onArrived,
}: UseNavigationOptions): NavigationState {
  const api = useApi();

  const [currentRoute, setCurrentRoute] = useState(route);
  const [isRerouting, setIsRerouting] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [maneuverIndex, setManeuverIndex] = useState(0);

  // Keep stable refs so detector callbacks always see latest route/state
  const routeRef = useRef(currentRoute);
  routeRef.current = currentRoute;
  const isReroutingRef = useRef(isRerouting);
  isReroutingRef.current = isRerouting;

  const deviationRef = useRef<DeviationDetector | null>(null);
  const arrivalRef = useRef<ArrivalDetector | null>(null);

  // Rebuild detectors whenever the route changes
  useEffect(() => {
    const polyline = decodePolyline6(currentRoute.polyline6);

    const deviation = new DeviationDetector(polyline, () => {
      if (isReroutingRef.current) return;
      setIsRerouting(true);
      api.routes
        .create({ body: request })
        .then((res) => {
          if (res.status !== 200) return;
          const newRoute = res.body;
          setCurrentRoute(newRoute);
          setManeuverIndex(0);
          deviation.reset();
          onRerouted?.(newRoute);
        })
        .catch(() => undefined)
        .finally(() => setIsRerouting(false));
    });

    const arrival = new ArrivalDetector(() => {
      setHasArrived(true);
      const fallbackId = PlaceId.parse(`dest:${request.destination[0]},${request.destination[1]}`);
      recentRoutes
        .add({
          placeId: destinationPlaceId ?? fallbackId,
          name: destinationName,
          mode: request.mode as TravelMode,
          distanceM: routeRef.current.distanceM,
          durationS: routeRef.current.durationS,
          at: new Date().toISOString(),
        })
        .catch(() => undefined);
      onArrived?.();
    });

    deviationRef.current = deviation;
    arrivalRef.current = arrival;
  }, [currentRoute, api, request, destinationName, onRerouted, onArrived]);

  useEffect(() => {
    if (hasArrived) return;
    const unsub = subscribe((pos) => {
      deviationRef.current?.feed(pos);
      arrivalRef.current?.feed(pos, request.destination as unknown as LngLat);

      // Advance maneuver index: find the first maneuver ahead of current position
      const maneuvers = routeRef.current.maneuvers;
      const polyline = decodePolyline6(routeRef.current.polyline6);
      // Find nearest segment index in the polyline
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < polyline.length; i++) {
        const dx = polyline[i]![0]! - pos[0];
        const dy = polyline[i]![1]! - pos[1];
        const d = dx * dx + dy * dy;
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      // Advance to the next maneuver whose shape index is ahead of current position
      let next = 0;
      for (let i = 0; i < maneuvers.length; i++) {
        if (maneuvers[i]!.beginShapeIndex <= nearestIdx) next = i;
      }
      setManeuverIndex(next);
    });
    return unsub;
  }, [subscribe, hasArrived, request.destination]);

  const maneuvers = currentRoute.maneuvers;
  const currentManeuver = maneuvers[maneuverIndex] ?? null;
  const nextManeuver = maneuvers[maneuverIndex + 1] ?? null;

  return {
    currentManeuver,
    nextManeuver,
    currentInstruction: currentManeuver
      ? buildInstruction(currentManeuver.type, currentManeuver.streetNames, currentManeuver.distanceM, locale)
      : '',
    nextInstruction: nextManeuver
      ? buildInstruction(nextManeuver.type, nextManeuver.streetNames, nextManeuver.distanceM, locale)
      : '',
    distanceToManeuver: currentManeuver?.distanceM ?? 0,
    isRerouting,
    hasArrived,
  };
}
