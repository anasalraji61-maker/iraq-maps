import type { NotificationPrefs, PushSender, UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { and, eq, isNull } from 'drizzle-orm';
import { deviceTable, notificationTable, prefsTable } from './schema';

export class NotificationsService {
  constructor(
    private readonly db: Db,
    private readonly push: PushSender,
  ) {}

  async registerDevice(userId: UserId, token: string, platform: 'android' | 'ios'): Promise<{ deviceId: string }> {
    const [row] = await this.db
      .insert(deviceTable)
      .values({ userId, token, platform })
      .onConflictDoUpdate({ target: [deviceTable.userId, deviceTable.token], set: { platform } })
      .returning({ id: deviceTable.id });
    return { deviceId: row!.id };
  }

  async getPrefs(userId: UserId): Promise<NotificationPrefs> {
    const [row] = await this.db.select().from(prefsTable).where(eq(prefsTable.userId, userId));
    return {
      newInquiry: row?.newInquiry ?? true,
      replyReceived: row?.replyReceived ?? true,
      statusUpdate: row?.statusUpdate ?? true,
      discoverLikes: row?.discoverLikes ?? true,
      discoverComments: row?.discoverComments ?? true,
      messages: row?.messages ?? true,
    };
  }

  async updatePrefs(userId: UserId, partial: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const current = await this.getPrefs(userId);
    const merged = { ...current, ...partial };
    await this.db
      .insert(prefsTable)
      .values({ userId, ...merged })
      .onConflictDoUpdate({
        target: prefsTable.userId,
        set: {
          newInquiry: merged.newInquiry,
          replyReceived: merged.replyReceived,
          statusUpdate: merged.statusUpdate,
          discoverLikes: merged.discoverLikes,
          discoverComments: merged.discoverComments,
          messages: merged.messages,
          updatedAt: new Date(),
        },
      });
    return merged;
  }

  async notifyProvider(providerId: UserId, notification: { title: string; body: string }): Promise<void> {
    const prefs = await this.getPrefs(providerId);
    if (!prefs.newInquiry) return;
    const devices = await this.db.select().from(deviceTable).where(eq(deviceTable.userId, providerId));
    await Promise.allSettled(devices.map((d) => this.push.send(d.token, notification)));
  }

  async notifyUser(userId: UserId, notification: { title: string; body: string }): Promise<void> {
    const prefs = await this.getPrefs(userId);
    if (!prefs.replyReceived) return;
    const devices = await this.db.select().from(deviceTable).where(eq(deviceTable.userId, userId));
    await Promise.allSettled(devices.map((d) => this.push.send(d.token, notification)));
  }

  /** Persist a notification row and push it to the user's devices. */
  async sendToUser(userId: UserId, notification: { title: string; body: string; data?: Record<string, string> }): Promise<string> {
    const [row] = await this.db
      .insert(notificationTable)
      .values({ userId, title: notification.title, body: notification.body, data: notification.data ?? null })
      .returning({ id: notificationTable.id });
    if (!row) throw new Error('insert failed');
    const devices = await this.db.select().from(deviceTable).where(eq(deviceTable.userId, userId));
    await Promise.allSettled(devices.map((d) => this.push.send(d.token, notification)));
    return row.id;
  }

  async listNotifications(userId: UserId, unreadOnly = true) {
    const rows = unreadOnly
      ? await this.db.select().from(notificationTable).where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt))).orderBy(notificationTable.createdAt)
      : await this.db.select().from(notificationTable).where(eq(notificationTable.userId, userId)).orderBy(notificationTable.createdAt);

    const unreadCount = unreadOnly
      ? rows.length
      : rows.filter((r) => r.readAt === null).length;

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        data: r.data ?? undefined,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      unreadCount,
    };
  }

  async markRead(userId: UserId, notificationId: string): Promise<boolean> {
    const [updated] = await this.db
      .update(notificationTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationTable.id, notificationId), eq(notificationTable.userId, userId), isNull(notificationTable.readAt)))
      .returning({ id: notificationTable.id });
    return updated !== undefined;
  }

  async eraseUserData(userId: UserId): Promise<void> {
    await this.db.delete(deviceTable).where(eq(deviceTable.userId, userId));
    await this.db.delete(prefsTable).where(eq(prefsTable.userId, userId));
    await this.db.delete(notificationTable).where(eq(notificationTable.userId, userId));
  }
}
