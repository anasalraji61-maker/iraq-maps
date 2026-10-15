import type { NotificationPrefs, PushSender, UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import { and, desc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { deviceTable, notificationTable, prefsTable } from './schema';

/** Baghdad is UTC+3. Returns current HH:MM in that timezone. */
function baghdadHHMM(): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** True if current Baghdad time is within [start, end) quiet window.
 *  Handles overnight ranges (e.g. 23:00 – 08:00). */
function isQuietNow(start: string, end: string): boolean {
  const now = baghdadHHMM();
  if (start < end) {
    return now >= start && now < end;
  }
  // overnight
  return now >= start || now < end;
}

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

  async getFullPrefs(userId: UserId) {
    const [row] = await this.db.select().from(prefsTable).where(eq(prefsTable.userId, userId));
    return {
      newInquiry:        row?.newInquiry ?? true,
      replyReceived:     row?.replyReceived ?? true,
      statusUpdate:      row?.statusUpdate ?? true,
      discoverLikes:     row?.discoverLikes ?? true,
      discoverComments:  row?.discoverComments ?? true,
      messages:          row?.messages ?? true,
      quietHoursEnabled: row?.quietHoursEnabled ?? false,
      quietStart:        row?.quietStart ?? '23:00',
      quietEnd:          row?.quietEnd   ?? '08:00',
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

  /** Persist a notification row and push it to the user's devices.
   *  Respects quiet hours — skips push (but still persists the row) when quiet. */
  async sendToUser(userId: UserId, notification: { title: string; body: string; type?: string; data?: Record<string, string>; expiresAt?: Date }): Promise<string> {
    const [row] = await this.db
      .insert(notificationTable)
      .values({
        userId,
        type: notification.type ?? 'general',
        title: notification.title,
        body: notification.body,
        data: notification.data ?? null,
        expiresAt: notification.expiresAt ?? null,
      })
      .returning({ id: notificationTable.id });
    if (!row) throw new Error('insert failed');

    // Quiet hours check
    const prefs = await this.getFullPrefs(userId);
    const quiet = prefs.quietHoursEnabled && isQuietNow(prefs.quietStart, prefs.quietEnd);
    if (!quiet) {
      const devices = await this.db.select().from(deviceTable).where(eq(deviceTable.userId, userId));
      await Promise.allSettled(devices.map((d) => this.push.send(d.token, notification)));
    }

    return row.id;
  }

  /** Send a notification to multiple users in parallel (best-effort; errors don't propagate). */
  async sendBatchNotifications(userIds: UserId[], notification: { title: string; body: string; type?: string; data?: Record<string, string> }): Promise<void> {
    await Promise.allSettled(userIds.map((uid) => this.sendToUser(uid, notification)));
  }

  /** Schedule a notification by persisting it with an explicit expiresAt.
   *  Actual push delivery is handled by a cron that fires sendToUser at scheduledAt. */
  async scheduleNotification(userId: UserId, notification: { type: string; title: string; body: string; data?: Record<string, string> }, scheduledAt: Date): Promise<string> {
    const expiresAt = new Date(scheduledAt.getTime() + 86_400_000);
    return this.sendToUser(userId, { ...notification, expiresAt });
  }

  /** Delete notification rows older than 30 days or past their expiresAt. Call from a cron. */
  async cleanOldNotifications(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    const result = await this.db
      .delete(notificationTable)
      .where(
        or(
          lt(notificationTable.createdAt, cutoff),
          lte(notificationTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: notificationTable.id });
    return result.length;
  }

  /** Unread count for a user. */
  async getUnreadCount(userId: UserId): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationTable)
      .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)));
    return row?.count ?? 0;
  }

  /** Mark all unread notifications as read for a user. */
  async markAllRead(userId: UserId): Promise<number> {
    const result = await this.db
      .update(notificationTable)
      .set({ readAt: new Date() })
      .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)))
      .returning({ id: notificationTable.id });
    return result.length;
  }

  async listNotifications(userId: UserId, unreadOnly = true, cursor?: string, limit = 20) {
    const pageSize = Math.min(limit, 50);
    // cursor is the ISO createdAt of the last seen item (exclusive lower bound for DESC order)
    const cursorDate = cursor ? new Date(cursor) : undefined;

    const baseWhere = unreadOnly
      ? and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt))
      : eq(notificationTable.userId, userId);

    const where = cursorDate
      ? and(baseWhere, lt(notificationTable.createdAt, cursorDate))
      : baseWhere;

    const rows = await this.db
      .select()
      .from(notificationTable)
      .where(where)
      .orderBy(desc(notificationTable.createdAt))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    // unreadCount is total across all pages (not just this page)
    const allUnread = await this.db
      .select({ id: notificationTable.id })
      .from(notificationTable)
      .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)));

    const nextCursor = hasMore ? pageRows[pageRows.length - 1]!.createdAt.toISOString() : null;

    return {
      items: pageRows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        data: r.data ?? undefined,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      unreadCount: allUnread.length,
      nextCursor,
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

  async dismissNotification(userId: UserId, notificationId: string): Promise<boolean> {
    const result = await this.db
      .delete(notificationTable)
      .where(and(eq(notificationTable.id, notificationId), eq(notificationTable.userId, userId)))
      .returning({ id: notificationTable.id });
    return result.length > 0;
  }

  async eraseUserData(userId: UserId): Promise<void> {
    await this.db.delete(deviceTable).where(eq(deviceTable.userId, userId));
    await this.db.delete(prefsTable).where(eq(prefsTable.userId, userId));
    await this.db.delete(notificationTable).where(eq(notificationTable.userId, userId));
  }

  /** Returns count of unread notifications grouped by type. */
  async getDigest(userId: UserId): Promise<{ total: number; byType: Record<string, number> }> {
    const rows = await this.db
      .select({ type: notificationTable.type, count: sql<number>`count(*)::int` })
      .from(notificationTable)
      .where(and(eq(notificationTable.userId, userId), isNull(notificationTable.readAt)))
      .groupBy(notificationTable.type);

    const byType: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byType[row.type] = row.count;
      total += row.count;
    }
    return { total, byType };
  }
}
