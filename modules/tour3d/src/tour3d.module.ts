import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { TOUR3D_SERVICE, Tour3DController } from './tour3d.controller';
import { Tour3DService } from './tour3d.service';

export interface Tour3DModuleOptions {
  db: Db;
}

@Module({})
class Tour3DModuleClass {}

/** Nest dynamic module serving tour3dContract routes.
 * @public */
export function tour3dModule(opts: Tour3DModuleOptions): DynamicModule {
  return {
    module: Tour3DModuleClass,
    controllers: [Tour3DController],
    providers: [
      {
        provide: TOUR3D_SERVICE,
        useValue: new Tour3DService(opts.db),
      },
    ],
  };
}

export const tour3dMigrationsDir = new URL('../migrations', import.meta.url).pathname;
