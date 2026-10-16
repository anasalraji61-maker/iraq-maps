/**
 * FakeNotificationCenterService — in-memory notification center fake for testing.
 *
 * Covers:
 *  - create, list, markRead, markAllRead, dismiss, clearAll
 *  - getUnreadCount, getDigest
 *  - Preferences (muted types)
 *  - Quiet hours logic
 *  - Device registration and push dispatch
 *  - Pagination with cursor
 *  - Per-user isolation
 */
import { randomUUID } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'new_inquiry'
  | 'reply_received'
  | 'status_update'
  | 'discover_like'
  | 'discover_comment'
  | 'message'
  | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPrefs {
  newInquiry: boolean;
  replyReceived: boolean;
  statusUpdate: boolean;
  discoverLikes: boolean;
  discoverComments: boolean;
  messages: boolean;
  quietHoursEnabled: boolean;
  quietStart: string; // HH:MM in Baghdad time (UTC+3)
  quietEnd: string;   // HH:MM
}

export interface DeviceToken {
  userId: string;
  token: string;
  platform: 'android' | 'ios';
}

export interface FakePushCall {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export class FakeNotificationCenterServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'FakeNotificationCenterServiceError';
  }
}

// ─── FakeNotificationCenterService ───────────────────────────────────────────

export class FakeNotificationCenterService {
  private readonly notifications: Map<string, Notification> = new Map();
  private readonly prefs: Map<string, NotificationPrefs> = new Map();
  private readonly devices: Map<string, DeviceToken[]> = new Map();
  readonly pushCalls: FakePushCall[] = [];

  /** Controllable clock (Baghdad time simulation). */
  private _now: () => Date = () => new Date();

  setNow(fn: () => Date): void {
    this._now = fn;
  }

  now(): Date {
    return this._now();
  }

  // ─── Device registration ──────────────────────────────────────────────────────

  async registerDevice(
    userId: string,
    token: string,
    platform: 'android' | 'ios' = 'android',
  ): Promise<{ deviceId: string }> {
    const tokens = this.devices.get(userId) ?? [];
    const existing = tokens.find((d) => d.token === token);
    if (!existing) {
      tokens.push({ userId, token, platform });
    } else {
      existing.platform = platform;
    }
    this.devices.set(userId, tokens);
    return { deviceId: token };
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    const tokens = this.devices.get(userId) ?? [];
    const idx = tokens.findIndex((d) => d.token === token);
    if (idx !== -1) tokens.splice(idx, 1);
    this.devices.set(userId, tokens);
  }

  getDeviceTokens(userId: string): string[] {
    return (this.devices.get(userId) ?? []).map((d) => d.token);
  }

