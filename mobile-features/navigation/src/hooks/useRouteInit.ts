/**
 * Shared initialisation hook for route-based screens.
 * Requests location permission, resolves the device position, fetches
 * the destination place + first city, and creates an initial route.
 *
 * Used by RoutePreviewContainer and ActiveNavigationContainer so that
 * the duplicate async start-up sequences live in one place.
 */
import { type CityDescriptor, type LngLat, type RouteRequest, type RouteResult, type TravelMode } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export interface RouteInitState {
  /** Null while loading or on error. */
  result: {
    origin: LngLat;
    destination: LngLat;
    destinationName: string;
    city: CityDescriptor | undefined;
    route: RouteResult;
    request: RouteRequest;
  } | null;
  isLoading: boolean;
  error: string | undefined;
}

/**
 * One-shot effect: acquires location + place + city + initial route.
 * Re-runs only when placeId or mode change.
 */
export function useRouteInit(placeId: string | undefined, mode: TravelMode): RouteInitState {
  const api = useApi();
  const [result, setResult] = useState<RouteInitState['result']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!placeId || initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (!granted) {
          setError('لا يمكن الوصول إلى الموقع');
          setIsLoading(false);
          return;
        }
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const origin: LngLat = [coords.longitude, coords.latitude];

        const [placeRes, cityRes] = await Promise.all([
          api.places.get({ params: { id: placeId } }),
          api.cities.list(),
        ]);
        if (placeRes.status !== 200) {
          setError('لم يتم العثور على المكان');
          setIsLoading(false);
          return;
        }
        const place = placeRes.body;
        const destination: LngLat = place.location;
        const destinationName = (place.names.ar ?? place.names.en ?? place.names.ckb ?? placeId) as string;
        const city = cityRes.status === 200 ? cityRes.body.items[0] : undefined;

        const request: RouteRequest = { origin, destination, mode, waypoints: [] };
        const routeRes = await api.routes.create({ body: request });
        if (routeRes.status !== 200) {
          setError('لا يمكن إيجاد مسار');
          setIsLoading(false);
          return;
        }
        setResult({ origin, destination, destinationName, city, route: routeRes.body, request });
      } catch {
        setError('فشل التحميل');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [placeId, api, mode]);

  return { result, isLoading, error };
}
