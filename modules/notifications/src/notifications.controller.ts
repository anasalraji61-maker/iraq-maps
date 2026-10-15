import { notificationsContract, type DeviceId, type NotificationId } from '@iraq-maps/contracts';
import { Controller, Inject, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { AuthenticatedRequest } from './types';
import { NotificationsService } from './notifications.service';

export const NOTIFICATIONS_SERVICE = Symbol('NotificationsService');

@Controller()
export class NotificationsController {
  constructor(@Inject(NOTIFICATIONS_SERVICE) private readonly svc: NotificationsService) {}

  @TsRestHandler(notificationsContract)
  handle(@Req() req: AuthenticatedRequest) {
    const userId = req.principal.userId;
    return tsRestHandler(notificationsContract, {
      registerDevice: async ({ body }) => {
        const { deviceId } = await this.svc.registerDevice(userId, body.token, body.platform);
        return { status: 201, body: { deviceId: deviceId as DeviceId } };
      },
      getPrefs: async () => {
        const prefs = await this.svc.getPrefs(userId);
        return { status: 200, body: prefs };
      },
      updatePrefs: async ({ body }) => {
        const prefs = await this.svc.updatePrefs(userId, body);
        return { status: 200, body: prefs };
      },
      listNotifications: async ({ query }) => {
        const result = await this.svc.listNotifications(userId, query.unreadOnly ?? true, query.cursor, query.limit);
        return {
          status: 200,
          body: {
            items: result.items.map((n) => ({ ...n, id: n.id as NotificationId })),
            unreadCount: result.unreadCount,
            nextCursor: result.nextCursor,
          },
        };
      },
      markRead: async ({ params }) => {
        const found = await this.svc.markRead(userId, params.id);
        if (!found) return { status: 404, body: { code: 'not_found' } };
        return { status: 200, body: { ok: true as const } };
      },
    });
  }
}
