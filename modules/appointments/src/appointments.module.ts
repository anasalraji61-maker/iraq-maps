import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

export interface AppointmentsModuleOptions {
  db: Db;
}

@Module({})
class AppointmentsModule {}

/** Nest dynamic module serving appointmentsContract routes.
 * @public */
export function appointmentsModule(opts: AppointmentsModuleOptions): DynamicModule {
  return {
    module: AppointmentsModule,
    global: false,
    controllers: [AppointmentsController],
    providers: [
      { provide: 'APPOINTMENTS_DB', useValue: opts.db },
      AppointmentsService,
    ],
    exports: [AppointmentsService],
  };
}

export const appointmentsMigrationsDir = new URL('../migrations', import.meta.url).pathname;
