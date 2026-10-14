// M4 contracts: device registration, notification preferences and inbox.
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const DeviceId = z.string().uuid().brand<'DeviceId'>();
export type DeviceId = z.infer<typeof DeviceId>;

export const PushToken = z.string().min(1).brand<'PushToken'>();
export type PushToken = z.infer<typeof PushToken>;

export const NotificationPrefs = z.object({
  newInquiry: z.boolean().default(true),
  replyReceived: z.boolean().default(true),
  statusUpdate: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const NotificationId = z.string().uuid().brand<'NotificationId'>();
export type NotificationId = z.infer<typeof NotificationId>;

export const NotificationItem = z.object({
  id: NotificationId,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string()).optional(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationItem = z.infer<typeof NotificationItem>;

/** @public frozen contract (M4/M6) */
export const notificationsContract = c.router({
  registerDevice: {
    method: 'POST',
    path: '/v1/devices',
    body: z.object({ token: PushToken, platform: z.enum(['android', 'ios']) }),
    responses: {
      201: z.object({ deviceId: DeviceId }),
      200: z.object({ deviceId: DeviceId }),
    },
  },
  getPrefs: {
    method: 'GET',
    path: '/v1/notification-prefs',
    responses: { 200: NotificationPrefs },
  },
  updatePrefs: {
    method: 'PUT',
    path: '/v1/notification-prefs',
    body: NotificationPrefs.partial(),
    responses: { 200: NotificationPrefs },
  },
  listNotifications: {
    method: 'GET',
    path: '/v1/notifications',
    query: z.object({ unreadOnly: z.coerce.boolean().optional() }),
    responses: {
      200: z.object({ items: z.array(NotificationItem), unreadCount: z.number().int() }),
    },
    summary: 'List notifications (unread by default)',
  },
  markRead: {
    method: 'POST',
    path: '/v1/notifications/:id/read',
    pathParams: z.object({ id: NotificationId }),
    body: z.object({}),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      404: z.object({ code: z.string() }),
    },
    summary: 'Mark a notification as read',
  },
});
