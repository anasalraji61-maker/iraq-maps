/**
 * Self-contained active navigation container for the Expo Router screen `/navigate/[placeId]`.
 * Fetches place & route, then drives the turn-by-turn ActiveNavigationScreen.
 */
import { PlaceId, type LngLat, type RouteRequest, type RouteResult } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { useApi } from '@iraq-maps/mobile-kit';
import { Banner, Screen, Text } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigation, type PositionSubscriber } from '../hooks/useNavigation';
import { ActiveNavigationScreen } from './ActiveNavigationScreen';

function NavigationSession({
  route,
  request,
  placeId,
  destinationName,
}: {
  route: RouteResult;
  request: RouteRequest;
  placeId: PlaceId;
  destinationName: string;
}): ReactElement {
  const router = useRouter();
  const locale = getLocale();

  // Subscribe to live location updates via expo-location watch
  const subscribeRef = useRef<PositionSubscriber | null>(null);
  useEffect(() => {
    subscribeRef.current = (cb) => {
      let locationSub: Location.LocationSubscription | null = null;
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 5 },
        (loc) => cb([loc.coords.longitude, loc.coords.latitude] as LngLat),
      ).then((s) => {
        locationSub = s;
      });
      return () => {
        void locationSub?.remove();
      };
    };
  }, []);

  const subscribe: PositionSubscriber = useCallback(
    (cb) => (subscribeRef.current ? subscribeRef.current(cb) : () => {}),
    [],
  );

  const navState = useNavigation({
    route,
    request,
    destinationPlaceId: placeId,
    destinationName,
    locale,
    subscribe,
  });

  return (
    <ActiveNavigationScreen
      {...navState}
      onStop={() => router.back()}
      onNavigateAgain={() =>
        router.replace({ pathname: '/route/[placeId]', params: { placeId: String(placeId) } })
      }
    />
  );
}

export function ActiveNavigationContainer(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const api = useApi();
  const [ready, setReady] = useState<{
    route: RouteResult;
    request: RouteRequest;
    name: string;
    pid: PlaceId;
  } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!placeId) return;
    void (async () => {
      try {
        const { granted } = await Location.requestForegroundPermissionsAsync();
        if (!granted) {
          setError('الموقع غير مسموح');
          return;
        }
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        // LngLat is [lng, lat]
        const org: LngLat = [coords.longitude, coords.latitude];

        const placeRes = await api.places.get({ params: { id: placeId } });
        if (placeRes.status !== 200) {
          setError('لم يوجد المكان');
          return;
        }
        const place = placeRes.body;
        const dest: LngLat = place.location;
        const name = (place.names.ar ?? place.names.en ?? place.names.ckb ?? placeId) as string;

        const request: RouteRequest = { origin: org, destination: dest, mode: 'car', waypoints: [] };
        const routeRes = await api.routes.create({ body: request });
        if (routeRes.status !== 200) {
          setError('لا يوجد مسار');
          return;
        }
        setReady({ route: routeRes.body, request, name, pid: placeId as PlaceId });
      } catch {
        setError('فشل التحميل');
      }
    })();
  }, [placeId, api]);

  if (error) {
    return (
      <Screen>
        <Banner kind="error" message={error} />
      </Screen>
    );
  }
  if (!ready) {
    return (
      <Screen>
        <Text>جاري التحميل...</Text>
      </Screen>
    );
  }

  return (
    <NavigationSession
      route={ready.route}
      request={ready.request}
      placeId={ready.pid}
      destinationName={ready.name}
    />
  );
}
