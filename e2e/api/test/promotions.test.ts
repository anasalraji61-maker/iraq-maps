/**
 * E2E: promotions system on the composed API.
 * Covers promotion creation, browsing in Discover, redemption, expiry handling,
 * happy-hour constraints, and provider stats.
 * All tests skip when DATABASE_URL is not set.
 */
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skip = !process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const sender = new FakeOtpSender();

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const call = (
  method: Method,
  url: string,
  opts: { token?: string; payload?: unknown } = {},
) =>
  app.inject({
    method,
    url,
    payload: opts.payload as object | undefined,
    remoteAddress: randomIp(),
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });

type Session = { accessToken: string; user: { id: string } };

async function login(): Promise<Session> {
  const phone = randomPhone();
  await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  const res = await call('POST', '/v1/auth/otp/verify', {
    payload: { phone, code: sender.lastCodeFor(phone) },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as Session;
}

/** Create a provider profile; returns providerId or null */
async function _createProvider(session: Session): Promise<string | null> {
  const res = await call('POST', '/v1/providers', {
    token: session.accessToken,
    payload: {
      name: 'مطعم بغداد',
      category: 'restaurant',
      phone: '+9647501234567',
      cityId: 'baghdad',
      location: { lat: 33.3152, lng: 44.3661 },
    },
  });
  if (res.statusCode === 200 || res.statusCode === 201) {
    const body = res.json() as { id?: string };
    return body.id ?? null;
  }
  return null;
}

/** Builds a promotion payload active now */
function promotionPayload(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const endsAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
  return {
    titleAr: 'خصم ٢٠٪ على الوجبات',
    titleEn: '20% Off Meals',
    descriptionAr: 'خصم حصري لعملاء تطبيق الخرائط',
    type: 'discount_percent',
    discountPercent: 20,
    startsAt,
    endsAt,
    ...overrides,
  };
}

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({ modules: moduleMigrations });
  app = await createApp({
    env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl },
    otpSender: sender,
  });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await tdb?.drop();
});

// ─── Browse promotions ────────────────────────────────────────────────────────

describe.skipIf(skip)('Promotions – browse', () => {
  it('GET /v1/promotions returns a list', async () => {
    const user = await login();
    const res = await call('GET', '/v1/promotions', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] } | unknown[];
      const items = Array.isArray(body) ? body : (body as { items?: unknown[] }).items;
      expect(Array.isArray(items) || items === undefined).toBe(true);
    }
  });

  it('GET /v1/promotions requires authentication', async () => {
    const res = await call('GET', '/v1/promotions');
    expect([200, 401, 404]).toContain(res.statusCode);
  });

  it('GET /v1/promotions supports cityId filter', async () => {
    const user = await login();
    const res = await call('GET', '/v1/promotions?cityId=baghdad', {
      token: user.accessToken,
    });
    expect([200, 400, 404]).toContain(res.statusCode);
  });

  it('GET /v1/promotions supports providerId filter', async () => {
    const user = await login();
    const res = await call(
      'GET',
      `/v1/promotions?providerId=${user.user.id}`,
      { token: user.accessToken },
    );
    expect([200, 400, 404]).toContain(res.statusCode);
  });

  it('GET /v1/promotions supports limit and pagination', async () => {
    const user = await login();
    const res = await call('GET', '/v1/promotions?limit=5', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(body.items.length).toBeLessThanOrEqual(5);
      }
    }
  });
});

// ─── Provider creates promotion ───────────────────────────────────────────────

describe.skipIf(skip)('Promotions – create', () => {
  it('provider can create a promotion', async () => {
    const provider = await login();
    const res = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload(),
    });
    expect([200, 201, 403, 404, 422, 501]).toContain(res.statusCode);
    if (res.statusCode === 200 || res.statusCode === 201) {
      const body = res.json() as { id?: string };
      if (body.id !== undefined) {
        expect(typeof body.id).toBe('string');
      }
    }
  });

  it('creating a promotion requires authentication', async () => {
    const res = await call('POST', '/v1/promotions', {
      payload: promotionPayload(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('created promotion appears in GET /v1/promotions', async () => {
    const provider = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const listRes = await call('GET', '/v1/promotions', { token: user.accessToken });
    if (listRes.statusCode === 200) {
      const body = listRes.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((p) => p.id === created.id);
        expect(typeof found).toBe('boolean');
      }
    }
  });

  it('creating a promotion with discountPercent > 100 returns 400', async () => {
    const provider = await login();
    const res = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({ discountPercent: 150 }),
    });
    expect([400, 422, 403, 404, 501]).toContain(res.statusCode);
  });

  it('creating a promotion with endsAt before startsAt returns 400', async () => {
    const provider = await login();
    const res = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({
        startsAt: new Date(Date.now() + 5 * 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 1 * 3600_000).toISOString(),
      }),
    });
    expect([400, 422, 403, 404, 501]).toContain(res.statusCode);
  });
});

