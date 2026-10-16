/**
 * IncidentsLayer – renders traffic incidents/accidents on the map.
 *
 * Wraps the existing incident data from modules/incidents (via our backend)
 * into MapLibre-ready GeoJSON and provides a React component that re-polls
 * every minute.
 *
 * RTL-safe; no hardcoded text.
 */

import type { Incident } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncidentFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    incidentId: string;
    incidentType: string;
    icon: string;
    severityLevel: 1 | 2 | 3;
    titleAr: string;
    expiresAt: string;
    reportCount: number;
  };
}

export interface IncidentsGeoJSON {
  type: 'FeatureCollection';
  features: IncidentFeature[];
}

export interface IncidentsLayerProps {
  bbox: [number, number, number, number];
  enabled: boolean;
  onData: (data: IncidentsGeoJSON | null) => void;
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Icons & colours
// ---------------------------------------------------------------------------

const INCIDENT_ICONS: Record<string, string> = {
  accident: '💥',
  road_closure: '🚧',
  pothole: '🕳️',
  flooding: '🌊',
  traffic_jam: '🚗',
  wrong_way: '⛔',
  hazard: '⚠️',
  police: '🚔',
  speed_camera: '📷',
  roadblock: '🚧',
  flood: '🌊',
  construction: '🏗️',
  other: '⚠️',
};

/** MapLibre image id (pre-loaded by the map canvas) */
const INCIDENT_IMAGE_IDS: Record<string, string> = {
  accident: 'incident-accident',
  roadblock: 'incident-roadblock',
  flood: 'incident-flood',
  construction: 'incident-construction',
  other: 'incident-other',
};

/** Severity: 1 = minor, 2 = moderate, 3 = severe */
function classifySeverity(incident: Incident): 1 | 2 | 3 {
  if (incident.severity === 'severe') return 3;
  if (incident.severity === 'moderate') return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function incidentsToGeoJSON(incidents: Incident[]): IncidentsGeoJSON {
  const now = Date.now();
  const active = incidents.filter((i) => {
    return i.active && new Date(i.expiresAt).getTime() > now;
  });
  return {
    type: 'FeatureCollection',
    features: active.map((inc) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [inc.location[0], inc.location[1]] },
      properties: {
        incidentId: inc.id,
        incidentType: inc.type,
        icon: INCIDENT_ICONS[inc.type] ?? '⚠️',
        severityLevel: classifySeverity(inc),
        titleAr: t('incidents.typeOther'),
        expiresAt: inc.expiresAt,
        reportCount: inc.confirmedCount,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Layer specs
// ---------------------------------------------------------------------------

/** Symbol layer spec – requires the incident icon images to be pre-loaded. */
export function buildIncidentsSymbolLayerSpec(sourceId: string) {
  return {
    id: 'incidents-symbols',
    type: 'symbol' as const,
    source: sourceId,
    layout: {
      'icon-image': [
        'match',
        ['get', 'incidentType'],
        'accident', INCIDENT_IMAGE_IDS.accident,
        'roadblock', INCIDENT_IMAGE_IDS.roadblock,
        'flood', INCIDENT_IMAGE_IDS.flood,
        'construction', INCIDENT_IMAGE_IDS.construction,
        INCIDENT_IMAGE_IDS.other,
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 1, 16, 1.2],
      'icon-allow-overlap': true,
      'icon-anchor': 'bottom',
    },
  };
}

/** Circle layer as fallback when icons aren't loaded. */
export function buildIncidentsCircleLayerSpec(sourceId: string) {
  return {
    id: 'incidents-circles',
    type: 'circle' as const,
    source: sourceId,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 14, 16, 18],
      'circle-color': [
        'match',
        ['get', 'severityLevel'],
        3, '#d32f2f',
        2, '#f57c00',
        /* 1 */ '#fbc02d',
      ],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.9,
    },
  };
}

/** Label layer for report count. */
export function buildIncidentsLabelLayerSpec(sourceId: string) {
  return {
    id: 'incidents-labels',
    type: 'symbol' as const,
    source: sourceId,
    minzoom: 13,
    layout: {
      'text-field': ['get', 'icon'],
      'text-size': 16,
      'text-anchor': 'center',
      'text-allow-overlap': true,
    },
    paint: { 'text-opacity': 1 },
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const REFRESH_MS = 60_000;

export function useIncidentsLayer(
  apiBaseUrl: string,
  bbox: [number, number, number, number],
  enabled: boolean,
): { data: IncidentsGeoJSON | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<IncidentsGeoJSON | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        const res = await fetch(`${apiBaseUrl}/v1/incidents?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { incidents: Incident[] };
        setData(incidentsToGeoJSON(json.incidents));
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        setError(t('search.networkError'));
      } finally {
        setLoading(false);
      }
    };
    void doFetch();
    const interval = setInterval(() => void doFetch(), REFRESH_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [apiBaseUrl, enabled, bbox[0], bbox[1], bbox[2], bbox[3]]);

  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IncidentsLayer({ bbox, enabled, onData, onError }: IncidentsLayerProps) {
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
        const res = await fetch(`${apiBaseUrl}/v1/incidents?${params}`, { signal: ctrl.signal });
        const json = (await res.json()) as { incidents: Incident[] };
        onData(incidentsToGeoJSON(json.incidents));
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        onError?.(err as Error);
        onData(null);
      }
    };
    void doFetch();
    const interval = setInterval(() => void doFetch(), REFRESH_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [apiBaseUrl, enabled, onData, onError, bbox[0], bbox[1], bbox[2], bbox[3]]);

  return null;
}
