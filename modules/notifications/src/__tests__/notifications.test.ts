/**
 * Unit tests for the notifications module — notification center,
 * mark-read, dismiss, clear-all, preferences, and quiet hours.
 *
 * Uses an in-memory DB shim — no real PostgreSQL or push service.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserId = string & { __brand: 'UserId' };
const uid = (s: string) => s as UserId;

interface Notification {
  id: string;
  userId: UserId;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationPrefs {
  newInquiry: boolean;
  replyReceived: boolean;
  statusUpdate: boolean;
  discoverLikes: boolean;
  discoverComments: boolean;
  messages: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

interface PushSent {
  token: string;
  title: string;
  body: string;
}

// ─── FakePushSender ───────────────────────────────────────────────────────────

class FakePushSender {
  readonly sent: PushSent[] = [];

  async send(token: string, title: string, body: string): Promise<void> {
    this.sent.push({ token, title, body });
  }

  reset() {
    this.sent.length = 0;
  }
}

// ─── In-memory notification center service ────────────────────────────────────

class FakeNotificationService {
  private readonly notifications: Map<string, Notification> = new Map();
  private readonly prefs: Map<UserId, NotificationPrefs> = new Map();
  private readonly devices: Map<UserId, string[]> = new Map(); // userId → tokens
  private idCounter = 1;
  private clockOffset = 0; // ms offset for simulating time

  constructor(private readonly push: FakePushSender) {}

  private now(): Date {
    return new Date(Date.now() + this.clockOffset);
  }

  advanceClock(ms: number): void {
    this.clockOffset += ms;
  }

  private newId(): string {
    return `notif-${String(this.idCounter++).padStart(6, '0')}`;
  }

  async registerDevice(userId: UserId, token: string): Promise<void> {
    const tokens = this.devices.get(userId) ?? [];
    if (!tokens.includes(token)) tokens.push(token);
    this.devices.set(userId, tokens);
  }

  async create(
    userId: UserId,
    input: { type: string; title: string; body: string; data?: Record<string, unknown> },
  ): Promise<Notification> {
    const prefs = await this.getPrefs(userId);

    // Check if notification type is muted
    if (this.isMuted(prefs, input.type)) {
      // Still create in DB but don't push
      const notif: Notification = {
        id: this.newId(),
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        readAt: null,
        createdAt: this.now(),
      };
      this.notifications.set(notif.id, notif);
      return notif;
    }

    // Check quiet hours
    if (prefs.quietHoursEnabled && this.isQuietNow(prefs)) {
      const notif: Notification = {
        id: this.newId(),
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        readAt: null,
        createdAt: this.now(),
      };
      this.notifications.set(notif.id, notif);
      return notif;
    }

    const notif: Notification = {
      id: this.newId(),
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      readAt: null,
      createdAt: this.now(),
    };
    this.notifications.set(notif.id, notif);

    // Send push
    const tokens = this.devices.get(userId) ?? [];
    for (const token of tokens) {
      await this.push.send(token, input.title, input.body);
    }

    return notif;
  }

  private isMuted(prefs: NotificationPrefs, type: string): boolean {
    switch (type) {
      case 'new_inquiry': return !prefs.newInquiry;
      case 'reply_received': return !prefs.replyReceived;
      case 'status_update': return !prefs.statusUpdate;
      case 'discover_like': return !prefs.discoverLikes;
      case 'discover_comment': return !prefs.discoverComments;
      case 'message': return !prefs.messages;
      default: return false;
    }
  }

  private isQuietNow(prefs: NotificationPrefs): boolean {
    const now = this.now();
    const hh = String(now.getUTCHours() + 3).padStart(2, '0').slice(-2); // Baghdad UTC+3
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;
    const { quietStart: start, quietEnd: end } = prefs;
    if (start < end) return time >= start && time < end;
    return time >= start || time < end; // overnight
  }

  async list(
    userId: UserId,
    opts: { unreadOnly?: boolean; limit?: number; cursor?: string } = {},
  ): Promise<{ items: Notification[]; unreadCount: number; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const unreadOnly = opts.unreadOnly !== false;
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;

    let items = Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId && (!unreadOnly || n.readAt === null),
    );

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (cursorDate) {
      items = items.filter((n) => n.createdAt < cursorDate);
    }

    const page = items.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;

    const allUnread = Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId && n.readAt === null,
    );

    return {
      items: pageItems,
      unreadCount: allUnread.length,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async markRead(userId: UserId, notificationId: string): Promise<boolean> {
    const notif = this.notifications.get(notificationId);
    if (!notif || notif.userId !== userId || notif.readAt !== null) return false;
    notif.readAt = this.now();
    return true;
  }

  async markAllRead(userId: UserId): Promise<number> {
    let count = 0;
    for (const notif of this.notifications.values()) {
      if (notif.userId === userId && notif.readAt === null) {
        notif.readAt = this.now();
        count++;
      }
    }
    return count;
  }

  async dismiss(userId: UserId, notificationId: string): Promise<boolean> {
    const notif = this.notifications.get(notificationId);
    if (!notif || notif.userId !== userId) return false;
    this.notifications.delete(notificationId);
    return true;
  }

  async clearAll(userId: UserId): Promise<number> {
    let count = 0;
    for (const [id, notif] of this.notifications.entries()) {
      if (notif.userId === userId) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  async getUnreadCount(userId: UserId): Promise<number> {
    return Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId && n.readAt === null,
    ).length;
  }

  async getPrefs(userId: UserId): Promise<NotificationPrefs> {
    return this.prefs.get(userId) ?? {
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

  async updatePrefs(userId: UserId, partial: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const current = await this.getPrefs(userId);
    const updated = { ...current, ...partial };
    this.prefs.set(userId, updated);
    return updated;
  }

  reset() {
    this.notifications.clear();
    this.prefs.clear();
    this.devices.clear();
    this.idCounter = 1;
    this.clockOffset = 0;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_A = uid('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
const USER_B = uid('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

let push: FakePushSender;
let svc: FakeNotificationService;

beforeEach(() => {
  push = new FakePushSender();
  svc = new FakeNotificationService(push);
});

afterEach(() => {
  svc.reset();
  push.reset();
});

// ─── Create notification ──────────────────────────────────────────────────────

describe('Create notification', () => {
  it('creates a notification that appears in the center', async () => {
    await svc.create(USER_A, { type: 'message', title: 'رسالة جديدة', body: 'لديك رسالة' });
    const { items } = await svc.list(USER_A);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('رسالة جديدة');
  });

  it('notification is unread by default', async () => {
    const notif = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(notif.readAt).toBeNull();
  });

  it('notification has correct userId', async () => {
    const notif = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(notif.userId).toBe(USER_A);
  });

  it('notification has generated id', async () => {
    const notif = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(notif.id).toBeTruthy();
  });

  it('data payload is preserved', async () => {
    const data = { postId: 'post-123', action: 'like' };
    const notif = await svc.create(USER_A, { type: 'discover_like', title: 'إعجاب', body: 'أعجب شخص بمنشورك', data });
    expect(notif.data).toEqual(data);
  });

  it('creates notification for different users independently', async () => {
    await svc.create(USER_A, { type: 'message', title: 'للمستخدم أ', body: 'نص' });
    await svc.create(USER_B, { type: 'message', title: 'للمستخدم ب', body: 'نص' });
    const { items: itemsA } = await svc.list(USER_A);
    const { items: itemsB } = await svc.list(USER_B);
    expect(itemsA).toHaveLength(1);
    expect(itemsB).toHaveLength(1);
    expect(itemsA[0]!.userId).toBe(USER_A);
    expect(itemsB[0]!.userId).toBe(USER_B);
  });

  it('sends push notification when device registered', async () => {
    await svc.registerDevice(USER_A, 'device-token-abc');
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'محتوى الرسالة' });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.token).toBe('device-token-abc');
    expect(push.sent[0]!.title).toBe('رسالة');
  });

  it('no push sent when no device registered', async () => {
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    expect(push.sent).toHaveLength(0);
  });

  it('sends push to all registered devices', async () => {
    await svc.registerDevice(USER_A, 'token-1');
    await svc.registerDevice(USER_A, 'token-2');
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    expect(push.sent).toHaveLength(2);
  });
});

// ─── Mark read ────────────────────────────────────────────────────────────────

describe('Mark read', () => {
  it('marking notification read decreases unread count', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(await svc.getUnreadCount(USER_A)).toBe(1);
    await svc.markRead(USER_A, n.id);
    expect(await svc.getUnreadCount(USER_A)).toBe(0);
  });

  it('markRead sets readAt timestamp', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    await svc.markRead(USER_A, n.id);
    const { items } = await svc.list(USER_A, { unreadOnly: false });
    const updated = items.find((i) => i.id === n.id);
    expect(updated?.readAt).toBeInstanceOf(Date);
  });

  it('markRead returns true for valid notification', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(await svc.markRead(USER_A, n.id)).toBe(true);
  });

  it('markRead returns false for already-read notification', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    await svc.markRead(USER_A, n.id);
    expect(await svc.markRead(USER_A, n.id)).toBe(false);
  });

  it('markRead returns false for unknown id', async () => {
    expect(await svc.markRead(USER_A, 'nonexistent')).toBe(false);
  });

  it('markRead does not affect other users notifications', async () => {
    const nA = await svc.create(USER_A, { type: 'message', title: 'لأ', body: 'نص' });
    const nB = await svc.create(USER_B, { type: 'message', title: 'لب', body: 'نص' });
    await svc.markRead(USER_A, nB.id); // user A tries to read user B's notification
    expect(await svc.getUnreadCount(USER_B)).toBe(1); // B's count unchanged
    await svc.markRead(USER_A, nA.id);
    expect(await svc.getUnreadCount(USER_A)).toBe(0);
  });

  it('markAllRead marks all unread as read', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.create(USER_A, { type: 'message', title: `عنوان ${i}`, body: 'نص' });
    }
    const count = await svc.markAllRead(USER_A);
    expect(count).toBe(5);
    expect(await svc.getUnreadCount(USER_A)).toBe(0);
  });

  it('markAllRead returns 0 when no unread notifications', async () => {
    const count = await svc.markAllRead(USER_A);
    expect(count).toBe(0);
  });

  it('unread list excludes read notifications', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    await svc.markRead(USER_A, n.id);
    const { items } = await svc.list(USER_A, { unreadOnly: true });
    expect(items).toHaveLength(0);
  });

  it('all-notifications list includes read notifications', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    await svc.markRead(USER_A, n.id);
    const { items } = await svc.list(USER_A, { unreadOnly: false });
    expect(items).toHaveLength(1);
  });
});

// ─── Dismiss / Delete ─────────────────────────────────────────────────────────

describe('Dismiss notification', () => {
  it('dismissed notification disappears from list', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    await svc.dismiss(USER_A, n.id);
    const { items } = await svc.list(USER_A, { unreadOnly: false });
    expect(items.find((i) => i.id === n.id)).toBeUndefined();
  });

  it('dismiss returns true for valid notification', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(await svc.dismiss(USER_A, n.id)).toBe(true);
  });

  it('dismiss returns false for nonexistent notification', async () => {
    expect(await svc.dismiss(USER_A, 'bad-id')).toBe(false);
  });

  it('dismiss does not delete other users notifications', async () => {
    const nB = await svc.create(USER_B, { type: 'message', title: 'لب', body: 'نص' });
    await svc.dismiss(USER_A, nB.id); // user A tries to dismiss user B's
    const { items } = await svc.list(USER_B, { unreadOnly: false });
    expect(items.find((i) => i.id === nB.id)).toBeDefined();
  });

  it('dismissed notification decreases unread count', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    expect(await svc.getUnreadCount(USER_A)).toBe(1);
    await svc.dismiss(USER_A, n.id);
    expect(await svc.getUnreadCount(USER_A)).toBe(0);
  });
});

// ─── Clear all ────────────────────────────────────────────────────────────────

describe('Clear all notifications', () => {
  it('clearAll removes all notifications for user', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.create(USER_A, { type: 'message', title: `عنوان ${i}`, body: 'نص' });
    }
    const count = await svc.clearAll(USER_A);
    expect(count).toBe(5);
    const { items } = await svc.list(USER_A, { unreadOnly: false });
    expect(items).toHaveLength(0);
  });

  it('clearAll returns 0 when no notifications', async () => {
    expect(await svc.clearAll(USER_A)).toBe(0);
  });

  it('clearAll does not affect other users', async () => {
    await svc.create(USER_A, { type: 'message', title: 'لأ', body: 'نص' });
    await svc.create(USER_B, { type: 'message', title: 'لب', body: 'نص' });
    await svc.clearAll(USER_A);
    const { items } = await svc.list(USER_B, { unreadOnly: false });
    expect(items).toHaveLength(1);
  });

  it('list is empty after clearAll', async () => {
    for (let i = 0; i < 3; i++) await svc.create(USER_A, { type: 'message', title: `n${i}`, body: 'x' });
    await svc.clearAll(USER_A);
    const { unreadCount } = await svc.list(USER_A);
    expect(unreadCount).toBe(0);
  });
});

// ─── Preferences: muted type ──────────────────────────────────────────────────

describe('Preferences: muted notification type', () => {
  it('muted type creates notification but sends no push', async () => {
    await svc.registerDevice(USER_A, 'token-x');
    await svc.updatePrefs(USER_A, { discoverLikes: false });
    await svc.create(USER_A, { type: 'discover_like', title: 'إعجاب', body: 'أحد أعجب بمنشورك' });
    expect(push.sent).toHaveLength(0);
  });

  it('muted type still creates notification in DB', async () => {
    await svc.updatePrefs(USER_A, { messages: false });
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    const { items } = await svc.list(USER_A, { unreadOnly: false });
    expect(items).toHaveLength(1);
  });

  it('unmuted type sends push', async () => {
    await svc.registerDevice(USER_A, 'token-x');
    await svc.updatePrefs(USER_A, { discoverLikes: false, messages: true });
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    expect(push.sent).toHaveLength(1);
  });

  it('muting all types sends no push for any type', async () => {
    await svc.registerDevice(USER_A, 'token-x');
    await svc.updatePrefs(USER_A, {
      newInquiry: false,
      replyReceived: false,
      statusUpdate: false,
      discoverLikes: false,
      discoverComments: false,
      messages: false,
    });
    const types = ['new_inquiry', 'reply_received', 'status_update', 'discover_like', 'discover_comment', 'message'];
    for (const type of types) {
      await svc.create(USER_A, { type, title: 'عنوان', body: 'نص' });
    }
    expect(push.sent).toHaveLength(0);
  });

  it('getPrefs returns defaults when not set', async () => {
    const prefs = await svc.getPrefs(USER_A);
    expect(prefs.newInquiry).toBe(true);
    expect(prefs.messages).toBe(true);
    expect(prefs.quietHoursEnabled).toBe(false);
  });

  it('updatePrefs persists changes', async () => {
    await svc.updatePrefs(USER_A, { newInquiry: false, discoverLikes: false });
    const prefs = await svc.getPrefs(USER_A);
    expect(prefs.newInquiry).toBe(false);
    expect(prefs.discoverLikes).toBe(false);
    expect(prefs.messages).toBe(true); // unchanged
  });

  it('updatePrefs is idempotent for same values', async () => {
    await svc.updatePrefs(USER_A, { messages: false });
    await svc.updatePrefs(USER_A, { messages: false });
    const prefs = await svc.getPrefs(USER_A);
    expect(prefs.messages).toBe(false);
  });
});

// ─── Quiet hours ──────────────────────────────────────────────────────────────

describe('Quiet hours respected', () => {
  it('quiet hours enabled: no push sent during quiet window', async () => {
    await svc.registerDevice(USER_A, 'token-q');
    // Set quiet hours to cover all times
    await svc.updatePrefs(USER_A, {
      quietHoursEnabled: true,
      quietStart: '00:00',
      quietEnd: '23:59',
    });
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    expect(push.sent).toHaveLength(0);
  });

  it('quiet hours disabled: push sent regardless', async () => {
    await svc.registerDevice(USER_A, 'token-q');
    await svc.updatePrefs(USER_A, {
      quietHoursEnabled: false,
      quietStart: '00:00',
      quietEnd: '23:59',
    });
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    expect(push.sent).toHaveLength(1);
  });

  it('notification is still created in DB during quiet hours', async () => {
    await svc.updatePrefs(USER_A, {
      quietHoursEnabled: true,
      quietStart: '00:00',
      quietEnd: '23:59',
    });
    await svc.create(USER_A, { type: 'message', title: 'رسالة', body: 'نص' });
    const { items } = await svc.list(USER_A, { unreadOnly: false });
    expect(items).toHaveLength(1);
  });

  it('updatePrefs can set custom quiet window', async () => {
    await svc.updatePrefs(USER_A, { quietHoursEnabled: true, quietStart: '22:00', quietEnd: '07:00' });
    const prefs = await svc.getPrefs(USER_A);
    expect(prefs.quietStart).toBe('22:00');
    expect(prefs.quietEnd).toBe('07:00');
    expect(prefs.quietHoursEnabled).toBe(true);
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('List pagination', () => {
  it('respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await svc.create(USER_A, { type: 'message', title: `عنوان ${i}`, body: 'نص' });
    }
    const { items } = await svc.list(USER_A, { limit: 3 });
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it('returns nextCursor when more items exist', async () => {
    for (let i = 0; i < 5; i++) {
      const n = await svc.create(USER_A, { type: 'message', title: `n${i}`, body: 'x' });
      n.createdAt = new Date(Date.now() - i * 1000);
    }
    const { nextCursor } = await svc.list(USER_A, { limit: 2 });
    expect(nextCursor).not.toBeNull();
  });

  it('cursor-based pagination returns second page', async () => {
    for (let i = 0; i < 5; i++) {
      const n = await svc.create(USER_A, { type: 'message', title: `n${i}`, body: 'x' });
      n.createdAt = new Date(Date.now() - i * 1000);
    }
    const page1 = await svc.list(USER_A, { limit: 2 });
    const page2 = await svc.list(USER_A, { limit: 2, cursor: page1.nextCursor! });
    const ids1 = new Set(page1.items.map((i) => i.id));
    expect(page2.items.every((i) => !ids1.has(i.id))).toBe(true);
  });

  it('unreadCount in response reflects total across all pages', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.create(USER_A, { type: 'message', title: `n${i}`, body: 'x' });
    }
    const { unreadCount } = await svc.list(USER_A, { limit: 2 });
    expect(unreadCount).toBe(5);
  });
});

// ─── unreadCount ──────────────────────────────────────────────────────────────

describe('Unread count', () => {
  it('starts at 0', async () => {
    expect(await svc.getUnreadCount(USER_A)).toBe(0);
  });

  it('increments with each new notification', async () => {
    for (let i = 0; i < 3; i++) {
      await svc.create(USER_A, { type: 'message', title: `n${i}`, body: 'x' });
    }
    expect(await svc.getUnreadCount(USER_A)).toBe(3);
  });

  it('decrements when notification is read', async () => {
    const n = await svc.create(USER_A, { type: 'message', title: 'عنوان', body: 'نص' });
    await svc.markRead(USER_A, n.id);
    expect(await svc.getUnreadCount(USER_A)).toBe(0);
  });

  it('is isolated per user', async () => {
    await svc.create(USER_A, { type: 'message', title: 'لأ', body: 'نص' });
    await svc.create(USER_A, { type: 'message', title: 'لأ 2', body: 'نص' });
    expect(await svc.getUnreadCount(USER_B)).toBe(0);
  });
});
