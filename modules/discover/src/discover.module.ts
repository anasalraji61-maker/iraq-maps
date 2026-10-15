import type { Db } from '@iraq-maps/db-kit';
import type { EventBus, ProviderDirectoryPort } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AdminDiscoverController, DiscoverController, StoriesController } from './discover.controller';
import { DiscoverService } from './discover.service';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SlidingWindowRateLimiter } from './rate-limiter';

export interface DiscoverModuleOptions {
  db: Db;
  eventBus?: EventBus;
  redis?: Redis;
  /** Optional: when provided, posts are enriched with authorVerified. @M93 */
  providerDirectory?: ProviderDirectoryPort;
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
  // 10 posts per minute, 20 reports per hour, 20 comments per hour, 50 messages per day
  const postLimiter = opts.redis ? new SlidingWindowRateLimiter(opts.redis, 10, 60) : null;
  const reportLimiter = opts.redis ? new SlidingWindowRateLimiter(opts.redis, 20, 3600) : null;
  const commentLimiter = opts.redis ? new SlidingWindowRateLimiter(opts.redis, 20, 3600) : null;
  const messageLimiter = opts.redis ? new SlidingWindowRateLimiter(opts.redis, 50, 86400) : null;

  return {
    module: DiscoverModule,
    global: true,
    controllers: [DiscoverController, AdminDiscoverController, StoriesController, SocialController],
    providers: [
      { provide: 'DISCOVER_DB', useValue: opts.db },
      { provide: PortTokens.EventBus, useValue: opts.eventBus ?? new NoopEventBus() },
      { provide: 'DISCOVER_POST_RATE_LIMITER', useValue: postLimiter },
      { provide: 'DISCOVER_REPORT_RATE_LIMITER', useValue: reportLimiter },
      { provide: 'DISCOVER_COMMENT_RATE_LIMITER', useValue: commentLimiter },
      { provide: 'DISCOVER_MESSAGE_RATE_LIMITER', useValue: messageLimiter },
      { provide: PortTokens.ProviderDirectoryPort, useValue: opts.providerDirectory ?? null },
      { provide: 'DISCOVER_REDIS', useValue: opts.redis ?? null },
      DiscoverService,
      SocialService,
    ],
    exports: [DiscoverService, SocialService],
  };
}
