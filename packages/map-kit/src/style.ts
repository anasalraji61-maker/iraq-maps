import { Glyphs, nameFallback, OSM_ATTRIBUTION, TileSchema, type CityDescriptor, type Locale } from '@iraq-maps/contracts';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

/** Absolute tile and glyph URLs for one city.
 * @public frozen stub (M1) */
export interface StyleSource {
  /** `pmtiles://https://...` or an XYZ template with {z}/{x}/{y}. */
  tilesUrl: string;
  /** Template ending in {fontstack}/{range}.pbf. */
  glyphsUrl: string;
}

// Same joining rule as @iraq-maps/api-client (base + '/v1/...'); new URL() would percent-encode the {z} placeholders.
const absolute = (url: string, apiBaseUrl: string) => (url.startsWith('/') ? apiBaseUrl.replace(/\/+$/, '') + url : url);

/** Resolves the descriptor's root-relative URLs against the API base URL.
 * @public frozen stub (M1) */
export function resolveSource(city: CityDescriptor, apiBaseUrl: string): StyleSource {
  return { tilesUrl: absolute(city.tilesUrl, apiBaseUrl), glyphsUrl: absolute(city.glyphsUrl, apiBaseUrl) };
}

type SchemaLayer = keyof typeof TileSchema.layers;
type ClassOf<L extends SchemaLayer> = (typeof TileSchema.layers)[L]['classes'][number];

const expr = (...parts: unknown[]) => parts as ExpressionSpecification;
const SOURCE = 'city';
const from = (layer: SchemaLayer) => ({ source: SOURCE, 'source-layer': layer });

/** A match over every class of the layer, in TileSchema order. Every feature has one of them, so the fallback (the
 * last class) is never reached. */
const byClass = <L extends SchemaLayer>(layer: L, value: (c: ClassOf<L>) => string | number) => {
  const classes = TileSchema.layers[layer].classes as readonly ClassOf<L>[];
  return expr('match', ['get', 'class'], ...classes.flatMap((c) => [c, value(c)]), value(classes[classes.length - 1] as ClassOf<L>));
};

/** Zoom-interpolated width: `scale` times a per-feature `base` width (MapLibre allows zoom only at the top level). */
const zoomWidth = (base: ExpressionSpecification | number, scale: number) =>
  expr('interpolate', ['exponential', 1.5], ['zoom'], 10, ['*', 1.5 * scale, base], 14, ['*', 5 * scale, base], 18, ['*', 24 * scale, base]);

const LANDUSE: Record<ClassOf<'landuse'>, string> = {
  residential: '#ece7dd',
  commercial: '#f3e3df',
  industrial: '#e9e2ec',
  park: '#cde6c0',
  grass: '#d9ecca',
  cemetery: '#d3dccb',
  farmland: '#eef1d6',
};
const ROADS: Record<ClassOf<'transportation'>, { width: number; color: string }> = {
  motorway: { width: 1, color: '#e8a24a' },
  trunk: { width: 1, color: '#f0b85f' },
  primary: { width: 0.9, color: '#f6d28c' },
  secondary: { width: 0.8, color: '#fbe7b5' },
  tertiary: { width: 0.7, color: '#ffffff' },
  minor: { width: 0.55, color: '#ffffff' },
  service: { width: 0.4, color: '#ffffff' },
  path: { width: 0.25, color: '#b8ad9a' },
};
const PLACE_TEXT_SIZE: Record<ClassOf<'place'>, number> = { city: 18, town: 16, village: 14, suburb: 14, quarter: 13, neighbourhood: 12 };
const WATER = '#a9cfe8';
const ROUND = { 'line-cap': 'round', 'line-join': 'round' } as const;
const roadWidth = byClass('transportation', (c) => ROADS[c].width);
const placeSize = byClass('place', (c) => PLACE_TEXT_SIZE[c]);
// Near-black text on a near-opaque white halo: above 12:1 against the halo, whatever map colour lies underneath.
const LABEL_PAINT = { 'text-color': '#1f2328', 'text-halo-color': 'rgba(255, 255, 255, 0.92)', 'text-halo-width': 1.5 };

/** One template for every locale: layers from TileSchema, labels coalesce(nameFallback(lang)..., name), fontstack Glyphs.fontstack.
 * @public frozen stub (M1) */
export function buildStyle(lang: Locale, { tilesUrl, glyphsUrl }: StyleSource): StyleSpecification {
  const label = (size: ExpressionSpecification | number) => ({
    'text-field': expr('coalesce', ...nameFallback(lang).map((l) => ['get', `name:${l}`]), ['get', 'name']),
    'text-font': [Glyphs.fontstack],
    'text-size': size,
    'text-max-width': 8,
  });
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': '#f4f1ea' } },
    { id: 'landuse', type: 'fill', ...from('landuse'), paint: { 'fill-color': byClass('landuse', (c) => LANDUSE[c]) } },
    { id: 'water', type: 'fill', ...from('water'), filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': WATER } },
    { id: 'waterway', type: 'line', ...from('water'), filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': WATER, 'line-width': zoomWidth(1, 1) } },
    { id: 'building', type: 'fill', ...from('building'), minzoom: 13, paint: { 'fill-color': '#e0d9ce', 'fill-outline-color': '#cbc2b4' } },
    { id: 'road-casing', type: 'line', ...from('transportation'), layout: ROUND, paint: { 'line-color': '#cdc4b5', 'line-width': zoomWidth(roadWidth, 1.3) } },
    { id: 'road', type: 'line', ...from('transportation'), layout: ROUND, paint: { 'line-color': byClass('transportation', (c) => ROADS[c].color), 'line-width': zoomWidth(roadWidth, 1) } },
    { id: 'boundary', type: 'line', ...from('boundary'), paint: { 'line-color': '#9b8bb0', 'line-width': 1.2, 'line-dasharray': [3, 2] } },
    { id: 'road-label', type: 'symbol', ...from('transportation'), minzoom: 13, layout: { ...label(12), 'symbol-placement': 'line' }, paint: LABEL_PAINT },
    { id: 'poi-dot', type: 'circle', ...from('poi'), minzoom: 15, paint: { 'circle-radius': 3, 'circle-color': '#8a6d4b', 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } },
    { id: 'poi-label', type: 'symbol', ...from('poi'), minzoom: 15, layout: { ...label(12), 'text-anchor': 'top', 'text-offset': [0, 0.5] }, paint: LABEL_PAINT },
    { id: 'place-label', type: 'symbol', ...from('place'), layout: { ...label(placeSize), 'symbol-sort-key': ['-', 0, placeSize] }, paint: LABEL_PAINT },
  ];
  return {
    version: 8,
    glyphs: glyphsUrl,
    sources: {
      [SOURCE]: tilesUrl.startsWith('pmtiles://')
        ? { type: 'vector', url: tilesUrl, attribution: OSM_ATTRIBUTION }
        : { type: 'vector', tiles: [tilesUrl], minzoom: TileSchema.minZoom, maxzoom: TileSchema.maxZoom, attribution: OSM_ATTRIBUTION },
    },
    layers,
  };
}
