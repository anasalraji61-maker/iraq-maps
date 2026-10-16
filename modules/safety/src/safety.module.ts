import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import {
  EMERGENCY_SERVICE,
  SAFETY_SERVICE,
  SafetyController,
} from './safety.controller';
import { EmergencyService, type EmergencyPushSender } from './emergency.service';
import { SafetyService } from './safety.service';

// ---------------------------------------------------------------------------
// No-op push sender used when no real push adapter is wired (mock/test).
// ---------------------------------------------------------------------------

class NoopPushSender implements EmergencyPushSender {
  async sendToUser(_userId: string, _payload: object): Promise<void> {
    // no-op: real push is wired at composition-root time
  }
}

// ---------------------------------------------------------------------------
// Module options
// ---------------------------------------------------------------------------

export interface SafetyModuleOptions {
  db: Db;
  pushSender?: EmergencyPushSender;
}

@Module({})
class SafetyModuleClass {}

/** Nest dynamic module serving safetyContract. */
export function safetyModule(opts: SafetyModuleOptions): DynamicModule {
  const safetyService = new SafetyService(opts.db);
  const pushSender = opts.pushSender ?? new NoopPushSender();
  const emergencyService = new EmergencyService(safetyService, pushSender);

  return {
    module: SafetyModuleClass,
    controllers: [SafetyController],
    providers: [
      { provide: SAFETY_SERVICE, useValue: safetyService },
      { provide: EMERGENCY_SERVICE, useValue: emergencyService },
    ],
    exports: [SAFETY_SERVICE, EMERGENCY_SERVICE],
  };
}

export const safetyMigrationsDir = new URL('../migrations', import.meta.url).pathname;
