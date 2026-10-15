import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import type { Db } from '@iraq-maps/db-kit';
import { LocationShareController } from './location-share.controller';
import { LocationShareService } from './location-share.service';
import { LOCATION_SHARE_SERVICE } from './location-share.controller';

export function locationShareModule(opts: { db: Db }): DynamicModule {
  return {
    module: LocationShareModuleRoot,
    controllers: [LocationShareController],
    providers: [
      {
        provide: LOCATION_SHARE_SERVICE,
        useValue: new LocationShareService(opts.db),
      },
    ],
  };
}

export const locationShareMigrationsDir = new URL('../migrations', import.meta.url).pathname;

@Module({})
class LocationShareModuleRoot {}