  // ─── Preferences ─────────────────────────────────────────────────────────────

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    return this.prefs.get(userId) ?? this.defaultPrefs();
  }

  async updatePrefs(userId: string, partial: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const current = await this.getPrefs(userId);
    const updated: NotificationPrefs = { ...current, ...partial };
    this.prefs.set(userId, updated);
    return updated;
  }

  private defaultPrefs(): NotificationPrefs {
    return {
      newInquiry: true,
      replyReceived: true,
      statusUpdate: true,
      discoverLikes: true,
      discoverComments: true,
      messages: true,
      quietHoursEnabled: false,
      quietStart: '23:00',
      quietEnd: '08:00',
    };
  }

  private isMuted(prefs: NotificationPrefs, type: NotificationType): boolean {
    switch (type) {
      case 'new_inquiry':      return !prefs.newInquiry;
      case 'reply_received':   return !prefs.replyReceived;
      case 'status_update':    return !prefs.statusUpdate;
      case 'discover_like':    return !prefs.discoverLikes;
      case 'discover_comment': return !prefs.discoverComments;
      case 'message':          return !prefs.messages;
      case 'system':           return false; // system notifications always delivered
      default:                 return false;
    }
  }

  private isQuietNow(prefs: NotificationPrefs, now: Date): boolean {
    if (!prefs.quietHoursEnabled) return false;
    // Baghdad = UTC+3
    const baghdadHours = (now.getUTCHours() + 3) % 24;
    const baghdadMinutes = now.getUTCMinutes();
    const time = `${String(baghdadHours).padStart(2, '0')}:${String(baghdadMinutes).padStart(2, '0')}`;
    const { quietStart: start, quietEnd: end } = prefs;
    if (start < end) return time >= start && time < end;
    return time >= start || time < end; // overnight range
  }

  // ─── Create notification ──────────────────────────────────────────────────────

  async create(
    userId: string,
    input: {
      type: NotificationType;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ): Promise<Notification> {
    const prefs = await this.getPrefs(userId);
    const now = this.now();

    const notif: Notification = {
      id: randomUUID(),
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      readAt: null,
      createdAt: now,
    };
    this.notifications.set(notif.id, notif);

    // Push only when: type is not muted AND not quiet hours
    const muted = this.isMuted(prefs, input.type);
    const quiet = this.isQuietNow(prefs, now);

    if (!muted && !quiet) {
      const tokens = this.devices.get(userId) ?? [];
      for (const device of tokens) {
        this.pushCalls.push({
          token: device.token,
          title: input.title,
          body: input.body,
          data: input.data,
        });
      }
    }

    return notif;
  }

  /** Batch-create notifications for multiple users (fan-out). */
  async fanOut(
    userIds: string[],
    input: { type: NotificationType; title: string; body: string; data?: Record<string, unknown> },
  ): Promise<Notification[]> {
    return Promise.all(userIds.map((userId) => this.create(userId, input)));
  }

  // ─── List ─────────────────────────────────────────────────────────────────────

  async list(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number; cursor?: string } = {},
  ): Promise<{ items: Notification[]; unreadCount: number; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const unreadOnly = opts.unreadOnly !== false;
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;

    let items = Array.from(this.notifications.values())
      .filter((n) => n.userId === userId && (!unreadOnly || n.readAt === null))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (cursorDate) {
      items = items.filter((n) => n.createdAt < cursorDate);
    }

    const page = items.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    const unreadCount = Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId && n.readAt === null,
    ).length;

    return {
      items: pageItems,
      unreadCount,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]!.createdAt.toISOString() : null,
    };
  }

  // ─── Read ─────────────────────────────────────────────────────────────────────

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const notif = this.notifications.get(notificationId);
    if (!notif || notif.userId !== userId || notif.readAt !== null) return false;
    notif.readAt = this.now();
    return true;
  }

  async markAllRead(userId: string): Promise<number> {
    let count = 0;
    const now = this.now();
    for (const notif of this.notifications.values()) {
      if (notif.userId === userId && notif.readAt === null) {
        notif.readAt = now;
        count++;
      }
    }
    return count;
  }

  // ─── Dismiss ──────────────────────────────────────────────────────────────────

  async dismiss(userId: string, notificationId: string): Promise<boolean> {
    const notif = this.notifications.get(notificationId);
    if (!notif || notif.userId !== userId) return false;
    this.notifications.delete(notificationId);
    return true;
  }

  async clearAll(userId: string): Promise<number> {
    let count = 0;
    for (const [id, notif] of this.notifications.entries()) {
      if (notif.userId === userId) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  // ─── Count / Digest ───────────────────────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId && n.readAt === null,
    ).length;
  }

  async getDigest(userId: string): Promise<{ total: number; byType: Record<string, number> }> {
    const byType: Record<string, number> = {};
    let total = 0;
    for (const notif of this.notifications.values()) {
      if (notif.userId === userId && notif.readAt === null) {
        byType[notif.type] = (byType[notif.type] ?? 0) + 1;
        total++;
      }
    }
    return { total, byType };
  }

  // ─── Data erasure ─────────────────────────────────────────────────────────────

  async eraseUserData(userId: string): Promise<void> {
    for (const [id, notif] of this.notifications.entries()) {
      if (notif.userId === userId) this.notifications.delete(id);
    }
    this.prefs.delete(userId);
    this.devices.delete(userId);
  }

  // ─── Helpers for test assertions ─────────────────────────────────────────────

  getPushCallsForToken(token: string): FakePushCall[] {
    return this.pushCalls.filter((c) => c.token === token);
  }

  getPushCallsForUser(userId: string): FakePushCall[] {
    const tokens = new Set(this.getDeviceTokens(userId));
    return this.pushCalls.filter((c) => tokens.has(c.token));
  }

  getTotalNotificationsCount(): number {
    return this.notifications.size;
  }

  getNotificationById(id: string): Notification | undefined {
    return this.notifications.get(id);
  }

  // ─── Reset ────────────────────────────────────────────────────────────────────

  reset(): void {
    this.notifications.clear();
    this.prefs.clear();
    this.devices.clear();
    this.pushCalls.length = 0;
    this._now = () => new Date();
  }
}
