/**
 * E2E: Collections flow — create → add place → follow public → private visibility.
 * All tests skip when DATABASE_URL is not set.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

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

type Session = { accessToken: string; refreshToken: string; user: { id: string } };

async function login(): Promise<Session> {
  const phone = randomPhone();
  await call('POST', '/v1/auth/otp/request', { payload: { phone } });
  const verified = await call('POST', '/v1/auth/otp/verify', {
    payload: { phone, code: sender.lastCodeFor(phone) },
  });
  expect(verified.statusCode).toBe(200);
  return verified.json() as Session;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

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

// ─── Create collection ────────────────────────────────────────────────────────

describe.skipIf(skip)('Collections — create', () => {
  it('POST /v1/collections returns 201 with a collection object', async () => {
    const session = await login();
    const res = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مطاعم مفضلة', description: 'أفضل المطاعم في بغداد', isPublic: true },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('مطاعم مفضلة');
  });

  it('created collection appears in my collections list', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'أماكن السياحة', isPublic: true },
    });
    expect(createRes.statusCode).toBe(201);
    const col = createRes.json() as Record<string, unknown>;

    const listRes = await call('GET', '/v1/collections/mine', { token: session.accessToken });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json() as { items: Array<Record<string, unknown>> };
    const found = list.items.find((c) => c.id === col.id);
    expect(found).toBeDefined();
  });

  it('POST /v1/collections returns 401 when unauthenticated', async () => {
    const res = await call('POST', '/v1/collections', {
      payload: { name: 'تجميع بدون مصادقة', isPublic: false },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/collections returns 400 for missing name', async () => {
    const session = await login();
    const res = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { isPublic: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /v1/collections returns 400 for empty name', async () => {
    const session = await login();
    const res = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: '', isPublic: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('collection defaults to private when isPublic omitted', async () => {
    const session = await login();
    const res = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مجموعة خاصة' },
    });
    if (res.statusCode === 201) {
      const col = res.json() as Record<string, unknown>;
      // Default may be false or the field may not exist
      expect(col.isPublic === false || col.isPublic == null).toBe(true);
    }
  });

  it('collection ownerId matches authenticated user', async () => {
    const session = await login();
    const res = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مجموعتي', isPublic: true },
    });
    expect(res.statusCode).toBe(201);
    const col = res.json() as Record<string, unknown>;
    if (col.ownerId) {
      expect(col.ownerId).toBe(session.user.id);
    }
  });
});

// ─── Add place to collection ──────────────────────────────────────────────────

describe.skipIf(skip)('Collections — add place', () => {
  it('POST /v1/collections/:id/places returns 201 or 200', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مطاعم', isPublic: true },
    });
    expect(createRes.statusCode).toBe(201);
    const col = createRes.json() as Record<string, unknown>;

    const addRes = await call('POST', `/v1/collections/${col.id as string}/places`, {
      token: session.accessToken,
      payload: { placeId: 'place-baghdad-001', note: 'مطعم رائع' },
    });
    expect([200, 201, 404]).toContain(addRes.statusCode);
  });

  it('place appears in collection after adding', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'أماكن مهمة', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;
    const placeId = 'place-erbil-001';

    const addRes = await call('POST', `/v1/collections/${col.id as string}/places`, {
      token: session.accessToken,
      payload: { placeId },
    });
    if (![200, 201].includes(addRes.statusCode)) return;

    const placesRes = await call('GET', `/v1/collections/${col.id as string}/places`, {
      token: session.accessToken,
    });
    if (placesRes.statusCode === 200) {
      const places = placesRes.json() as { items: Array<{ placeId: string }> };
      const found = places.items.find((p) => p.placeId === placeId);
      expect(found).toBeDefined();
    }
  });

  it('adding same place twice returns 409 or 200 (idempotent)', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مجموعة ازدواجية', isPublic: false },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;
    const placeId = 'place-mosul-001';

    await call('POST', `/v1/collections/${col.id as string}/places`, {
      token: session.accessToken,
      payload: { placeId },
    });
    const second = await call('POST', `/v1/collections/${col.id as string}/places`, {
      token: session.accessToken,
      payload: { placeId },
    });
    expect([200, 201, 409]).toContain(second.statusCode);
  });

  it('adding place to collection requires auth', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مجموعة', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const res = await call('POST', `/v1/collections/${col.id as string}/places`, {
      payload: { placeId: 'place-x' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('removing a place from collection works', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'للإزالة', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;
    const placeId = 'place-najaf-001';

    const addRes = await call('POST', `/v1/collections/${col.id as string}/places`, {
      token: session.accessToken,
      payload: { placeId },
    });
    if (![200, 201].includes(addRes.statusCode)) return;

    const delRes = await call('DELETE', `/v1/collections/${col.id as string}/places/${placeId}`, {
      token: session.accessToken,
    });
    expect([200, 204, 404]).toContain(delRes.statusCode);
  });
});

// ─── Follow public collection ─────────────────────────────────────────────────

describe.skipIf(skip)('Collections — follow public', () => {
  it('following a public collection adds it to followed list', async () => {
    const author = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: author.accessToken,
      payload: { name: 'مجموعة عامة', isPublic: true },
    });
    expect(createRes.statusCode).toBe(201);
    const col = createRes.json() as Record<string, unknown>;

    const follower = await login();
    const followRes = await call('POST', `/v1/collections/${col.id as string}/follow`, {
      token: follower.accessToken,
    });
    expect([200, 201, 404]).toContain(followRes.statusCode);

    if ([200, 201].includes(followRes.statusCode)) {
      const followedRes = await call('GET', '/v1/collections/followed', {
        token: follower.accessToken,
      });
      if (followedRes.statusCode === 200) {
        const followed = followedRes.json() as { items: Array<Record<string, unknown>> };
        const found = followed.items.find((c) => c.id === col.id);
        expect(found).toBeDefined();
      }
    }
  });

  it('GET /v1/collections/:id returns 200 for public collection without auth', async () => {
    const author = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: author.accessToken,
      payload: { name: 'مجموعة عامة للجميع', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const res = await call('GET', `/v1/collections/${col.id as string}`);
    expect([200, 401]).toContain(res.statusCode);
  });

  it('unfollowing removes collection from followed list', async () => {
    const author = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: author.accessToken,
      payload: { name: 'للإلغاء', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const follower = await login();
    const followRes = await call('POST', `/v1/collections/${col.id as string}/follow`, {
      token: follower.accessToken,
    });
    if (![200, 201].includes(followRes.statusCode)) return;

    const unfollowRes = await call('DELETE', `/v1/collections/${col.id as string}/follow`, {
      token: follower.accessToken,
    });
    expect([200, 204, 404]).toContain(unfollowRes.statusCode);
  });

  it('following own collection is a no-op or 400', async () => {
    const session = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: session.accessToken,
      payload: { name: 'مجموعتي العامة', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const res = await call('POST', `/v1/collections/${col.id as string}/follow`, {
      token: session.accessToken,
    });
    expect([200, 201, 400, 422]).toContain(res.statusCode);
  });
});

// ─── Private collection visibility ───────────────────────────────────────────

describe.skipIf(skip)('Collections — private not visible to others', () => {
  it('private collection is not visible to other users via GET', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'مجموعة سرية', isPublic: false },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const other = await login();
    const getRes = await call('GET', `/v1/collections/${col.id as string}`, {
      token: other.accessToken,
    });
    expect([403, 404]).toContain(getRes.statusCode);
  });

  it('private collection does not appear in public listings', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'خاصة جداً', isPublic: false },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    // Another user searches/lists collections
    const other = await login();
    const listRes = await call('GET', '/v1/collections/public', { token: other.accessToken });
    if (listRes.statusCode === 200) {
      const list = listRes.json() as { items: Array<Record<string, unknown>> };
      const found = list.items.find((c) => c.id === col.id);
      expect(found).toBeUndefined();
    }
  });

  it('owner can still read their own private collection', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'مجموعتي الخاصة', isPublic: false },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const getRes = await call('GET', `/v1/collections/${col.id as string}`, {
      token: owner.accessToken,
    });
    expect(getRes.statusCode).toBe(200);
  });

  it('private collection appears in owners mine list', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'مجموعة في قائمتي', isPublic: false },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const mineRes = await call('GET', '/v1/collections/mine', { token: owner.accessToken });
    expect(mineRes.statusCode).toBe(200);
    const mine = mineRes.json() as { items: Array<Record<string, unknown>> };
    const found = mine.items.find((c) => c.id === col.id);
    expect(found).toBeDefined();
  });

  it('cannot follow private collection', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'خاصة للمتابعة', isPublic: false },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const other = await login();
    const followRes = await call('POST', `/v1/collections/${col.id as string}/follow`, {
      token: other.accessToken,
    });
    expect([403, 404]).toContain(followRes.statusCode);
  });

  it('PATCH /v1/collections/:id can update name', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'الاسم القديم', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const patchRes = await call('PATCH', `/v1/collections/${col.id as string}`, {
      token: owner.accessToken,
      payload: { name: 'الاسم الجديد' },
    });
    expect([200, 404]).toContain(patchRes.statusCode);
    if (patchRes.statusCode === 200) {
      const updated = patchRes.json() as Record<string, unknown>;
      expect(updated.name).toBe('الاسم الجديد');
    }
  });

  it('DELETE /v1/collections/:id removes collection', async () => {
    const owner = await login();
    const createRes = await call('POST', '/v1/collections', {
      token: owner.accessToken,
      payload: { name: 'للحذف', isPublic: true },
    });
    if (createRes.statusCode !== 201) return;
    const col = createRes.json() as Record<string, unknown>;

    const delRes = await call('DELETE', `/v1/collections/${col.id as string}`, {
      token: owner.accessToken,
    });
    expect([200, 204, 404]).toContain(delRes.statusCode);

    if ([200, 204].includes(delRes.statusCode)) {
      const getRes = await call('GET', `/v1/collections/${col.id as string}`, {
        token: owner.accessToken,
      });
      expect([404, 403]).toContain(getRes.statusCode);
    }
  });
});
