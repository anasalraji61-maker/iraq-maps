import type { Db } from '@iraq-maps/db-kit';
import type { EventBus } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

export interface DiscoverModuleOptions {
  db: Db;
  eventBus?: EventBus;
}

class NoopEventBus implements EventBus {
  async publish() {}
  subscribe() { return () => {}; }
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
      { provide: PortTokens.EventBus, useValue: opts.eventBus ?? new NoopEventBus() },
      DiscoverService,
    ],
    exports: [DiscoverService],
  };
}
