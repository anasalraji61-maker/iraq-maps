import { fileURLToPath } from 'node:url';

export { discoverModule } from './discover.module';
export { SocialService } from './social.service';

/** Absolute path to this module's migrations (schema `discover`). @public */
export const discoverMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
