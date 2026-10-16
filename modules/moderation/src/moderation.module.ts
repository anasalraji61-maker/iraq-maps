import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

export interface ModerationModuleOptions {
  db: Db;
  redis?: Redis;
}

@Module({})
class ModerationModule {}

/** Nest dynamic module for content moderation.
 * @public */
export function moderationModule(opts: ModerationModuleOptions): DynamicModule {
  return {
    module: ModerationModule,
    global: false,
    controllers: [ModerationController],
    providers: [
      { provide: 'MODERATION_DB', useValue: opts.db },
      { provide: 'MODERATION_REDIS', useValue: opts.redis ?? null },
      ModerationService,
    ],
    exports: [ModerationService],
  };
}
