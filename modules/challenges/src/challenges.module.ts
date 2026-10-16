import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';

export const challengesMigrationsDir = new URL('../migrations', import.meta.url).pathname;
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';

export interface ChallengesModuleOptions {
  db: Db;
}

@Module({})
class ChallengesModule {}

/**
 * Nest dynamic module serving challengesV2Contract and adminChallengesV2Contract routes.
 * @public
 */
export function challengesModule(opts: ChallengesModuleOptions): DynamicModule {
  return {
    module: ChallengesModule,
    global: true,
    controllers: [ChallengesController],
    providers: [
      { provide: 'CHALLENGES_DB', useValue: opts.db },
      ChallengesService,
    ],
    exports: [ChallengesService],
  };
}
