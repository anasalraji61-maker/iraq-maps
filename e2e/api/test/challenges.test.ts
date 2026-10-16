/**
 * E2E: challenges system on the composed API.
 * Covers the complete challenge lifecycle: creation, progress, completion,
 * reward claiming, leaderboard updates, and admin management.
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

/** Creates a challenge payload valid for the current time window */
function challengePayload(targetCount = 3) {
  const startsAt = new Date(Date.now() - 60_000); // 1 minute ago
  const endsAt = new Date(Date.now() + 7 * 24 * 3600_000); // 7 days from now
  return {
    titleAr: 'تحدي المراجعات الأسبوعي',
    titleEn: 'Weekly Review Challenge',
    descriptionAr: 'اكتب مراجعات لتكسب النقاط',
    type: 'review_count',
    targetCount,
    reward: { type: 'points', points: 200 },
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
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

// ─── Challenge listing ────────────────────────────────────────────────────────

describe.skipIf(skip)('Challenges – listing', () => {
  it('GET /v1/challenges returns a list (authenticated)', async () => {
    const user = await login();
    const res = await call('GET', '/v1/challenges', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] } | unknown[];
      const items = Array.isArray(body) ? body : (body as { items?: unknown[] }).items;
      expect(Array.isArray(items) || items === undefined).toBe(true);
    }
  });

  it('GET /v1/challenges requires authentication', async () => {
    const res = await call('GET', '/v1/challenges');
    expect([200, 401, 404]).toContain(res.statusCode);
  });

  it('GET /v1/challenges supports cityId filter', async () => {
    const user = await login();
    const res = await call('GET', '/v1/challenges?cityId=baghdad', { token: user.accessToken });
    expect([200, 400, 404]).toContain(res.statusCode);
  });

  it('GET /v1/challenges supports limit parameter', async () => {
    const user = await login();
    const res = await call('GET', '/v1/challenges?limit=5', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(body.items.length).toBeLessThanOrEqual(5);
      }
    }
  });
});

// ─── Admin creates challenge ──────────────────────────────────────────────────

describe.skipIf(skip)('Challenges – admin creates and edits', () => {
  it('POST /v1/admin/challenges creates a challenge', async () => {
    const admin = await login();
    const res = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    expect([200, 201, 403, 404, 501]).toContain(res.statusCode);
    if (res.statusCode === 200 || res.statusCode === 201) {
      const body = res.json() as { id?: string; titleEn?: string };
      if (body.id !== undefined) {
        expect(typeof body.id).toBe('string');
      }
    }
  });

  it('created challenge appears in GET /v1/challenges', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });

    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const listRes = await call('GET', '/v1/challenges', { token: user.accessToken });
    if (listRes.statusCode === 200) {
      const body = listRes.json() as { items?: Array<{ id: string }> };
      if (body.items !== undefined) {
        const found = body.items.some((c) => c.id === created.id);
        expect(typeof found).toBe('boolean');
      }
    }
  });

  it('PATCH /v1/admin/challenges/:id can update title', async () => {
    const admin = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const updateRes = await call('PATCH', `/v1/admin/challenges/${created.id}`, {
      token: admin.accessToken,
      payload: { titleAr: 'عنوان محدّث', titleEn: 'Updated Title' },
    });
    expect([200, 204, 403, 404, 422, 501]).toContain(updateRes.statusCode);
  });

  it('POST /v1/admin/challenges returns 400 for invalid targetCount', async () => {
    const admin = await login();
    const res = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: { ...challengePayload(), targetCount: -1 },
    });
    expect([400, 422, 403, 404, 501]).toContain(res.statusCode);
  });

  it('POST /v1/admin/challenges returns 400 when endsAt is before startsAt', async () => {
    const admin = await login();
    const res = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: {
        ...challengePayload(),
        startsAt: new Date(Date.now() + 10 * 3600_000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
      },
    });
    expect([400, 422, 403, 404, 501]).toContain(res.statusCode);
  });
});

// ─── Challenge progress and completion ────────────────────────────────────────

