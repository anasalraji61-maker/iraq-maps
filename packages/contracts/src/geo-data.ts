import { z } from 'zod';
import { BBox, CityId, LngLat, Locale } from './common';

/** Shown on the map at all times and carried by every OSM-derived response and data artifact (CLAUDE.md rule 4).
 * @public frozen contract (M1) */
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/** MVP categories (the city config `categories`). The pipeline maps OSM tags onto them and drops POIs that fit none.
 * @public frozen contract (M1) */
export const PlaceCategory = z.enum([
  'food',
  'cafe',
  'lodging',
  'shopping',
  'tourism',
  'health',
  'finance',
  'fuel',
  'office',
  'worship',
  'education',
  'government',
  'transport',
  'entertainment',
]);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

/** place = POI, street = named highway, area = OSM place=suburb|quarter|neighbourhood.
 * @public frozen contract (M1) */
export const PlaceKind = z.enum(['place', 'street', 'area']);
export type PlaceKind = z.infer<typeof PlaceKind>;

const text = z.string().trim().min(1).max(255);
/** OSM `name` plus the optional `name:ar`, `name:ckb` and `name:en`.
 * @public frozen contract (M1) */
export const PlaceNames = z.object({ name: text, ar: text.optional(), ckb: text.optional(), en: text.optional() });
export type PlaceNames = z.infer<typeof PlaceNames>;

/** Label order for the map style and every list or card: name:<lang>, name:ar, name:ckb, then `name`.
 * @public frozen contract (M1) */
export const nameFallback = (lang: Locale): Locale[] => [...new Set<Locale>([lang, 'ar', 'ckb'])];
/** @public frozen contract (M1) */
export const pickName = (names: PlaceNames, lang: Locale): string => nameFallback(lang).map((l) => names[l]).find((n) => n !== undefined) ?? names.name;

/**
 * Vector tile schema. The Planetiler profile (geo-services/tiles) emits exactly these layers, and the style
 * (packages/map-kit) reads only these. Every feature has `class` (one of its layer's classes) and whichever
 * name fields the OSM element has. Exported to schemas/tile-schema.json for the Java profile.
 * @public frozen contract (M1)
 */
export const TileSchema = {
  minZoom: 0,
  maxZoom: 14,
  fields: ['class', 'name', 'name:ar', 'name:ckb', 'name:en'],
  layers: {
    transportation: { geometry: ['line'], classes: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'path'] },
    place: { geometry: ['point'], classes: ['city', 'town', 'village', 'suburb', 'quarter', 'neighbourhood'] },
    poi: { geometry: ['point'], classes: PlaceCategory.options },
    building: { geometry: ['polygon'], classes: ['building'] },
    water: { geometry: ['polygon', 'line'], classes: ['river', 'canal', 'lake'] },
    landuse: { geometry: ['polygon'], classes: ['residential', 'commercial', 'industrial', 'park', 'grass', 'cemetery', 'farmland'] },
    boundary: { geometry: ['line'], classes: ['country', 'province', 'district'] },
  },
} as const;

/**
 * Glyph PBFs built with fontnik from the registered Noto Sans Arabic font, which also covers basic Latin (ADR-0008).
 * MapLibre Native shapes Arabic into presentation forms, so those ranges are required too.
 * @public frozen contract (M1)
 */
export const Glyphs = {
  fontstack: 'Noto Sans Arabic Regular',
  requiredRanges: ['0-255', '1536-1791', '8192-8447', '64256-64511', '64512-64767', '64768-65023', '65024-65279'],
} as const;

/** One line of places.ndjson: written by the pipeline extract, read by the places import. OSM-derived only (ODbL).
 * JSON Schema export: schemas/place-import-record.schema.json.
 * @public frozen contract (M1) */
export const PlaceImportRecord = z.object({
  /** OSM element type letter and id, e.g. n2345, w67, r8. Becomes the PlaceId. */
  id: z.string().regex(/^[nwr][1-9]\d{0,14}$/),
  kind: PlaceKind,
  names: PlaceNames,
  /** null for streets and areas. */
  category: PlaceCategory.nullable(),
  /** The node, or a point on the way or area. */
  location: LngLat,
  tags: z.object({ opening_hours: text.optional(), phone: text.optional(), website: text.optional() }),
});
export type PlaceImportRecord = z.infer<typeof PlaceImportRecord>;

/** city.json: written by the pipeline extract from cities/<id>.yaml, read by the places import (the city registry).
 * JSON Schema export: schemas/city-import-record.schema.json.
 * @public frozen contract (M1) */
export const CityImportRecord = z.object({ id: CityId, names: z.object({ ar: text, ckb: text, en: text }), bbox: BBox, center: LngLat });
export type CityImportRecord = z.infer<typeof CityImportRecord>;

/**
 * Command-line contracts between geo-services, modules/places, tools/bench and .github/workflows/geo-data.yml.
 * Each CLI runs from its own package directory, so callers pass absolute paths.
 * @public frozen contract (M1)
 */
export const CliContracts = {
  pipelineExtract: {
    command: 'pnpm --filter @iraq-maps/geo-pipeline extract',
    args: { '--city': 'city id (geo-services/pipeline/cities/<id>.yaml)', '--input': 'OSM extract (.osm.pbf or .osm)', '--output': 'output directory' },
    outputs: ['<output>/<city>.osm.pbf: the extract clipped to the city', '<output>/places.ndjson: PlaceImportRecord lines', '<output>/city.json: CityImportRecord'],
  },
  tilesBuild: {
    command: 'pnpm --filter @iraq-maps/geo-tiles tiles build',
    args: {
      '--input': 'clipped .osm.pbf',
      '--output': '.pmtiles file',
      '--bbox': 'west,south,east,north (WGS84)',
      '--city': 'cities/<id>.yaml: the poi layer keeps only its categories (OsmCategoryCases), as places.ndjson does',
    },
    outputs: ['<output>: PMTiles v3 with exactly the TileSchema layers and fields, zooms minZoom..maxZoom'],
  },
  glyphsBuild: {
    command: 'pnpm --filter @iraq-maps/geo-tiles tiles glyphs',
    args: { '--output': 'output directory' },
    outputs: ['<output>/<Glyphs.fontstack>/<start>-<end>.pbf, at least Glyphs.requiredRanges'],
  },
  placesImport: {
    command: 'pnpm --filter @iraq-maps/places run import',
    args: { '--city': 'city.json', '--input': 'places.ndjson' },
    outputs: ['rows in schema places (DATABASE_URL); idempotent, re-running replaces the city rows'],
  },
  benchSearch: {
    command: 'pnpm --filter @iraq-maps/bench search',
    args: { '--api': 'API base URL', '--city': 'city id', '--input': 'places.ndjson to sample query names from', '--count': 'queries (default 200)', '--budget-ms': 'p95 budget (default 800)' },
    outputs: [
      'stdout: JSON { city, count, errors, p50Ms, p95Ms, maxMs }, latency of /v1/search against an API in the same job (callers that parse it run `pnpm -s`, which keeps the pnpm banner off stdout)',
      'a Markdown table appended to $GITHUB_STEP_SUMMARY when set',
      'exit code 1 when p95Ms is at or above the budget, or errors > 0',
    ],
  },
} as const;
