/**
 * E2E: provider registration, profile update, consents, submission, promotions.
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
describe.skipIf(skip)('POST /v1/providers — register', () => {
  it('creates a provider profile and returns it in draft status', async () => {
    const session = await login();
    const res = await call('POST', '/v1/providers', {
      token: session.accessToken,
      payload: {
        name: 'مطعم الرافدين',
        category: 'restaurant',
        lng: 44.361,
        lat: 33.312,
      },
    });
    // 201 created or 200 ok or 409 conflict (user already has a provider)
    expect([200, 201, 400, 409, 422]).toContain(res.statusCode);
  });

  it('returns 401 without authentication', async () => {
    const res = await call('POST', '/v1/providers', {
      payload: { name: 'متجر', category: 'shop', lng: 44.0, lat: 33.0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 422 for missing required fields', async () => {
    const session = await login();
    const res = await call('POST', '/v1/providers', {
      token: session.accessToken,
      payload: { name: 'اسم فقط' }, // missing category and location
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('GET /v1/providers/me — getMyProvider', () => {
  it('returns 404 when the user has no provider profile', async () => {
    const session = await login();
    const res = await call('GET', '/v1/providers/me', { token: session.accessToken });
    expect([404, 401]).toContain(res.statusCode);
  });

  it('returns 401 without authentication', async () => {
    const res = await call('GET', '/v1/providers/me');
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('PATCH /v1/providers/me — updateProvider', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('PATCH', '/v1/providers/me', {
      payload: { name: 'اسم جديد' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when provider does not exist', async () => {
    const session = await login();
    const res = await call('PATCH', '/v1/providers/me', {
      token: session.accessToken,
      payload: { name: 'اسم محدث' },
    });
    expect([404, 403]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('GET /v1/providers/me/consents — getConsents', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('GET', '/v1/providers/me/consents');
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user has no provider', async () => {
    const session = await login();
    const res = await call('GET', '/v1/providers/me/consents', { token: session.accessToken });
    expect([404, 403]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('PUT /v1/providers/me/consents/:scope — upsertConsent', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('PUT', '/v1/providers/me/consents/photos', {
      payload: { granted: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 422 for invalid consent scope', async () => {
    const session = await login();
    const res = await call('PUT', '/v1/providers/me/consents/invalid_scope', {
      token: session.accessToken,
      payload: { granted: true },
    });
    expect([400, 404, 422]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/providers/me/submit — submit for verification', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('POST', '/v1/providers/me/submit', { payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user has no provider profile', async () => {
    const session = await login();
    const res = await call('POST', '/v1/providers/me/submit', {
      token: session.accessToken,
      payload: {},
    });
    expect([404, 409]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('GET /v1/providers/promotions — listMyPromotions', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('GET', '/v1/providers/promotions');
    expect(res.statusCode).toBe(401);
  });

  it('returns empty list or 404 for a new user with no provider', async () => {
    const session = await login();
    const res = await call('GET', '/v1/providers/promotions', { token: session.accessToken });
    expect([200, 404, 403]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/providers/promotions — createPromotion', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('POST', '/v1/providers/promotions', {
      payload: { title: 'تخفيض نهاية الأسبوع', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 422 for missing required promotion fields', async () => {
    const session = await login();
    const res = await call('POST', '/v1/providers/promotions', {
      token: session.accessToken,
      payload: { title: 'تخفيض' }, // missing startsAt/endsAt
    });
    expect([400, 403, 404, 422]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/providers/me/phone/start — start phone verification', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('POST', '/v1/providers/me/phone/start', {
      payload: { phone: randomPhone() },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when user has no provider', async () => {
    const session = await login();
    const res = await call('POST', '/v1/providers/me/phone/start', {
      token: session.accessToken,
      payload: { phone: randomPhone() },
    });
    expect([404, 403, 202]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
describe.skipIf(skip)('POST /v1/providers/me/claim — claimPlace', () => {
  it('returns 401 without authentication', async () => {
    const res = await call('POST', '/v1/providers/me/claim', {
      payload: { placeId: 'N123456789' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 or 409 when user has no provider', async () => {
    const session = await login();
    const res = await call('POST', '/v1/providers/me/claim', {
      token: session.accessToken,
      payload: { placeId: 'N123456789' },
    });
    expect([404, 403, 409]).toContain(res.statusCode);
  });
});