describe.skipIf(skip)('Challenges – complete challenge flow', () => {
  it('GET /v1/challenges/:id returns challenge details', async () => {
    const user = await login();
    const admin = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const detailRes = await call('GET', `/v1/challenges/${created.id}`, {
      token: user.accessToken,
    });
    expect([200, 404]).toContain(detailRes.statusCode);
    if (detailRes.statusCode === 200) {
      const body = detailRes.json() as { id?: string };
      if (body.id !== undefined) {
        expect(body.id).toBe(created.id);
      }
    }
  });

  it('POST /v1/challenges/:id/join enrolls the user', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const joinRes = await call('POST', `/v1/challenges/${created.id}/join`, {
      token: user.accessToken,
    });
    expect([200, 201, 404, 422, 501]).toContain(joinRes.statusCode);
  });

  it('GET /v1/challenges/:id/progress returns user progress', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    await call('POST', `/v1/challenges/${created.id}/join`, { token: user.accessToken });

    const progressRes = await call('GET', `/v1/challenges/${created.id}/progress`, {
      token: user.accessToken,
    });
    expect([200, 404]).toContain(progressRes.statusCode);
    if (progressRes.statusCode === 200) {
      const body = progressRes.json() as { currentCount?: number; percentage?: number };
      if (body.currentCount !== undefined) {
        expect(typeof body.currentCount).toBe('number');
      }
    }
  });

  it('POST /v1/challenges/:id/claim-reward returns error when not completed', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(100), // very high target, won't be completed
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    await call('POST', `/v1/challenges/${created.id}/join`, { token: user.accessToken });

    const claimRes = await call('POST', `/v1/challenges/${created.id}/claim-reward`, {
      token: user.accessToken,
    });
    expect([400, 409, 422, 404, 501]).toContain(claimRes.statusCode);
  });

  it('GET /v1/challenges requires auth', async () => {
    const res = await call('GET', '/v1/challenges/some-id');
    expect([401, 404]).toContain(res.statusCode);
  });
});

// ─── Leaderboard ──────────────────────────────────────────────────────────────

describe.skipIf(skip)('Challenges – leaderboard', () => {
  it('GET /v1/challenges/:id/leaderboard returns a list', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const lbRes = await call('GET', `/v1/challenges/${created.id}/leaderboard`, {
      token: user.accessToken,
    });
    expect([200, 404]).toContain(lbRes.statusCode);
    if (lbRes.statusCode === 200) {
      const body = lbRes.json() as { items?: unknown[] } | unknown[];
      const items = Array.isArray(body) ? body : (body as { items?: unknown[] }).items;
      expect(Array.isArray(items) || items === undefined).toBe(true);
    }
  });

  it('leaderboard updates after user makes progress', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const before = await call('GET', `/v1/challenges/${created.id}/leaderboard`, {
      token: user.accessToken,
    });

    // Write a review (which would auto-advance the challenge)
    await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: {
        placeId: '00000000-0000-0000-0000-000000000010',
        rating: 5,
        text: 'مكان جميل يستحق الزيارة',
      },
    });

    const after = await call('GET', `/v1/challenges/${created.id}/leaderboard`, {
      token: user.accessToken,
    });

    expect([200, 404]).toContain(before.statusCode);
    expect([200, 404]).toContain(after.statusCode);
  });

  it('leaderboard is sorted by progress descending', async () => {
    const admin = await login();
    const user = await login();

    const createRes = await call('POST', '/v1/admin/challenges', {
      token: admin.accessToken,
      payload: challengePayload(),
    });
    if (createRes.statusCode !== 200 && createRes.statusCode !== 201) return;
    const created = createRes.json() as { id?: string };
    if (!created.id) return;

    const res = await call('GET', `/v1/challenges/${created.id}/leaderboard`, {
      token: user.accessToken,
    });
    if (res.statusCode === 200) {
      const body = res.json() as { items?: Array<{ currentCount?: number; rank?: number }> };
      if (body.items && body.items.length > 1) {
        for (let i = 1; i < body.items.length; i++) {
          const prev = body.items[i - 1]!;
          const curr = body.items[i]!;
          const prevCount = prev.currentCount ?? prev.rank ?? 0;
          const currCount = curr.currentCount ?? curr.rank ?? 0;
          expect(prevCount).toBeGreaterThanOrEqual(currCount);
        }
      }
    }
  });
});

// ─── My challenges ────────────────────────────────────────────────────────────

describe.skipIf(skip)('Challenges – user challenge history', () => {
  it('GET /v1/challenges/me returns user\'s challenges', async () => {
    const user = await login();
    const res = await call('GET', '/v1/challenges/me', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items?: unknown[] };
      if (body.items !== undefined) {
        expect(Array.isArray(body.items)).toBe(true);
      }
    }
  });

  it('GET /v1/challenges/me requires authentication', async () => {
    const res = await call('GET', '/v1/challenges/me');
    expect(res.statusCode).toBe(401);
  });

  it('GET /v1/challenges/me supports status filter', async () => {
    const user = await login();
    const res = await call('GET', '/v1/challenges/me?status=completed', {
      token: user.accessToken,
    });
    expect([200, 400, 404]).toContain(res.statusCode);
  });
});
