import { fileURLToPath } from 'node:url';
import type { DomainEvent, EventBus, EventHandler, EventName } from '@iraq-maps/contracts';
import { PortTokens } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { Module, type DynamicModule } from '@nestjs/common';
import { Queue } from 'bullmq';
import { FakeMessagingChannel } from './fake-channel';
import { MessagingController } from './messaging.controller';
import { MessagingGroupsController } from './messaging-groups.controller';
import { MessagingGroupsService } from './messaging-groups.service';
import { MessagingService } from './messaging.service';
import { createMessagingWorker } from './messaging.worker';

export interface MessagingModuleOptions {
  db: Db;
  /** Optional: override the channel adapter. If absent, FakeMessagingChannel is used. */
  channelAdapter?: unknown;
  /** Redis connection options for BullMQ. */
  redis?: { host: string; port: number };
  /** Optional: provide an existing EventBus. If absent, an in-memory one is used. */
  eventBus?: EventBus;
}

class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  async publish(event: DomainEvent): Promise<void> {
    const set = this.handlers.get(event.name);
    if (set) {
      for (const handler of set) {
        await handler(event);
      }
    }
  }

  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): () => void {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler as EventHandler);
    return () => this.handlers.get(name)?.delete(handler as EventHandler);
  }
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
    controllers: [MessagingController, MessagingGroupsController],
    providers: [
      { provide: 'MESSAGING_DB', useValue: opts.db },
      {
        provide: PortTokens.MessagingChannelAdapter,
        useValue: opts.channelAdapter ?? new FakeMessagingChannel(),
      },
      { provide: 'MESSAGING_QUEUE', useValue: queue },
      { provide: 'MESSAGING_REDIS_CONN', useValue: redisConn },
      { provide: PortTokens.EventBus, useValue: opts.eventBus ?? new InMemoryEventBus() },
      MessagingService,
      MessagingGroupsService,
      {
        provide: 'MESSAGING_WORKER',
        useFactory: (svc: MessagingService) => createMessagingWorker(svc, redisConn),
        inject: [MessagingService],
      },
    ],
    exports: [MessagingService, 'MESSAGING_QUEUE'],
  };
}
