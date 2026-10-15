/**
 * Self-contained route container for the Expo Router screen `/route/[placeId]`.
 * Fetches the place, requests the route from the current location, and renders RoutePreviewScreen.
 */
import { type LngLat, type RouteResult, type TravelMode } from '@iraq-maps/contracts';
import { getLocale } from '@iraq-maps/i18n';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { Banner, Screen, Text } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useRouteInit } from '../hooks/useRouteInit';
import { RoutePreviewScreen } from './RoutePreviewScreen';

export function RoutePreviewContainer(): ReactElement {
  const { placeId, mode: modeParam } = useLocalSearchParams<{ placeId: string; mode?: string }>();
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const lang = getLocale();
  const router = useRouter();

  const [mode, setMode] = useState<TravelMode>(modeParam === 'walk' ? 'walk' : 'car');
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isModeLoading, setIsModeLoading] = useState(false);
  const [modeError, setModeError] = useState<string | undefined>();

  const originRef = useRef<LngLat | null>(null);
  const destinationRef = useRef<LngLat | null>(null);

  const { result, isLoading, error } = useRouteInit(placeId, 'car');

  // Once init resolves, seed refs and display
  useEffect(() => {
    if (result && originRef.current === null) {
      originRef.current = result.origin;
      destinationRef.current = result.destination;
      setRouteResult(result.route);
    }
  }, [result]);

  const fetchRoute = useCallback(
    async (org: LngLat, dest: LngLat, travelMode: TravelMode) => {
      setIsModeLoading(true);
      setModeError(undefined);
      try {
        const res = await api.routes.create({
          body: { origin: org, destination: dest, mode: travelMode, waypoints: [] },
        });
        if (res.status === 200) {
          setRouteResult(res.body);
        } else {
          setModeError('لا يمكن إيجاد مسار');
        }
      } catch {
        setModeError('فشل تحميل المسار');
      } finally {
        setIsModeLoading(false);
      }
    },
    [api],
  );

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
      isLoading={isModeLoading}
      error={modeError}
      destinationAddress={result?.destinationName}
      city={result?.city}
      apiBaseUrl={apiBaseUrl}
      lang={lang}
    />
  );
}
