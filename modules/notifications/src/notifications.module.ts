import { fileURLToPath } from 'node:url';
import { PortTokens, type EventBus, type PushSender, type UserDataEraser, type UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { FakePushSender } from '@iraq-maps/testing';
import { Inject, Module, type DynamicModule, type OnModuleInit } from '@nestjs/common';
import { NOTIFICATIONS_SERVICE, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

export const notificationsMigrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

export interface NotificationsModuleOptions {
  db: Db;
  eventBus: EventBus;
  pushSender?: PushSender;
  env?: Record<string, string | undefined>;
}

@Module({})
class NotificationsModule implements OnModuleInit {
  constructor(
    @Inject(NOTIFICATIONS_SERVICE) private readonly svc: NotificationsService,
    @Inject('NOTIFICATIONS_EVENT_BUS') private readonly eventBus: EventBus,
  ) {}

  onModuleInit() {
    // messaging.inquiry.received.v1 → notify provider (new_inquiry pref)
    this.eventBus.subscribe('messaging.inquiry.received.v1' as never, async (event: { payload: { providerId: string; inquiryId: string } }) => {
      await this.svc.notifyProvider(event.payload.providerId as UserId, {
        title: 'استفسار جديد',
        body: 'تلقّيت استفساراً جديداً من أحد المستخدمين.',
      });
    });

    // messaging.reply.received.v1 → notify user (reply_received pref)
    this.eventBus.subscribe('messaging.reply.received.v1' as never, async (event: { payload: { userId: string; inquiryId: string } }) => {
      await this.svc.sendToUser(event.payload.userId as UserId, {
        title: 'ردّ جديد',
        body: 'ردّ المزوّد على استفسارك.',
        data: { type: 'inquiry_replied', requestId: event.payload.inquiryId },
      });
    });

    // discover.post.liked.v1 → notify post author
    this.eventBus.subscribe('discover.post.liked.v1' as never, async (event: { payload: { postId: string; postAuthorId: string; likedByUserId: string } }) => {
      const { postAuthorId, likedByUserId } = event.payload;
      if (postAuthorId === likedByUserId) return; // don't notify own likes
      await this.svc.sendToUser(postAuthorId as UserId, {
        title: 'إعجاب جديد',
        body: 'أعجب شخص ما بمنشورك.',
        data: { type: 'post_liked', postId: event.payload.postId },
      });
    });

    // discover.post.commented.v1 → notify post author
    this.eventBus.subscribe('discover.post.commented.v1' as never, async (event: { payload: { postId: string; postAuthorId: string; commentedByUserId: string } }) => {
      const { postAuthorId, commentedByUserId } = event.payload;
      if (postAuthorId === commentedByUserId) return; // don't notify own comments
      await this.svc.sendToUser(postAuthorId as UserId, {
        title: 'تعليق جديد',
        body: 'علّق شخص ما على منشورك.',
        data: { type: 'post_commented', postId: event.payload.postId },
      });
    });
  }
}

export function notificationsModule(opts: NotificationsModuleOptions): DynamicModule {
  const push: PushSender =
    opts.pushSender ?? ((opts.env ?? process.env)['PUSH_PROVIDER'] === 'fcm' ? (() => { throw new Error('FCM pushSender must be provided when PUSH_PROVIDER=fcm'); })() : new FakePushSender());

  const svc = new NotificationsService(opts.db, push);

  const eraser: UserDataEraser = {
    module: 'notifications',
    erase: (userId) => svc.eraseUserData(userId),
  };

  return {
    module: NotificationsModule,
    controllers: [NotificationsController],
    providers: [
      { provide: NOTIFICATIONS_SERVICE, useValue: svc },
      { provide: 'NOTIFICATIONS_EVENT_BUS', useValue: opts.eventBus },
      { provide: PortTokens.PushSender, useValue: push },
      { provide: 'NotificationsUserDataEraser', useValue: eraser },
    ],
    exports: [PortTokens.PushSender, 'NotificationsUserDataEraser'],
  };
}
