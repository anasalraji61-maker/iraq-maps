import { OSM_ATTRIBUTION, testIDs, type BBox, type CityDescriptor, type LngLat, type Locale } from '@iraq-maps/contracts';
import { cameraBounds } from '@iraq-maps/geo';
import { Camera, GeoJSONSource, Layer, Map as MapView, NativeUserLocation, type CameraRef, type CameraStop, type MapProps } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildStyle, resolveSource } from './style';
import { mapPartIDs } from './test-ids';

/** @public frozen stub (M1) */
export interface MapMarker {
  id: string;
  location: LngLat;
  selected?: boolean;
}

/** Controlled camera; a new value animates the map to it.
 * @public frozen stub (M1) */
export type MapCamera = { center: LngLat; zoom: number } | { bounds: BBox; paddingPx?: number };

/** @public frozen stub (M1) */
export interface MapCanvasProps {
  city: CityDescriptor;
  apiBaseUrl: string;
  /** Label language of the map (the style is rebuilt when it changes). */
  lang: Locale;
  camera?: MapCamera;
  markers?: readonly MapMarker[];
  onMarkerPress?: (id: string) => void;
  /** Shows the user location dot; the caller owns the permission request. */
  showUserLocation?: boolean;
  onPress?: MapProps['onPress'];
  /** Once the visible region settles after a pan, zoom or camera move (e.g. to search near the map centre). */
  onCameraChanged?: (center: LngLat, zoom: number) => void;
}

const EMPTY: readonly MapMarker[] = [];
const ANIMATION = { duration: 600, easing: 'ease' } as const;

/** MapLibre Native map (testIDs.map.view) that always renders MapAttribution; there is no prop to hide it.
 * @public frozen stub (M1) */
export function MapCanvas({ city, apiBaseUrl, lang, camera, markers = EMPTY, onMarkerPress, showUserLocation = false, onPress, onCameraChanged }: MapCanvasProps): ReactElement {
  const { tilesUrl, glyphsUrl } = resolveSource(city, apiBaseUrl);
  const mapStyle = useMemo(() => buildStyle(lang, { tilesUrl, glyphsUrl }), [lang, tilesUrl, glyphsUrl]);
  const [w, s, e, n] = city.bbox;
  const limits = useMemo(() => ({ initialViewState: { bounds: [w, s, e, n] as BBox }, maxBounds: cameraBounds([w, s, e, n]) }), [w, s, e, n]);
  const cameraRef = useRef<CameraRef>(null);
  const [styleLoaded, setStyleLoaded] = useState(false);
  // Imperative and keyed on the camera reference: the native `stop` prop is diffed by value, so an equal new camera would
  // not move a panned map, and an unrelated re-render must not pull it back. Native drops stops until the style has loaded.
  useEffect(() => {
    if (camera && styleLoaded) void cameraRef.current?.setStop(toStop(camera));
  }, [camera, styleLoaded]);
  const data = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: markers.map((m) => ({
        type: 'Feature' as const,
        id: m.id,
        geometry: { type: 'Point' as const, coordinates: m.location },
        properties: { selected: m.selected === true },
      })),
    }),
    [markers],
  );

  return (
    <View style={styles.fill}>
      <MapView
        testID={testIDs.map.view}
        style={styles.fill}
        mapStyle={mapStyle}
        attribution={false}
        logo={false}
        onPress={onPress}
        onRegionDidChange={onCameraChanged && (({ nativeEvent: { center, zoom } }) => onCameraChanged(center, zoom))}
        onDidFinishLoadingStyle={() => setStyleLoaded(true)}
      >
        <Camera ref={cameraRef} testID={mapPartIDs.camera} {...limits} />
        <GeoJSONSource
          id="markers"
          testID={mapPartIDs.markers}
          data={data}
          onPress={(event) => {
            const id = event.nativeEvent.features[0]?.id;
            if (id === undefined) return;
            event.stopPropagation();
            onMarkerPress?.(String(id));
          }}
        >
          <Layer
            id="markers"
            type="circle"
            layout={{ 'circle-sort-key': ['case', ['get', 'selected'], 1, 0] }}
            paint={{
              'circle-radius': ['case', ['get', 'selected'], 11, 8],
              'circle-color': ['case', ['get', 'selected'], '#b3261e', '#0b6e4f'],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
        </GeoJSONSource>
        {showUserLocation && <NativeUserLocation testID={mapPartIDs.userLocation} />}
      </MapView>
      <MapAttribution />
    </View>
  );
}

function toStop(camera: MapCamera): CameraStop {
  if ('center' in camera) return { center: camera.center, zoom: camera.zoom, ...ANIMATION };
  const p = camera.paddingPx ?? 0;
  return { bounds: camera.bounds, padding: { top: p, right: p, bottom: p, left: p }, ...ANIMATION };
}

/** OSM_ATTRIBUTION, always visible (testIDs.map.attribution).
 * @public frozen stub (M1) */
export function MapAttribution(): ReactElement {
  return (
    <View pointerEvents="none" style={styles.attribution}>
      <Text testID={testIDs.map.attribution} style={styles.attributionText}>
        {OSM_ATTRIBUTION}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Bottom-end corner (left in RTL). #1f2328 on at least 85% white stays above 10:1 over any map colour. No numberOfLines:
  // at the largest font scales the legal text wraps instead of being ellipsised.
  attribution: { position: 'absolute', bottom: 0, end: 0, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderTopStartRadius: 4 },
  attributionText: { color: '#1f2328', fontSize: 12, writingDirection: 'ltr' },
});
