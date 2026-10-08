// Frozen M1 signatures; builder-map-kit implements them (and a Jest mock of the native map).
import type { BBox, CityDescriptor, LngLat, Locale } from '@iraq-maps/contracts';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { MapProps } from '@maplibre/maplibre-react-native';
import type { ReactElement } from 'react';

const notImplemented = (): never => {
  throw new Error('not implemented');
};

/** Absolute tile and glyph URLs for one city.
 * @public frozen stub (M1) */
export interface StyleSource {
  /** `pmtiles://https://...` or an XYZ template with {z}/{x}/{y}. */
  tilesUrl: string;
  /** Template ending in {fontstack}/{range}.pbf. */
  glyphsUrl: string;
}

/** Resolves the descriptor's root-relative URLs against the API base URL.
 * @public frozen stub (M1) */
export function resolveSource(_city: CityDescriptor, _apiBaseUrl: string): StyleSource {
  return notImplemented();
}

/** One template for every locale: layers from TileSchema, labels coalesce(nameFallback(lang)..., name), fontstack Glyphs.fontstack.
 * @public frozen stub (M1) */
export function buildStyle(_lang: Locale, _source: StyleSource): StyleSpecification {
  return notImplemented();
}

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
}

/** MapLibre Native map (testIDs.map.view) that always renders MapAttribution; there is no prop to hide it.
 * @public frozen stub (M1) */
export function MapCanvas(_props: MapCanvasProps): ReactElement {
  return notImplemented();
}

/** OSM_ATTRIBUTION, always visible (testIDs.map.attribution).
 * @public frozen stub (M1) */
export function MapAttribution(): ReactElement {
  return notImplemented();
}
