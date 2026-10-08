import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineModuleConfig } from '@iraq-maps/config';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { createLogger } from '@iraq-maps/observability';
import { Module, type DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { INTERNALS, PlacesController, RateLimiter, SEARCH_PER_MINUTE } from './http';
import { PgPlaces } from './query';
import { TileFiles } from './tiles';

/** For the import CLI, the e2e harness and geo-data.yml jobs (CliContracts.placesImport).
 * @public */
export { importCity, importFiles } from './import';

/** @public frozen stub (M1) */
export interface PlacesModuleOptions {
  db: Db;
  /** TILES_SOURCE and GLYPHS_SOURCE (see .env.example); defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/** Absolute path of this module's migrations (schema `places`).
 * @public frozen stub (M1) */
export const placesMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

/** An absolute local path, or an http(s) URL, optionally with `{city}`. */
const source = z
  .string()
  .refine((s) => isAbsolute(s) || /^https?:\/\/\S+$/.test(s))
  .optional();

@Module({})
class PlacesModule {}

/** Nest module serving citiesContract and placesContract, and providing PortTokens.PlacesQueryPort.
 * @public frozen stub (M1) */
export function placesModule(opts: PlacesModuleOptions): DynamicModule {
  const config = defineModuleConfig('places', { TILES_SOURCE: source, GLYPHS_SOURCE: source }, { env: opts.env });
  const places = new PgPlaces(opts.db);
  const tiles = new TileFiles(config, createLogger({ name: 'places' }));
  return {
    module: PlacesModule,
    global: true,
    controllers: [PlacesController],
    providers: [
      { provide: INTERNALS, useValue: { places, tiles, limiter: new RateLimiter(SEARCH_PER_MINUTE) } },
      { provide: PortTokens.PlacesQueryPort, useValue: places },
    ],
    exports: [PortTokens.PlacesQueryPort],
  };
}
