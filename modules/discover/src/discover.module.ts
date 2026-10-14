import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

export interface DiscoverModuleOptions {
  db: Db;
}

@Module({})
class DiscoverModule {}

/** Nest dynamic module serving discoverContract routes.
 * @public */
export function discoverModule(opts: DiscoverModuleOptions): DynamicModule {
  return {
    module: DiscoverModule,
    global: true,
    controllers: [DiscoverController],
    providers: [
      { provide: 'DISCOVER_DB', useValue: opts.db },
      DiscoverService,
    ],
    exports: [DiscoverService],
  };
}
