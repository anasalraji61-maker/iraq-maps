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
});