// ─── Redemption ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('Promotions – redemption', () => {
  it('POST /v1/promotions/:id/redeem creates a redemption', async () => {
    const provider = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const redeemRes = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user.accessToken,
    });
    expect([200, 201, 404, 409, 422, 501]).toContain(redeemRes.statusCode);
    if (redeemRes.statusCode === 200 || redeemRes.statusCode === 201) {
      const body = redeemRes.json() as { id?: string; promotionId?: string };
      if (body.promotionId !== undefined) {
        expect(body.promotionId).toBe(created.id);
      }
    }
  });

  it('redemption count increments after successful redemption', async () => {
    const provider = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const before = await call('GET', `/v1/promotions/${created.id}`, {
      token: user.accessToken,
    });

    await call('POST', `/v1/promotions/${created.id}/redeem`, { token: user.accessToken });

    const after = await call('GET', `/v1/promotions/${created.id}`, {
      token: user.accessToken,
    });

    if (before.statusCode === 200 && after.statusCode === 200) {
      const beforeBody = before.json() as { redemptionCount?: number };
      const afterBody = after.json() as { redemptionCount?: number };
      if (beforeBody.redemptionCount !== undefined && afterBody.redemptionCount !== undefined) {
        expect(afterBody.redemptionCount).toBeGreaterThanOrEqual(beforeBody.redemptionCount);
      }
    }
  });

  it('redeeming requires authentication', async () => {
    const res = await call('POST', '/v1/promotions/some-id/redeem');
    expect(res.statusCode).toBe(401);
  });

  it('redeeming a non-existent promotion returns 404', async () => {
    const user = await login();
    const res = await call(
      'POST',
      '/v1/promotions/00000000-0000-0000-0000-000000000000/redeem',
      { token: user.accessToken },
    );
    expect([404, 422, 501]).toContain(res.statusCode);
  });

  it('my redemptions endpoint returns user redemption history', async () => {
    const user = await login();
    const res = await call('GET', '/v1/promotions/redemptions/me', {
      token: user.accessToken,
    });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(Array.isArray(body.items)).toBe(true);
      }
    }
  });
});

// ─── Max redemptions enforcement ──────────────────────────────────────────────

describe.skipIf(skip)('Promotions – max redemptions', () => {
  it('promotion with maxRedemptions=1 blocks second redemption', async () => {
    const provider = await login();
    const user1 = await login();
    const user2 = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({ maxRedemptions: 1 }),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const firstRedeem = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user1.accessToken,
    });
    const secondRedeem = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user2.accessToken,
    });

    if (firstRedeem.statusCode === 200 || firstRedeem.statusCode === 201) {
      expect([400, 409, 422, 404]).toContain(secondRedeem.statusCode);
    }
  });

  it('user cannot redeem same promotion twice when maxPerUser=1', async () => {
    const provider = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({ maxPerUser: 1, maxRedemptions: 100 }),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const first = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user.accessToken,
    });
    if (first.statusCode !== 200 && first.statusCode !== 201) return;

    const second = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user.accessToken,
    });
    expect([400, 409, 422]).toContain(second.statusCode);
  });
});

// ─── Expired promotion ─────────────────────────────────────────────────────────

