/**
 * TransitLayer – public transit routes and stops overlay.
 *
 * Iraq public transit data is sparse; this layer is a stub that will fill in
 * as our backend collects route data. Until then it renders whatever the API
 * returns (may be empty), and the UI shows an appropriate placeholder.
 *
 * RTL-safe; Arabic-first via t().
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

// TransitRoute and TransitStop are not yet in contracts – defined locally until the backend module adds them.
interface TransitRoute {
  routeId: string;
  routeNumber: string;
  routeType?: string;
  operatorName?: string;
  path: [number, number][];
}
interface TransitStop {
  stopId: string;
  nameAr?: string;
  name?: string;
  lat: number;
  lng: number;
  routeIds?: string[];
  isMajor?: boolean;
}
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
// import { tokens } from '@iraq-maps/ui'; // reserved for future use
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { t } from '../../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouteType = 'bus' | 'minibus' | 'microbus' | 'other';

interface TransitRouteFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: {
    routeId: string;
    routeNumber: string;
    routeType: RouteType;
    color: string;
    operatorName?: string;
  };
}

interface TransitStopFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    stopId: string;
    nameAr: string;
    routeIds: string[];
    isMajor: boolean;
  };
}

export interface TransitGeoJSON {
  routes: { type: 'FeatureCollection'; features: TransitRouteFeature[] };
  stops: { type: 'FeatureCollection'; features: TransitStopFeature[] };
}

export interface TransitLayerProps {
  bbox: [number, number, number, number];
  opacity?: number;
  enabled: boolean;
  onData: (data: TransitGeoJSON | null) => void;
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Colours per route type
// ---------------------------------------------------------------------------

export const TRANSIT_COLORS: Record<RouteType, string> = {
  bus: '#1565c0',
  minibus: '#6a1b9a',
  microbus: '#e65100',
  other: '#37474f',
};

// ---------------------------------------------------------------------------
// Layer specs
// ---------------------------------------------------------------------------

export function buildTransitRoutesLayerSpec(sourceId: string, opacity: number) {
  return {
    id: 'transit-routes',
    type: 'line' as const,
    source: sourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3, 16, 5],
      'line-opacity': opacity,
    },
  };
}

export function buildTransitStopsLayerSpec(sourceId: string, opacity: number) {
  return {
    id: 'transit-stops',
    type: 'circle' as const,
    source: sourceId,
    minzoom: 12,
    paint: {
      'circle-radius': ['case', ['get', 'isMajor'], 8, 5],
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#1565c0',
      'circle-opacity': opacity,
      'circle-stroke-opacity': opacity,
    },
  };
}

export function buildTransitStopLabelsLayerSpec(glyphsBase: string, opacity: number) {
  return {
    id: 'transit-stop-labels',
    type: 'symbol' as const,
    source: 'transit-stops',
    minzoom: 14,
    layout: {
      'text-field': ['get', 'nameAr'],
      'text-font': ['NotoSans Arabic Regular'],
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 0.6],
      'text-max-width': 8,
    },
    paint: {
      'text-color': '#1565c0',
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.5,
      'text-opacity': opacity,
    },
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function routesToGeoJSON(routes: TransitRoute[]): TransitGeoJSON['routes'] {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: r.path as [number, number][] },
      properties: {
        routeId: r.routeId,
        routeNumber: r.routeNumber,
        routeType: (r.routeType ?? 'bus') as RouteType,
        color: TRANSIT_COLORS[(r.routeType as RouteType) ?? 'bus'],
        operatorName: r.operatorName,
      },
    })),
  };
}

function stopsToGeoJSON(stops: TransitStop[]): TransitGeoJSON['stops'] {
  return {
    type: 'FeatureCollection',
    features: stops.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: {
        stopId: s.stopId,
        nameAr: (s.nameAr ?? s.name) ?? '',
        routeIds: s.routeIds ?? [],
        isMajor: s.isMajor ?? false,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTransitLayer(
  apiBaseUrl: string,
  bbox: [number, number, number, number],
  enabled: boolean,
): { data: TransitGeoJSON | null; loading: boolean; error: string | null; isStub: boolean } {
  const [data, setData] = useState<TransitGeoJSON | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStub, setIsStub] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    const doFetch = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          west: String(bbox[0]),
          south: String(bbox[1]),
          east: String(bbox[2]),
          north: String(bbox[3]),
        });
        const res = await fetch(`${apiBaseUrl}/v1/transit/routes?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { routes: TransitRoute[]; stops: TransitStop[]; isStub?: boolean };
        setIsStub(json.isStub ?? false);
        setData({ routes: routesToGeoJSON(json.routes), stops: stopsToGeoJSON(json.stops) });
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        setError(t('search.networkError'));
      } finally {
        setLoading(false);
      }
    };
    void doFetch();
    return () => abortRef.current?.abort();
  }, [apiBaseUrl, enabled, bbox[0], bbox[1], bbox[2], bbox[3]]);

  return { data, loading, error, isStub };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransitLayer({ bbox, opacity: _opacity = 1, enabled, onData, onError }: TransitLayerProps) {
  const apiBaseUrl = useApiBaseUrl();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      onData(null);
      return;
    }
    const doFetch = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const params = new URLSearchParams({
          west: String(bbox[0]),
          south: String(bbox[1]),
          east: String(bbox[2]),
          north: String(bbox[3]),
        });
        const res = await fetch(`${apiBaseUrl}/v1/transit/routes?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { routes: TransitRoute[]; stops: TransitStop[] };
        onData({ routes: routesToGeoJSON(json.routes), stops: stopsToGeoJSON(json.stops) });
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        onError?.(err as Error);
        onData(null);
      }
    };
    void doFetch();
    return () => abortRef.current?.abort();
  }, [apiBaseUrl, enabled, onData, onError, bbox[0], bbox[1], bbox[2], bbox[3]]);

  return null;
}

// ---------------------------------------------------------------------------
// Stub notice banner (shown when API returns isStub: true)
// ---------------------------------------------------------------------------

export function TransitStubNotice() {
  return (
    <View style={ts.banner}>
      <RNText style={ts.bannerText}>{t('transit.stubNotice')}</RNText>
    </View>
  );
}

const ts = StyleSheet.create({
  banner: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    margin: 12,
    borderWidth: 1,
    borderColor: '#ffc107',
  },
  bannerText: { fontSize: 13, color: '#856404', writingDirection: 'rtl', textAlign: 'center' },
});
