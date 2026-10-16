import { fileURLToPath } from 'node:url';

export { challengesModule } from './challenges.module';
export type { ChallengesModuleOptions } from './challenges.module';
export { ChallengesService } from './challenges.service';

/** Absolute path to this module's migrations (schema `challenges`). @public */
export const challengesMigrationsDir = fileURLToPath(
  new URL('../migrations', import.meta.url),
);
