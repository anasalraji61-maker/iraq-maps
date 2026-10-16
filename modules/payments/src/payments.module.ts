import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

export interface PaymentsModuleOptions {
  db: Db;
}

@Module({})
class PaymentsModule {}

/** Nest dynamic module serving paymentsContract routes.
 * @public */
export function paymentsModule(opts: PaymentsModuleOptions): DynamicModule {
  return {
    module: PaymentsModule,
    global: false,
    controllers: [PaymentsController],
    providers: [
      { provide: 'PAYMENTS_DB', useValue: opts.db },
      PaymentsService,
    ],
    exports: [PaymentsService],
  };
}

export const paymentsMigrationsDir = new URL('../migrations', import.meta.url).pathname;
