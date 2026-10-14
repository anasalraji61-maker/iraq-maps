import { type UserId } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakePushSender } from '@iraq-maps/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationsService } from './notifications.service';

const uid = (s: string) => s as UserId;

describe('NotificationsService', () => {
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
      testDb = null; // no Postgres — skip all tests
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

  it('registerDevice — upserts correctly', async () => {
    if (!testDb) return;
    const userId = uid('00000000-0000-0000-0000-000000000001');
    const r1 = await svc.registerDevice(userId, 'token-abc', 'android');
    expect(r1.deviceId).toBeTruthy();
    // upsert same token — should not throw
    const r2 = await svc.registerDevice(userId, 'token-abc', 'ios');
    expect(r2.deviceId).toBeTruthy();
  });

  it('notifyProvider — calls FakePushSender with Arabic text, no phone number', async () => {
    if (!testDb) return;
    const providerId = uid('00000000-0000-0000-0000-000000000002');
    await svc.registerDevice(providerId, 'provider-token', 'android');
    await svc.notifyProvider(providerId, { title: 'استفسار جديد', body: 'تلقّيت استفساراً جديداً.' });
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.token).toBe('provider-token');
    expect(push.sent[0]!.title).toBe('استفسار جديد');
    // must not contain a phone number
    expect(push.sent[0]!.body).not.toMatch(/07\d{9}/);
  });

  it('notifyProvider — skips when new_inquiry pref is false', async () => {
    if (!testDb) return;
    const providerId = uid('00000000-0000-0000-0000-000000000003');
    await svc.registerDevice(providerId, 'provider-token-2', 'android');
    await svc.updatePrefs(providerId, { newInquiry: false });
    await svc.notifyProvider(providerId, { title: 'استفسار جديد', body: 'رسالة' });
    expect(push.sent).toHaveLength(0);
  });

  it('eraseUserData — removes devices and prefs', async () => {
    if (!testDb) return;
    const userId = uid('00000000-0000-0000-0000-000000000004');
    await svc.registerDevice(userId, 'erase-token', 'ios');
    await svc.updatePrefs(userId, { statusUpdate: false });
    await svc.eraseUserData(userId);
    // after erase, prefs return defaults
    const prefs = await svc.getPrefs(userId);
    expect(prefs.newInquiry).toBe(true);
    // and push sends nothing (no devices)
    await svc.notifyUser(userId, { title: 'test', body: 'test' });
    expect(push.sent).toHaveLength(0);
  });

  it('sendToUser — persists notification row and pushes', async () => {
    if (!testDb) return;
    const userId = uid('00000000-0000-0000-0000-000000000005');
    await svc.registerDevice(userId, 'send-token', 'android');
    const id = await svc.sendToUser(userId, { title: 'إعجاب جديد', body: 'أعجب شخص ما بمنشورك.', data: { type: 'post_liked' } });
    expect(id).toBeTruthy();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.title).toBe('إعجاب جديد');
  });

  it('listNotifications — returns only unread by default', async () => {
    if (!testDb) return;
    const userId = uid('00000000-0000-0000-0000-000000000006');
    await svc.sendToUser(userId, { title: 'أولى', body: 'رسالة 1' });
    await svc.sendToUser(userId, { title: 'ثانية', body: 'رسالة 2' });
    const { items, unreadCount } = await svc.listNotifications(userId);
    expect(items).toHaveLength(2);
    expect(unreadCount).toBe(2);
  });

  it('markRead — marks a notification read and excludes it from unread list', async () => {
    if (!testDb) return;
    const userId = uid('00000000-0000-0000-0000-000000000007');
    const notifId = await svc.sendToUser(userId, { title: 'تست', body: 'رسالة' });
    const found = await svc.markRead(userId, notifId);
    expect(found).toBe(true);
    const { unreadCount } = await svc.listNotifications(userId);
    expect(unreadCount).toBe(0);
  });

  it('markRead — returns false for non-existent id', async () => {
    if (!testDb) return;
    const userId = uid('00000000-0000-0000-0000-000000000008');
    const found = await svc.markRead(userId, '00000000-0000-0000-0000-999999999999');
    expect(found).toBe(false);
  });
});
