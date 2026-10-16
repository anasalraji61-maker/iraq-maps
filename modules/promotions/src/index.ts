import { fileURLToPath } from 'node:url';

export { promotionsModule } from './promotions.module';
export type { PromotionsModuleOptions } from './promotions.module';
export { PromotionsService } from './promotions.service';
export type { ProviderSummaryPort } from './promotions.service';

/** Absolute path to this module's migrations (schema `promotions`). @public */
export const promotionsMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
