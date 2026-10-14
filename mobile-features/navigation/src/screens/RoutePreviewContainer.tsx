/**
 * Self-contained route container for the Expo Router screen `/route/[placeId]`.
 * Fetches the place, requests the route from the current location, and renders RoutePreviewScreen.
 */
import { type LngLat, type RouteResult, type TravelMode } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Banner, Screen, Text } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { RoutePreviewScreen } from './RoutePreviewScreen';

export function RoutePreviewContainer(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const api = useApi();
  const router = useRouter();

  const [mode, setMode] = useState<TravelMode>('car');
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  // Stable refs for origin/destination so mode changes can re-request without re-fetching place
  const originRef = useRef<LngLat | null>(null);
  const destinationRef = useRef<LngLat | null>(null);
  const [destinationName, setDestinationName] = useState('');
  const initializedRef = useRef(false);

  const fetchRoute = useCallback(
    async (org: LngLat, dest: LngLat, travelMode: TravelMode) => {
      setIsLoading(true);
      setError(undefined);
      try {
        const res = await api.routes.create({
          body: { origin: org, destination: dest, mode: travelMode, waypoints: [] },
        });
        if (res.status === 200) {
          setRouteResult(res.body);
        } else {
          setError('لا يمكن إيجاد مسار');
        }
      } catch {
        setError('فشل تحميل المسار');
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  // Initial load: get location + place, then fetch route
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
        // LngLat is [lng, lat]
        const org: LngLat = [coords.longitude, coords.latitude];
        originRef.current = org;

        const placeRes = await api.places.get({ params: { id: placeId } });
        if (placeRes.status !== 200) {
          setError('لم يتم العثور على المكان');
          setIsLoading(false);
          return;
        }
        const place = placeRes.body;
        const dest: LngLat = place.location;
        destinationRef.current = dest;
        setDestinationName(
          (place.names.ar ?? place.names.en ?? place.names.ckb ?? placeId) as string,
        );

        await fetchRoute(org, dest, 'car');
      } catch {
        setError('فشل التحميل');
        setIsLoading(false);
      }
    })();
  }, [placeId, api, fetchRoute]);

  const handleModeChange = (newMode: TravelMode) => {
    setMode(newMode);
    if (originRef.current && destinationRef.current) {
      void fetchRoute(originRef.current, destinationRef.current, newMode);
    }
  };

  const handleStart = () => {
    if (!placeId) return;
    router.push({ pathname: '/navigate/[placeId]', params: { placeId } });
  };

  if (!routeResult && isLoading) {
    return (
      <Screen>
        <Text>جاري التحميل...</Text>
      </Screen>
    );
  }

  if (!routeResult) {
    return (
      <Screen>
        <Banner kind="error" message={error ?? 'لا يوجد مسار'} />
      </Screen>
    );
  }

  return (
    <RoutePreviewScreen
      route={routeResult}
      mode={mode}
      onModeChange={handleModeChange}
      onStart={handleStart}
      isLoading={isLoading}
      error={error}
      destinationAddress={destinationName}
    />
  );
}
