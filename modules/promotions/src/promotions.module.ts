/**
 * PromotionsModule — NestJS dynamic module for provider promotions.
 *
 * Usage in apps/api composition root:
 *
 *   promotionsModule({ db })
 *   promotionsModule({ db, providerSummary })
 *
 * The module owns the `promotions.*` Postgres schema.
 * It exposes no ports to other modules: other modules read promotions
 * either through the HTTP API or by firing domain events (not implemented in MVP).
 */
import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';

export const promotionsMigrationsDir = new URL('../migrations', import.meta.url).pathname;
import { PromotionsController, PROMOTIONS_SERVICE } from './promotions.controller';
import { PromotionsService, type ProviderSummaryPort } from './promotions.service';

export interface PromotionsModuleOptions {
  db: Db;
  /** If omitted, provider name shows as 'مزوّد' and verified = false. */
  providerSummary?: ProviderSummaryPort;
}

@Module({})
class PromotionsModule {}

export function promotionsModule(opts: PromotionsModuleOptions): DynamicModule {
  const svc = new PromotionsService(opts.db, opts.providerSummary);

  return {
    module: PromotionsModule,
    global: false,
    controllers: [PromotionsController],
    providers: [
      { provide: PROMOTIONS_SERVICE, useValue: svc },
    ],
    imports: [],
  };
}
