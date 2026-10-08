// M2 contracts: the Sentinel-2 satellite layer.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, Problem } from './common';

const c = initContract();

/** `CityDescriptor.satellite`: an optional general-view layer. The app always shows its 10 m disclaimer and its
 * attribution next to the OSM one.
 * @public frozen contract (M2) */
export const SatelliteLayer = z.object({
  /** `pmtiles://https://...`, or a raster XYZ template with {z}/{x}/{y}; root-relative resolves against the API base URL. */
  url: z
    .string()
    .max(512)
    .regex(/^(pmtiles:\/\/https?:\/\/\S+|(https?:\/\/[^/\s]+)?\/\S*\{z\}\/\{x\}\/\{y\}\S*)$/),
  /** e.g. "Contains modified Copernicus Sentinel data 2026". */
  attribution: z.string().min(1).max(300),
  resolutionM: z.number().positive(),
  /** Capture date of the scene, YYYY-MM-DD. */
  capturedAt: z.string().date(),
});
export type SatelliteLayer = z.infer<typeof SatelliteLayer>;

const tileCoord = z.coerce.number().int().min(0);

/** Fallback raster tile server over the city's satellite PMTiles (IMAGERY_URL). 204: no tile at this address.
 * @public frozen contract (M2), served by modules/places */
export const imageryContract = c.router(
  {
    tile: {
      method: 'GET',
      path: '/cities/:id/satellite/:z/:x/:y',
      pathParams: z
        .object({ id: CityId, z: tileCoord.max(14), x: tileCoord, y: tileCoord })
        .refine((p) => p.x < 2 ** p.z && p.y < 2 ** p.z, 'tile outside its zoom level'),
      responses: { 200: c.otherResponse({ contentType: 'image/webp', body: c.type<Uint8Array>() }), 204: c.noBody(), 400: Problem, 404: Problem },
    },
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** @public frozen contract (M2) */
export const satelliteTestIDs = { toggle: 'map.satellite', disclaimer: 'map.satellite.disclaimer', attribution: 'map.satellite.attribution' } as const;

/**
 * geo-services/imagery CLI (imagery.yml). Lists Sentinel-2 L2A TCI COGs straight from the public sentinel-cogs bucket by
 * MGRS tile (Earth Search STAC is blocked), keeps the least cloudy scene and clips it to the city.
 * @public frozen contract (M2)
 */
export const ImageryCliContracts = {
  imageryBuild: {
    command: 'pnpm --filter @iraq-maps/geo-imagery run build',
    args: { '--city': 'city id (geo-services/pipeline/cities/<id>.yaml)', '--output': 'output directory (absolute)', '--max-cloud': 'cloud cover percent (default 20)' },
    outputs: [
      '<output>/<city>-satellite.pmtiles: raster webp tiles, z10 to z14, clipped to the city bbox; its JSON metadata holds attribution, resolutionM and capturedAt (SatelliteLayer)',
      '<output>/ATTRIBUTION.txt',
    ],
  },
} as const;
