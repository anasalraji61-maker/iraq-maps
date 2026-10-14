import { fileURLToPath } from 'node:url';
import { Module, type DynamicModule } from '@nestjs/common';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import type { ObjectStorage } from '@iraq-maps/contracts';
import { DB_TOKEN, OUTBOX_TOKEN, MediaService } from './media.service.js';
import { MEDIA_SERVICE, MediaController } from './media.controller.js';
import { FileObjectStorage } from './file-storage.js';

/** How often the orphan cleanup job runs (every 6 hours). */
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface MediaModuleOptions {
  db: Db;
  storage?: ObjectStorage;
}

/** Absolute path of this module's migrations (schema `media`).
 * @public frozen stub (M3) */
export const mediaMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

@Module({})
class MediaModule {}

/** Nest module serving mediaContract, providing PortTokens.MediaPort and PortTokens.ObjectStorage. */
export function mediaModule(opts: MediaModuleOptions): DynamicModule {
  const storage = opts.storage ?? new FileObjectStorage();
  const svc = new MediaService(opts.db, storage);

  // Schedule orphan cleanup every 6 h. The timer is intentionally never cleared: the process
  // lifetime matches the app lifetime, and clearInterval on shutdown is not necessary here.
  setInterval(() => {
    void svc.cleanupOrphaned().catch(() => undefined);
  }, CLEANUP_INTERVAL_MS);

  return {
    module: MediaModule,
    global: true,
    controllers: [MediaController],
    providers: [
      { provide: DB_TOKEN, useValue: opts.db },
      { provide: OUTBOX_TOKEN, useValue: undefined },
      { provide: PortTokens.ObjectStorage, useValue: storage },
      { provide: PortTokens.MediaPort, useValue: svc },
      { provide: MEDIA_SERVICE, useValue: svc },
    ],
    exports: [PortTokens.MediaPort, PortTokens.ObjectStorage],
  };
}
