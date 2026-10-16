export const reputationMigrationsDir = new URL('../migrations', import.meta.url).pathname;

import type { Db } from '@iraq-maps/db-kit';
import type { EventBus } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

export interface ReputationModuleOptions {
  db: Db;
  eventBus?: EventBus;
}

class NoopEventBus implements EventBus {
  async publish() {}
  subscribe() {
    return () => {};
  }
}

@Module({})
class ReputationModule {}

/**
 * Nest dynamic module serving reputationContract routes.
 * @public
 */
export function reputationModule(opts: ReputationModuleOptions): DynamicModule {
  return {
    module: ReputationModule,
    global: true,
    controllers: [ReputationController],
    providers: [
      { provide: 'REPUTATION_DB', useValue: opts.db },
      {
        provide: PortTokens.EventBus,
        useValue: opts.eventBus ?? new NoopEventBus(),
      },
      ReputationService,
    ],
    exports: [ReputationService],
  };
}
