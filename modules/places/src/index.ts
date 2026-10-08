import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineModuleConfig } from '@iraq-maps/config';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { createLogger } from '@iraq-maps/observability';
import { Module, type DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { INTERNALS, PlacesController, RateLimiter, SEARCH_PER_MINUTE, TILES_PER_MINUTE } from './http';
import { PgPlaces } from './query';
import { TileFiles } from './tiles';

/** @public frozen stub (M1) */
export interface PlacesModuleOptions {
  db: Db;
  /** TILES_SOURCE and GLYPHS_SOURCE (see .env.example); defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/** Absolute path of this module's migrations (schema `places`).
 * @public frozen stub (M1) */
export const placesMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

/** An absolute local path, or an http(s) URL with no `user:pass@` (clients get it), optionally with `{city}`. */
const source = z
  .string()
  .refine((s) => isAbsolute(s) || /^https?:\/\/[^/@\s]+(\/\S*)?$/.test(s))
  .optional();
const SOURCES = ['TILES_SOURCE', 'GLYPHS_SOURCE'] as const;

@Module({})
class PlacesModule {}

/** Nest module serving citiesContract and placesContract, and providing PortTokens.PlacesQueryPort.
 * @public frozen stub (M1) */
export function placesModule(opts: PlacesModuleOptions): DynamicModule {
  const config = defineModuleConfig('places', { TILES_SOURCE: source, GLYPHS_SOURCE: source }, { env: opts.env });
  const plainHttp = SOURCES.filter((name) => config[name]?.startsWith('http://'));
  if (config.appEnv === 'production' && plainHttp.length) throw new Error(`places config: values not allowed in production for env vars: ${plainHttp.join(', ')}`);
  const places = new PgPlaces(opts.db);
  const tiles = new TileFiles(config, createLogger({ name: 'places' }));
  return {
    module: PlacesModule,
    global: true,
    controllers: [PlacesController],
    providers: [
      { provide: INTERNALS, useValue: { places, tiles, limiter: new RateLimiter(SEARCH_PER_MINUTE), tileLimiter: new RateLimiter(TILES_PER_MINUTE) } },
      { provide: PortTokens.PlacesQueryPort, useValue: places },
    ],
    exports: [PortTokens.PlacesQueryPort],
  };
}
