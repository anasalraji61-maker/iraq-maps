/**
 * TrafficLayer – renders traffic-flow segments as a MapLibre line overlay.
 *
 * Each segment comes from our own backend (/insights/traffic). The layer
 * paints roads with a colour based on speed ratio (free-flow vs actual).
 * RTL-safe; no hardcoded text.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

// TrafficSegment is not yet in contracts – defined locally until the backend module adds it.
interface TrafficSegment {
  segmentId: string;
  speedKmh: number;
  freeFlowKmh: number;
  path: [number, number][];
}
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowLevel = 'free' | 'moderate' | 'heavy' | 'standstill';

interface TrafficFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: {
    segmentId: string;
    flow: FlowLevel;
    speedKmh: number;
    freeFlowKmh: number;
    congestionRatio: number; // 0–1; 1 = fully congested
  };
}

interface TrafficGeoJSON {
  type: 'FeatureCollection';
  features: TrafficFeature[];
}

export interface TrafficLayerProps {
  /** Bounding box to request traffic data for: [west, south, east, north]. */
  bbox: [number, number, number, number];
  /** Overall opacity for the traffic overlay (0–1). */
  opacity?: number;
  /** Whether the layer is currently enabled. */
  enabled: boolean;
  /** Called with the raw GeoJSON when data loads – the parent renders it on MapLibre. */
  onData: (geojson: TrafficGeoJSON | null) => void;
  /** Called when an error occurs fetching traffic. */
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Speed ratio to flow level. */
function speedToFlow(speedKmh: number, freeFlowKmh: number): FlowLevel {
  if (freeFlowKmh === 0) return 'free';
  const ratio = speedKmh / freeFlowKmh;
  if (ratio >= 0.8) return 'free';
  if (ratio >= 0.5) return 'moderate';
  if (ratio >= 0.25) return 'heavy';
  return 'standstill';
}

/** MapLibre paint colour per flow level. */
export const TRAFFIC_COLORS: Record<FlowLevel, string> = {
  free: '#4caf50',       // green
  moderate: '#ff9800',   // amber
  heavy: '#f44336',      // red
  standstill: '#7b1fa2', // purple
};

/**
 * Build the MapLibre layer specification for the traffic source.
 * The parent component passes this to MapLibre's addLayer / setLayerStyle.
 */
export function buildTrafficLayerSpec(sourceId: string, opacity: number) {
  return {
    id: 'traffic-flow',
    type: 'line' as const,
    source: sourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'match',
        ['get', 'flow'],
        'free', TRAFFIC_COLORS.free,
        'moderate', TRAFFIC_COLORS.moderate,
        'heavy', TRAFFIC_COLORS.heavy,
        'standstill', TRAFFIC_COLORS.standstill,
        TRAFFIC_COLORS.free,
      ],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        10, 2,
        14, 4,
        16, 6,
      ],
      'line-opacity': opacity,
    },
  };
}

// ---------------------------------------------------------------------------
// GeoJSON builder
// ---------------------------------------------------------------------------

function segmentsToGeoJSON(segments: TrafficSegment[]): TrafficGeoJSON {
  return {
    type: 'FeatureCollection',
    features: segments.map((seg) => {
      const flow = speedToFlow(seg.speedKmh, seg.freeFlowKmh);
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.path as [number, number][],
        },
        properties: {
          segmentId: seg.segmentId,
          flow,
          speedKmh: seg.speedKmh,
          freeFlowKmh: seg.freeFlowKmh,
          congestionRatio: seg.freeFlowKmh > 0 ? 1 - seg.speedKmh / seg.freeFlowKmh : 0,
        },
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 60_000; // 1 min

export function useTrafficLayer(
  apiBaseUrl: string,
  bbox: [number, number, number, number],
  enabled: boolean,
): { data: TrafficGeoJSON | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<TrafficGeoJSON | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    const fetchData = async () => {
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
        const res = await fetch(`${apiBaseUrl}/v1/insights/traffic?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { segments: TrafficSegment[] };
        setData(segmentsToGeoJSON(json.segments));
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        setError(t('search.networkError'));
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
    const interval = setInterval(() => void fetchData(), REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [apiBaseUrl, enabled, bbox[0], bbox[1], bbox[2], bbox[3]]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Component (render-prop / callback style – no JSX map rendering)
// ---------------------------------------------------------------------------

/**
 * TrafficLayer is a data-only component. It fetches traffic segments and
 * calls `onData` with the GeoJSON so the parent MapCanvas can add/update
 * the MapLibre source without managing fetch logic.
 */
export function TrafficLayer({ bbox, opacity: _opacity = 1, enabled, onData, onError }: TrafficLayerProps) {
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
        const res = await fetch(`${apiBaseUrl}/v1/insights/traffic?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { segments: TrafficSegment[] };
        onData(segmentsToGeoJSON(json.segments));
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        onError?.(err as Error);
        onData(null);
      }
    };

    void doFetch();
    const interval = setInterval(() => void doFetch(), REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [apiBaseUrl, enabled, onData, onError, bbox[0], bbox[1], bbox[2], bbox[3]]);

  return null;
}
