import type { Db } from '@iraq-maps/db-kit';
import type { EventBus } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import { Module, type DynamicModule } from '@nestjs/common';
import { SocialGraphController } from './social.controller';
import { SocialGraphService, type UserInfoPort } from './social.service';

export interface SocialModuleOptions {
  db: Db;
  eventBus?: EventBus;
  /**
   * Optional port for resolving user display info (displayName, avatarUrl, bio,
   * isVerifiedProvider, postCount). When absent the service falls back to stub values,
   * which is suitable for tests and isolated development.
   */
  userInfo?: UserInfoPort;
}

class NoopEventBus implements EventBus {
  async publish() {}
  subscribe() { return () => {}; }
}

@Module({})
class SocialModule {}

/**
 * Nest dynamic module serving socialGraphContract routes.
 * Mount this alongside DiscoverModule in apps/api.
 * @public
 */
export function socialModule(opts: SocialModuleOptions): DynamicModule {
  return {
    module: SocialModule,
    global: false,
    controllers: [SocialGraphController],
    providers: [
      { provide: 'SOCIAL_DB', useValue: opts.db },
      { provide: PortTokens.EventBus, useValue: opts.eventBus ?? new NoopEventBus() },
      { provide: 'SOCIAL_USER_INFO', useValue: opts.userInfo ?? null },
      SocialGraphService,
    ],
    exports: [SocialGraphService],
  };
}

export const socialMigrationsDir = new URL('../migrations', import.meta.url).pathname;
