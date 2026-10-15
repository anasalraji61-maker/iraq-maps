import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { INCIDENTS_SERVICE, IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

export interface IncidentsModuleOptions {
  db: Db;
}

@Module({})
class IncidentsModuleClass {}

/** Nest module serving incidentsContract. */
export function incidentsModule(opts: IncidentsModuleOptions): DynamicModule {
  return {
    module: IncidentsModuleClass,
    controllers: [IncidentsController],
    providers: [
      {
        provide: INCIDENTS_SERVICE,
        useValue: new IncidentsService(opts.db),
      },
    ],
  };
}

export const incidentsMigrationsDir = new URL('../migrations', import.meta.url).pathname;