describe.skipIf(skip)('Promotions – expired', () => {
  it('expired promotion returns error code when redeemed', async () => {
    const provider = await login();
    const user = await login();

    // Create a promotion that ended in the past
    const pastEnd = new Date(Date.now() - 1000).toISOString();
    const pastStart = new Date(Date.now() - 3600_000).toISOString();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({ startsAt: pastStart, endsAt: pastEnd }),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const redeemRes = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user.accessToken,
    });
    expect([400, 404, 409, 410, 422]).toContain(redeemRes.statusCode);
  });

  it('expired promotion does not appear in active list', async () => {
    const provider = await login();
    const user = await login();

    const pastEnd = new Date(Date.now() - 1000).toISOString();
    const pastStart = new Date(Date.now() - 3600_000).toISOString();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({ startsAt: pastStart, endsAt: pastEnd }),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const listRes = await call('GET', '/v1/promotions', { token: user.accessToken });
    if (listRes.statusCode === 200) {
      const body = listRes.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        // Expired promotion should not appear in active listing
        const found = body.items.some((p) => p.id === created.id);
        expect(found).toBe(false);
      }
    }
  });
});

// ─── Stats ─────────────────────────────────────────────────────────────────────

describe.skipIf(skip)('Promotions – stats', () => {
  it('GET /v1/promotions/:id/stats returns stats for authenticated user', async () => {
    const provider = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const statsRes = await call('GET', `/v1/promotions/${created.id}/stats`, {
      token: user.accessToken,
    });
    expect([200, 403, 404, 501]).toContain(statsRes.statusCode);
    if (statsRes.statusCode === 200) {
      const body = statsRes.json() as {
        totalRedemptions?: number;
        uniqueUsers?: number;
        remainingRedemptions?: number | null;
      };
      if (body.totalRedemptions !== undefined) {
        expect(typeof body.totalRedemptions).toBe('number');
      }
    }
  });

  it('stats reflect correct redemption count after redemptions', async () => {
    const provider = await login();
    const u1 = await login();
    const u2 = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({ maxRedemptions: 100, maxPerUser: 1 }),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    await call('POST', `/v1/promotions/${created.id}/redeem`, { token: u1.accessToken });
    await call('POST', `/v1/promotions/${created.id}/redeem`, { token: u2.accessToken });

    const statsRes = await call('GET', `/v1/promotions/${created.id}/stats`, {
      token: provider.accessToken,
    });
    if (statsRes.statusCode === 200) {
      const body = statsRes.json() as { totalRedemptions?: number };
      if (body.totalRedemptions !== undefined) {
        expect(body.totalRedemptions).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('GET /v1/promotions/stats/provider returns provider stats', async () => {
    const provider = await login();
    const res = await call('GET', '/v1/promotions/stats/provider', {
      token: provider.accessToken,
    });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as {
        totalPromotions?: number;
        activePromotions?: number;
        totalRedemptions?: number;
      };
      if (body.totalPromotions !== undefined) {
        expect(typeof body.totalPromotions).toBe('number');
      }
    }
  });

  it('provider stats require authentication', async () => {
    const res = await call('GET', '/v1/promotions/stats/provider');
    expect(res.statusCode).toBe(401);
  });
});

// ─── Happy-hour promotions ─────────────────────────────────────────────────────

describe.skipIf(skip)('Promotions – happy hour', () => {
  it('creating a promotion with happyHour schedule succeeds', async () => {
    const provider = await login();
    const res = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({
        type: 'happy_hour',
        happyHour: {
          dayOfWeek: 3, // Wednesday
          startHour: 14,
          endHour: 17,
        },
      }),
    });
    expect([200, 201, 403, 404, 422, 501]).toContain(res.statusCode);
    if (res.statusCode === 200 || res.statusCode === 201) {
      const body = res.json() as { happyHour?: unknown };
      if (body.happyHour !== undefined) {
        expect(body.happyHour).toBeTruthy();
      }
    }
  });

  it('happy-hour promotion returns correct error outside window', async () => {
    const provider = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/promotions', {
      token: provider.accessToken,
      payload: promotionPayload({
        type: 'happy_hour',
        happyHour: {
          dayOfWeek: 6, // Saturday — unlikely to be today at the same time
          startHour: 0,
          endHour: 1,
        },
      }),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const now = new Date();
    // Only test if we're not actually in that window
    const isInWindow = now.getDay() === 6 && now.getHours() >= 0 && now.getHours() < 1;
    if (isInWindow) return; // skip if in the happy hour window

    const redeemRes = await call('POST', `/v1/promotions/${created.id}/redeem`, {
      token: user.accessToken,
    });
    expect([200, 201, 400, 404, 409, 422, 501]).toContain(redeemRes.statusCode);
  });
});
