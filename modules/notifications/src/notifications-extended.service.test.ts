/**
 * Extended NotificationsService tests — covers dismissNotification,
 * cursor-based pagination in listNotifications, and discoverLikes/comments prefs.
 * Tests skip when PostgreSQL is unavailable.
 */
import { type UserId } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakePushSender } from '@iraq-maps/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationsService } from './notifications.service';

const uid = (s: string) => s as UserId;

// Offset from common tests to avoid UUID conflicts
const BASE = '00000000-0000-0000-0000-0000000a';
const u = (n: number) => uid(`${BASE}${String(n).padStart(4, '0')}`);

describe('NotificationsService (extended)', () => {
  let testDb: TestDatabase | null = null;
  let svc: NotificationsService;
  let push: FakePushSender;

  beforeAll(async () => {
    try {
      testDb = await createTestDatabase();
      await testDb.db.execute(sql`CREATE SCHEMA IF NOT EXISTS notifications`);
      await testDb.db.execute(sql`
        CREATE TABLE IF NOT EXISTS notifications.device (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL,
          token text NOT NULL,
          platform text NOT NULL CHECK (platform IN ('android','ios')),
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (user_id, token)
        )
      `);
      await testDb.db.execute(sql`
        CREATE TABLE IF NOT EXISTS notifications.prefs (
          user_id uuid PRIMARY KEY,
          new_inquiry boolean NOT NULL DEFAULT true,
          reply_received boolean NOT NULL DEFAULT true,
          status_update boolean NOT NULL DEFAULT true,
          discover_likes boolean NOT NULL DEFAULT true,
          discover_comments boolean NOT NULL DEFAULT true,
          messages boolean NOT NULL DEFAULT true,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await testDb.db.execute(sql`
        CREATE TABLE IF NOT EXISTS notifications.notification (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL,
          title text NOT NULL,
          body text NOT NULL,
          data jsonb,
          read_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    } catch {
      testDb = null;
    }
  });

  afterAll(async () => {
    await testDb?.drop();
  });

  beforeEach(() => {
    if (!testDb) return;
    push = new FakePushSender();
    svc = new NotificationsService(testDb.db, push);
    push.reset();
  });

  // -------------------------------------------------------------------------
  // dismissNotification
  // -------------------------------------------------------------------------

  it('dismissNotification — removes the notification row and returns true', async () => {
    if (!testDb) return;
    const userId = u(1);
    const notifId = await svc.sendToUser(userId, { title: 'تست', body: 'رسالة اختبار' });
    const result = await svc.dismissNotification(userId, notifId);
    expect(result).toBe(true);

    // Must not appear in list anymore
    const { items } = await svc.listNotifications(userId, false);
    expect(items.find((n) => n.id === notifId)).toBeUndefined();
  });

  it('dismissNotification — returns false for non-existent notification', async () => {
    if (!testDb) return;
    const userId = u(2);
    const result = await svc.dismissNotification(userId, '00000000-0000-0000-0000-999999999998');
    expect(result).toBe(false);
  });

  it('dismissNotification — cannot dismiss another user\'s notification', async () => {
    if (!testDb) return;
    const owner = u(3);
    const other = u(4);
    const notifId = await svc.sendToUser(owner, { title: 'private', body: 'رسالة' });
    const result = await svc.dismissNotification(other, notifId);
    expect(result).toBe(false);

    // Still visible for owner
    const { items } = await svc.listNotifications(owner, false);
    expect(items.find((n) => n.id === notifId)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // listNotifications cursor pagination
  // -------------------------------------------------------------------------

  it('listNotifications — cursor pagination returns next page', async () => {
    if (!testDb) return;
    const userId = u(5);
    // Create 5 notifications
    for (let i = 0; i < 5; i++) {
      await svc.sendToUser(userId, { title: `إشعار ${i}`, body: `نص ${i}` });
    }

    const page1 = await svc.listNotifications(userId, false, undefined, 3);
    expect(page1.items).toHaveLength(3);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await svc.listNotifications(userId, false, page1.nextCursor!, 3);
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
  });

  it('listNotifications — unreadCount reflects total unread across pages', async () => {
    if (!testDb) return;
    const userId = u(6);
    for (let i = 0; i < 4; i++) {
      await svc.sendToUser(userId, { title: `إشعار ${i}`, body: `رسالة ${i}` });
    }

    const page1 = await svc.listNotifications(userId, true, undefined, 2);
    // unreadCount is total, not just this page
    expect(page1.unreadCount).toBe(4);
    expect(page1.items).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // discoverLikes / discoverComments prefs
  // -------------------------------------------------------------------------

  it('updatePrefs — can disable discoverLikes', async () => {
    if (!testDb) return;
    const userId = u(7);
    await svc.updatePrefs(userId, { discoverLikes: false });
    const prefs = await svc.getPrefs(userId);
    expect(prefs.discoverLikes).toBe(false);
    // other fields remain defaulted
    expect(prefs.newInquiry).toBe(true);
    expect(prefs.discoverComments).toBe(true);
  });

  it('updatePrefs — can disable discoverComments', async () => {
    if (!testDb) return;
    const userId = u(8);
    await svc.updatePrefs(userId, { discoverComments: false });
    const prefs = await svc.getPrefs(userId);
    expect(prefs.discoverComments).toBe(false);
    expect(prefs.discoverLikes).toBe(true);
  });

  it('updatePrefs — round-trip preserves all six fields', async () => {
    if (!testDb) return;
    const userId = u(9);
    const input = {
      newInquiry: false,
      replyReceived: false,
      statusUpdate: false,
      discoverLikes: false,
      discoverComments: false,
      messages: false,
    };
    const updated = await svc.updatePrefs(userId, input);
    expect(updated.newInquiry).toBe(false);
    expect(updated.replyReceived).toBe(false);
    expect(updated.statusUpdate).toBe(false);
    expect(updated.discoverLikes).toBe(false);
    expect(updated.discoverComments).toBe(false);
    expect(updated.messages).toBe(false);
  });

  // -------------------------------------------------------------------------
  // sendToUser — data field
  // -------------------------------------------------------------------------

  it('sendToUser — notification with data field is listed with data', async () => {
    if (!testDb) return;
    const userId = u(10);
    await svc.sendToUser(userId, {
      title: 'إعجاب',
      body: 'أعجب شخص بمنشورك',
      data: { type: 'post_liked', postId: 'post-abc' },
    });
    const { items } = await svc.listNotifications(userId, false);
    const notif = items[0];
    expect(notif?.data?.type).toBe('post_liked');
    expect(notif?.data?.postId).toBe('post-abc');
  });
});
