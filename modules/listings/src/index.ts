import { fileURLToPath } from 'node:url';

export { listingsModule } from './listings.module';
export type { ListingsModuleOptions } from './listings.module';
export { ListingsService } from './listings.service';
export type { MediaSigningPort, ProviderSummaryPort } from './listings.service';

/** Absolute path to this module's migrations (schema `listings`). @public */
export const listingsMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
