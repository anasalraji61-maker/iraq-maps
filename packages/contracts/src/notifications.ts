// M4 contracts: device registration and notification preferences.
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

/** @public frozen contract (M4) */
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
});
