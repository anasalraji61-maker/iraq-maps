import { fileURLToPath } from 'node:url';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FakeMessagingChannel } from './fake-channel';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

export interface MessagingModuleOptions {
  db: Db;
  /** Optional: override the channel adapter. If absent, FakeMessagingChannel is used. */
  channelAdapter?: unknown;
  /** Redis connection options for BullMQ. */
  redis?: { host: string; port: number };
}

/** Absolute path to this module's migrations (schema `messaging`). @public */
export const messagingMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

@Module({})
class MessagingModule {}

/** Nest dynamic module serving messagingContract routes.
 * @public */
export function messagingModule(opts: MessagingModuleOptions): DynamicModule {
  const redisConn = opts.redis ?? { host: process.env['REDIS_HOST'] ?? 'localhost', port: Number(process.env['REDIS_PORT'] ?? 6379) };

  const queue = new Queue('messaging', { connection: redisConn });

  return {
    module: MessagingModule,
    global: true,
    controllers: [MessagingController],
    providers: [
      { provide: 'MESSAGING_DB', useValue: opts.db },
      {
        provide: PortTokens.MessagingChannelAdapter,
        useValue: opts.channelAdapter ?? new FakeMessagingChannel(),
      },
      { provide: 'MESSAGING_QUEUE', useValue: queue },
      MessagingService,
    ],
    exports: [MessagingService],
  };
}
