import type { NotificationPrefs, PushSender, UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { eq } from 'drizzle-orm';
import { deviceTable, prefsTable } from './schema';

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
        set: { newInquiry: merged.newInquiry, replyReceived: merged.replyReceived, statusUpdate: merged.statusUpdate, updatedAt: new Date() },
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

  async eraseUserData(userId: UserId): Promise<void> {
    await this.db.delete(deviceTable).where(eq(deviceTable.userId, userId));
    await this.db.delete(prefsTable).where(eq(prefsTable.userId, userId));
  }
}
