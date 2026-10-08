// Frozen M1 signatures; builder-places implements them (mirrors modules/identity).
import { fileURLToPath } from 'node:url';
import type { Db } from '@iraq-maps/db-kit';
import type { DynamicModule } from '@nestjs/common';

/** @public frozen stub (M1) */
export interface PlacesModuleOptions {
  db: Db;
  /** TILES_SOURCE and GLYPHS_SOURCE (see .env.example); defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/** Absolute path of this module's migrations (schema `places`).
 * @public frozen stub (M1) */
export const placesMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

/** Nest module serving citiesContract and placesContract, and providing PortTokens.PlacesQueryPort.
 * @public frozen stub (M1) */
export function placesModule(_opts: PlacesModuleOptions): DynamicModule {
  throw new Error('not implemented');
}
