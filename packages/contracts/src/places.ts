import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, LngLat, Locale, PlaceId, Problem } from './common';
import { CityImportRecord, PlaceCategory, PlaceKind, PlaceNames, TileSchema } from './geo-data';
import { SatelliteLayer } from './imagery';
import { PlaceProviderSection } from './providers';

const c = initContract();

/** `near` query parameter: "lng,lat". */
const near = z
  .string()
  .regex(/^-?\d{1,3}(\.\d{1,15})?,-?\d{1,2}(\.\d{1,15})?$/)
  .transform((s) => s.split(',').map(Number))
  .pipe(LngLat);
const limit = z.coerce.number().int().min(1).max(50).default(20);

/** @public frozen contract (M1) */
export const SearchQuery = z.object({
  q: z.string().trim().min(1).max(100).regex(/^[^\p{Cc}]*$/u),
  city: CityId,
  near: near.optional(),
  lang: Locale.default('ar'),
  limit,
});
export type SearchQuery = z.infer<typeof SearchQuery>;

/** POIs (kind place) within radiusM of `near`, nearest first.
 * @public frozen contract (M1) */
export const NearbyQuery = z.object({
  city: CityId,
  near,
  radiusM: z.coerce.number().int().min(50).max(5000).default(1000),
  category: PlaceCategory.optional(),
  limit,
});
export type NearbyQuery = z.infer<typeof NearbyQuery>;

/** @public frozen contract (M1) */
export const PlaceSummary = z.object({
  id: PlaceId,
  kind: PlaceKind,
  names: PlaceNames,
  /** null for streets and areas. */
  category: PlaceCategory.nullable(),
  /** The neighbourhood the place lies in, when known. */
  area: PlaceNames.nullable(),
  location: LngLat,
  /** Metres from `near`; null when the query had no `near`. */
  distanceM: z.number().nonnegative().nullable(),
});
export type PlaceSummary = z.infer<typeof PlaceSummary>;

/** Ranked by name similarity, proximity to `near` and kind. Also the body of /v1/places/nearby.
 * @public frozen contract (M1) */
export const SearchResult = z.object({ items: z.array(PlaceSummary) });
export type SearchResult = z.infer<typeof SearchResult>;

/** @public frozen contract (M1) */
export const PlaceDetails = PlaceSummary.omit({ distanceM: true }).extend({
  /** OSM opening_hours verbatim; the client evaluates "open now". */
  hoursRaw: z.string().max(255).nullable(),
  /** Public OSM tags of an unclaimed place, shown with a "From OpenStreetMap" badge (M1 default). */
  osmContacts: z.object({
    phone: z.string().max(64).optional(),
    website: z.string().max(255).url().regex(/^https?:\/\//).optional(),
  }),
  source: z.literal('osm'),
  attribution: z.string(),
  /** M3: a verified provider's consent-filtered section, read per request (ProviderProfilePort). */
  provider: PlaceProviderSection.optional(),
});
export type PlaceDetails = z.infer<typeof PlaceDetails>;

/** Root-relative URLs (`/v1/...`) are resolved by the client against its API base URL. */
const origin = '(https?://[^/\\s]+)?';
/** @public frozen contract (M1) */
export const CityDescriptor = CityImportRecord.extend({
  /** `pmtiles://https://...`, or an XYZ template with {z}/{x}/{y} such as the server fallback route. */
  tilesUrl: z
    .string()
    .max(512)
    .regex(new RegExp(`^(pmtiles://https?://\\S+|${origin}/\\S*\\{z\\}/\\{x\\}/\\{y\\}\\S*)$`)),
  /** Template ending in {fontstack}/{range}.pbf. */
  glyphsUrl: z
    .string()
    .max(512)
    .regex(new RegExp(`^${origin}/\\S*\\{fontstack\\}/\\{range\\}\\.pbf$`)),
  attribution: z.string(),
  /** M2: the optional Sentinel-2 layer. */
  satellite: SatelliteLayer.optional(),
});
export type CityDescriptor = z.infer<typeof CityDescriptor>;

const binary = (contentType: string) => c.otherResponse({ contentType, body: c.type<Uint8Array>() });
const tileCoord = z.coerce.number().int().min(0);

/** @public frozen contract (M1), served by modules/places */
export const citiesContract = c.router(
  {
    list: { method: 'GET', path: '/cities', responses: { 200: z.object({ items: z.array(CityDescriptor) }) } },
    /** Fallback tile server over the city's PMTiles (TILES_SOURCE). 204: no tile at this address. */
    tile: {
      method: 'GET',
      path: '/cities/:id/tiles/:z/:x/:y',
      pathParams: z
        .object({ id: CityId, z: tileCoord.max(TileSchema.maxZoom), x: tileCoord, y: tileCoord })
        .refine((p) => p.x < 2 ** p.z && p.y < 2 ** p.z, 'tile outside its zoom level'),
      responses: { 200: binary('application/vnd.mapbox-vector-tile'), 204: c.noBody(), 400: Problem, 404: Problem },
    },
    /** Fallback glyph server (GLYPHS_SOURCE). `range` is "<start>-<start+255>.pbf". */
    glyphs: {
      method: 'GET',
      path: '/cities/:id/glyphs/:fontstack/:range',
      pathParams: z.object({
        id: CityId,
        fontstack: z.string().regex(/^[A-Za-z0-9 ,_-]{1,128}$/),
        range: z
          .string()
          .regex(/^\d{1,5}-\d{1,5}\.pbf$/)
          .refine((r) => {
            const [start = -1, end = -1] = r.slice(0, -4).split('-').map(Number);
            return start % 256 === 0 && end === start + 255 && end <= 65535;
          }, 'not a glyph range'),
      }),
      responses: { 200: binary('application/x-protobuf'), 400: Problem, 404: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** @public frozen contract (M1), served by modules/places */
export const placesContract = c.router(
  {
    search: { method: 'GET', path: '/search', query: SearchQuery, responses: { 200: SearchResult, 400: Problem, 429: Problem } },
    nearby: { method: 'GET', path: '/places/nearby', query: NearbyQuery, responses: { 200: SearchResult, 400: Problem, 429: Problem } },
    get: {
      method: 'GET',
      path: '/places/:id',
      pathParams: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).pipe(PlaceId) }),
      responses: { 200: PlaceDetails, 400: Problem, 404: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);
