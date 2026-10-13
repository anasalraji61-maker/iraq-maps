import { decodePolyline6 } from '@iraq-maps/geo';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo, type ReactElement } from 'react';
import { mapPartIDs } from './test-ids';

export interface RouteLayerProps {
  /** Encoded polyline6 string. */
  encoded: string;
  color?: string;
  width?: number;
}

/**
 * Decodes a polyline6 string and renders it as a MapLibre line layer.
 * Must be rendered inside a MapView.
 * @public M2
 */
export function RouteLayer({ encoded, color = '#1a73e8', width = 4 }: RouteLayerProps): ReactElement | null {
  const geojson = useMemo(() => {
    if (!encoded) return null;
    const coords = decodePolyline6(encoded);
    if (coords.length === 0) return null;
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: coords },
          properties: {},
        },
      ],
    };
  }, [encoded]);

  if (!geojson) return null;

  return (
    <GeoJSONSource id="route" testID={mapPartIDs.route} data={geojson}>
      <Layer
        id="route-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': color, 'line-width': width, 'line-opacity': 0.9 }}
      />
    </GeoJSONSource>
  );
}
