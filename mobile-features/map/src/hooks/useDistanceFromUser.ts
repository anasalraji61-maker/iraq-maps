/**
 * useDistanceFromUser — resolves distance (in metres) from the user's
 * current location to a given [lng, lat] coordinate.
 *
 * Returns `null` while loading or when location permission is denied.
 * Uses a cached location if already fetched in the same mount; never
 * requests permission again on error.
 */
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

/** Haversine distance in metres between two [lng, lat] points. */
function haversineM(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number],
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useDistanceFromUser(
  placeLngLat: [number, number] | undefined,
): number | null {
  const [distM, setDistM] = useState<number | null>(null);
  // Keep a module-level cache so sibling screens share one lookup per session.
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (!placeLngLat || resolvedRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        resolvedRef.current = true;
        setDistM(haversineM([coords.longitude, coords.latitude], placeLngLat));
      } catch {
        // permission denied or unavailable — stay null
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placeLngLat]);

  return distM;
}
