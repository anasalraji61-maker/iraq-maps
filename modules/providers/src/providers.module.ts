import { fileURLToPath } from 'node:url';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { AdminProvidersController, ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

export interface ProvidersModuleOptions {
  db: Db;
  /** Injected PhoneVerificationPort implementation. */
  phoneVerification: unknown;
}

/** Absolute path of this module's migrations (schema `providers`).
 * @public */
export const providersMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

@Module({})
class ProvidersModule {}

/** Nest module serving providersContract and adminProvidersContract, and providing PortTokens.ProviderProfilePort.
 * @public */
export function providersModule(opts: ProvidersModuleOptions): DynamicModule {
  return {
    module: ProvidersModule,
    global: true,
    controllers: [ProvidersController, AdminProvidersController],
    providers: [
      { provide: 'PROVIDERS_DB', useValue: opts.db },
      { provide: PortTokens.PhoneVerificationPort, useValue: opts.phoneVerification },
      ProvidersService,
    ],
    exports: [ProvidersService],
  };
}
