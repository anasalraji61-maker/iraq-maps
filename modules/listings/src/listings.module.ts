/**
 * ListingsModule — NestJS dynamic module for the marketplace.
 *
 * Usage in apps/api composition root:
 *
 *   listingsModule({ db, media, providerSummary })
 *
 * The module is self-contained: it owns the `listings.*` Postgres schema and
 * exposes no ports to other modules (it's a leaf). If another module needs
 * listing data it should read via the HTTP API or we'll add a port later.
 */

import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { ListingsController, LISTINGS_SERVICE } from './listings.controller';
import { ListingsService, type MediaSigningPort, type ProviderSummaryPort } from './listings.service';

export interface ListingsModuleOptions {
  db: Db;
  /** If omitted, photo URLs are not signed (assets become null). */
  media?: MediaSigningPort;
  /** If omitted, provider name shows as 'مزوّد' and verified = false. */
  providerSummary?: ProviderSummaryPort;
}

@Module({})
class ListingsModule {}

export function listingsModule(opts: ListingsModuleOptions): DynamicModule {
  const svc = new ListingsService(opts.db, opts.media, opts.providerSummary);

  return {
    module: ListingsModule,
    global: false,
    controllers: [ListingsController],
    providers: [
      { provide: LISTINGS_SERVICE, useValue: svc },
    ],
    imports: [],
  };
}
