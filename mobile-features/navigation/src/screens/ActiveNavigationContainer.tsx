/**
 * Self-contained active navigation container for the Expo Router screen `/navigate/[placeId]`.
 * Fetches place & route, then drives the turn-by-turn ActiveNavigationScreen.
 */
import { PlaceId } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Banner, Screen, Text } from '@iraq-maps/ui';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigation, type PositionSubscriber } from '../hooks/useNavigation';
import { useRouteInit } from '../hooks/useRouteInit';
import { ActiveNavigationScreen } from './ActiveNavigationScreen';
import type { RouteResult, RouteRequest, CityDescriptor } from '@iraq-maps/contracts';
import type { LngLat } from '@iraq-maps/contracts';

function NavigationSession({
  route,
  request,
  placeId,
  destinationName,
  city,
  apiBaseUrl,
  lang,
}: {
  route: RouteResult;
  request: RouteRequest;
  placeId: PlaceId;
  destinationName: string;
  city?: CityDescriptor;
  apiBaseUrl?: string;
  lang?: string;
}): ReactElement {
  const router = useRouter();
  const locale = getLocale();

  // Subscribe to live location updates via expo-location watch
  const subscribeRef = useRef<PositionSubscriber | null>(null);
  const [currentSpeedMps, setCurrentSpeedMps] = useState<number | null>(null);
  useEffect(() => {
    subscribeRef.current = (cb) => {
      let locationSub: Location.LocationSubscription | null = null;
      void Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 5 },
        (loc) => {
          cb([loc.coords.longitude, loc.coords.latitude] as LngLat);
          // loc.coords.speed is m/s (>= 0) or null when unavailable
          setCurrentSpeedMps(typeof loc.coords.speed === 'number' && loc.coords.speed >= 0 ? loc.coords.speed : null);
        },
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
      routePolyline6={route.polyline6}
      city={city}
      apiBaseUrl={apiBaseUrl}
      lang={lang}
      currentSpeedMps={currentSpeedMps}
    />
  );
}

export function ActiveNavigationContainer(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const apiBaseUrl = useApiBaseUrl();
  const lang = getLocale();

  const { result, isLoading, error } = useRouteInit(placeId, 'car');

  if (error) {
    return (
      <Screen>
        <Banner kind="error" message={error} />
      </Screen>
    );
  }
  if (!result || isLoading) {
    return (
      <Screen>
        <Text>جاري التحميل...</Text>
      </Screen>
    );
  }

  return (
    <NavigationSession
      route={result.route}
      request={result.request}
      placeId={placeId as PlaceId}
      destinationName={result.destinationName}
      city={result.city}
      apiBaseUrl={apiBaseUrl}
      lang={lang}
    />
  );
}
