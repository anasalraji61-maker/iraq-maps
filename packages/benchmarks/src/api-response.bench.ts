/**
 * API response-time benchmarks — measure p50/p95/p99 for key endpoints.
 * Skips automatically when DATABASE_URL is not set.
 *
 * Run with:  pnpm --filter @iraq-maps/benchmarks bench
 */
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, bench, describe } from 'vitest';

const skip = !process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const sender = new FakeOtpSender();

// Cached session for authenticated endpoints
let accessToken: string | null = null;
let _refreshToken: string | null = null;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const call = (method: Method, url: string, opts: { token?: string; payload?: object } = {}) =>
  app.inject({
    method,
    url,
    payload: opts.payload,
    remoteAddress: randomIp(),
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({ modules: moduleMigrations });
  app = await createApp({
    env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl },
    otpSender: sender,
    logger: false,
  });

  // Warm up: create an authenticated session for use by auth-required benchmarks
  const phone = randomPhone();
  await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  const res = await call('POST', '/v1/auth/otp/verify', {
    payload: { phone, code: sender.lastCodeFor(phone) },
  });
  const body = res.json() as { accessToken: string; refreshToken: string };
  accessToken = body.accessToken;
  _refreshToken = body.refreshToken;
});

afterAll(async () => {
  await app?.close();
  await tdb?.drop();
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('auth endpoints', () => {
  bench('POST /v1/auth/otp/request — rate limit check + send', async () => {
    const phone = randomPhone();
    await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  });

  bench('GET /v1/me — JWT verify + DB user lookup', async () => {
    await call('GET', '/v1/me', { token: accessToken! });
  });

  bench('POST /v1/auth/refresh — token rotation', async () => {
    // NOTE: each bench call rotates the token; we re-fetch to avoid cascading failures
    const phone = randomPhone();
    await call('POST', '/v1/auth/otp/request', { payload: { phone } });
    const r = await call('POST', '/v1/auth/otp/verify', {
      payload: { phone, code: sender.lastCodeFor(phone) },
    });
    const session = r.json() as { accessToken: string; refreshToken: string };
    await call('POST', '/v1/auth/refresh', { payload: { refreshToken: session.refreshToken } });
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('notification endpoints', () => {
  bench('GET /v1/notification-prefs', async () => {
    await call('GET', '/v1/notification-prefs', { token: accessToken! });
  });

  bench('GET /v1/notifications (empty)', async () => {
    await call('GET', '/v1/notifications', { token: accessToken! });
  });

  bench('GET /v1/notifications/digest', async () => {
    await call('GET', '/v1/notifications/digest', { token: accessToken! });
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('provider endpoints', () => {
  bench('GET /v1/providers/me (no provider — 404 path)', async () => {
    await call('GET', '/v1/providers/me', { token: accessToken! });
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('unauthenticated rejection', () => {
  bench('GET /v1/me without token — 401 fast path', async () => {
    await call('GET', '/v1/me');
  });

  bench('GET /v1/notifications without token — 401 fast path', async () => {
    await call('GET', '/v1/notifications');
  });
});
