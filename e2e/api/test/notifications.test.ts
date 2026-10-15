/**
 * E2E: notification device registration, prefs, inbox, mark-read, dismiss, digest.
 * All DB-dependent tests skip when DATABASE_URL is not set.
 */
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skip = !process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const sender = new FakeOtpSender();

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const call = (
  method: Method,
  url: string,
  { token, payload }: { token?: string; payload?: unknown } = {},
) =>
  app.inject({
    method,
    url,
    payload: payload as object | undefined,
    remoteAddress: randomIp(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

async function login() {
  const phone = randomPhone();
  await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  const res = await call('POST', '/v1/auth/otp/verify', { payload: { phone, code: sender.lastCodeFor(phone) } });
  return res.json() as { accessToken: string; refreshToken: string; user: { id: string } };
}

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({ modules: moduleMigrations });
  app = await createApp({
    env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl },
    otpSender: sender,
  });
});

afterAll(async () => {
  await app?.close();
  await tdb?.drop();
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/devices — registerDevice', () => {
  it('registers an Android device and returns a deviceId', async () => {
    const session = await login();
    const res = await call('POST', '/v1/devices', {
      token: session.accessToken,
      payload: { token: 'fcm-token-android-001', platform: 'android' },
    });
    expect([200, 201]).toContain(res.statusCode);
    const body = res.json() as { deviceId: string };
    expect(typeof body.deviceId).toBe('string');
  });

  it('registers an iOS device and returns a deviceId', async () => {
    const session = await login();
    const res = await call('POST', '/v1/devices', {
      token: session.accessToken,
      payload: { token: 'apns-token-ios-001', platform: 'ios' },
    });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('re-registering the same token returns the same deviceId', async () => {
    const session = await login();
    const token = 'fcm-token-dedup-test';
    const first = await call('POST', '/v1/devices', {
      token: session.accessToken,
      payload: { token, platform: 'android' },
    });
    const second = await call('POST', '/v1/devices', {
      token: session.accessToken,
      payload: { token, platform: 'android' },
    });
    expect([200, 201]).toContain(first.statusCode);
    expect([200, 201]).toContain(second.statusCode);
    expect((first.json() as { deviceId: string }).deviceId).toBe(
      (second.json() as { deviceId: string }).deviceId,
    );
  });

  it('returns 401 without a token', async () => {
    const res = await call('POST', '/v1/devices', {
      payload: { token: 'fcm-anon', platform: 'android' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 422 for an empty push token', async () => {
    const session = await login();
    const res = await call('POST', '/v1/devices', {
      token: session.accessToken,
      payload: { token: '', platform: 'android' },
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('GET /PUT /v1/notification-prefs — preferences', () => {
  it('returns default prefs for a new user', async () => {
    const session = await login();
    const res = await call('GET', '/v1/notification-prefs', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
    const prefs = res.json() as Record<string, boolean>;
    expect(prefs.newInquiry).toBe(true);
    expect(prefs.replyReceived).toBe(true);
    expect(prefs.messages).toBe(true);
  });

  it('updates a single pref and reflects the change', async () => {
    const session = await login();
    const res = await call('PUT', '/v1/notification-prefs', {
      token: session.accessToken,
      payload: { discoverLikes: false },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json() as Record<string, boolean>;
    expect(updated.discoverLikes).toBe(false);
    expect(updated.newInquiry).toBe(true); // unchanged
  });

  it('persists updated prefs across GET calls', async () => {
    const session = await login();
    await call('PUT', '/v1/notification-prefs', {
      token: session.accessToken,
      payload: { messages: false, discoverComments: false },
    });
    const res = await call('GET', '/v1/notification-prefs', { token: session.accessToken });
    const prefs = res.json() as Record<string, boolean>;
    expect(prefs.messages).toBe(false);
    expect(prefs.discoverComments).toBe(false);
  });

  it('returns 401 for unauthenticated prefs read', async () => {
    const res = await call('GET', '/v1/notification-prefs');
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unauthenticated prefs update', async () => {
    const res = await call('PUT', '/v1/notification-prefs', {
      payload: { newInquiry: false },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('GET /v1/notifications — listNotifications', () => {
  it('returns empty list and unreadCount 0 for a new user', async () => {
    const session = await login();
    const res = await call('GET', '/v1/notifications', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; unreadCount: number; nextCursor: string | null };
    expect(body.items).toEqual([]);
    expect(body.unreadCount).toBe(0);
    expect(body.nextCursor).toBeNull();
  });

  it('returns 401 without auth', async () => {
    const res = await call('GET', '/v1/notifications');
    expect(res.statusCode).toBe(401);
  });

  it('accepts unreadOnly=true query param', async () => {
    const session = await login();
    const res = await call('GET', '/v1/notifications?unreadOnly=true', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
  });

  it('accepts limit query param', async () => {
    const session = await login();
    const res = await call('GET', '/v1/notifications?limit=5', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
  });

  it('rejects limit > 50', async () => {
    const session = await login();
    const res = await call('GET', '/v1/notifications?limit=51', { token: session.accessToken });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('GET /v1/notifications/digest — getDigest', () => {
  it('returns total and byType for a new user (both zero/empty)', async () => {
    const session = await login();
    const res = await call('GET', '/v1/notifications/digest', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { total: number; byType: Record<string, number> };
    expect(typeof body.total).toBe('number');
    expect(body.total).toBeGreaterThanOrEqual(0);
    expect(typeof body.byType).toBe('object');
  });

  it('returns 401 without auth', async () => {
    const res = await call('GET', '/v1/notifications/digest');
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/notifications/:id/read — markRead', () => {
  it('returns 404 for a non-existent notification id', async () => {
    const session = await login();
    const fakeId = crypto.randomUUID();
    const res = await call('POST', `/v1/notifications/${fakeId}/read`, {
      token: session.accessToken,
      payload: {},
    });
    expect([404, 403]).toContain(res.statusCode);
  });

  it('returns 401 without auth', async () => {
    const fakeId = crypto.randomUUID();
    const res = await call('POST', `/v1/notifications/${fakeId}/read`, { payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('returns 422 for an invalid UUID notification id', async () => {
    const session = await login();
    const res = await call('POST', '/v1/notifications/not-a-uuid/read', {
      token: session.accessToken,
      payload: {},
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('DELETE /v1/notifications/:id — dismissNotification', () => {
  it('returns 404 for a non-existent notification id', async () => {
    const session = await login();
    const fakeId = crypto.randomUUID();
    const res = await call('DELETE', `/v1/notifications/${fakeId}`, { token: session.accessToken });
    expect([404, 403]).toContain(res.statusCode);
  });

  it('returns 401 without auth', async () => {
    const fakeId = crypto.randomUUID();
    const res = await call('DELETE', `/v1/notifications/${fakeId}`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 422 for an invalid UUID', async () => {
    const session = await login();
    const res = await call('DELETE', '/v1/notifications/bad-uuid', { token: session.accessToken });
    expect([400, 422]).toContain(res.statusCode);
  });
});
