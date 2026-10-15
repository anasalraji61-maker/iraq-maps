import type { Db } from '@iraq-maps/db-kit';
import type { EventBus } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AdminDiscoverController, DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';
import { SlidingWindowRateLimiter } from './rate-limiter';

export interface DiscoverModuleOptions {
  db: Db;
  eventBus?: EventBus;
  redis?: Redis;
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
  // 10 posts per minute, 20 reports per hour
  const postLimiter = opts.redis ? new SlidingWindowRateLimiter(opts.redis, 10, 60) : null;
  const reportLimiter = opts.redis ? new SlidingWindowRateLimiter(opts.redis, 20, 3600) : null;

  return {
    module: DiscoverModule,
    global: true,
    controllers: [DiscoverController, AdminDiscoverController],
    providers: [
      { provide: 'DISCOVER_DB', useValue: opts.db },
      { provide: PortTokens.EventBus, useValue: opts.eventBus ?? new NoopEventBus() },
      { provide: 'DISCOVER_POST_RATE_LIMITER', useValue: postLimiter },
      { provide: 'DISCOVER_REPORT_RATE_LIMITER', useValue: reportLimiter },
      DiscoverService,
    ],
    exports: [DiscoverService],
  };
}
