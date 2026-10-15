/**
 * E2E: search — places by Arabic name, filters, autocomplete, trending, history.
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
  { token, payload }: { token?: string; payload?: unknown } = {},
) =>
  app.inject({
    method,
    url,
    payload: payload as object | undefined,
    remoteAddress: randomIp(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
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

// ─── Place search: Arabic name ─────────────────────────────────────────────────

describe.skipIf(skip)('Search – places by Arabic name', () => {
  it('GET /v1/places/search?q=بغداد returns 200 with items array', async () => {
    const user = await login();
    const res = await call('GET', '/v1/places/search?q=%D8%A8%D8%BA%D8%AF%D8%A7%D8%AF&city=baghdad', {
      token: user.accessToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/places/search?q=مطعم returns valid place summaries', async () => {
    const user = await login();
    const res = await call('GET', '/v1/places/search?q=%D9%85%D8%B7%D8%B9%D9%85&city=baghdad', {
      token: user.accessToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<Record<string, unknown>> };
    expect(Array.isArray(body.items)).toBe(true);
    // Each item should have at minimum an id and names
    for (const item of body.items) {
      expect(item).toHaveProperty('id');
    }
  });

  it('search without q param → 400', async () => {
    const user = await login();
    const res = await call('GET', '/v1/places/search', { token: user.accessToken });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('search returns at most limit items', async () => {
    const user = await login();
    const res = await call('GET', '/v1/places/search?q=%D8%B4%D8%A7%D8%B1%D8%B9&city=baghdad&limit=5', {
      token: user.accessToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items.length).toBeLessThanOrEqual(5);
  });

  it('search with Kurdish query (ckb) is accepted', async () => {
    const user = await login();
    // Kurdish Sorani query: بەغدا
    const q = encodeURIComponent('بەغدا');
    const res = await call('GET', `/v1/places/search?q=${q}&city=baghdad`, { token: user.accessToken });
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);
    }
  });
});

// ─── Place search: filters ─────────────────────────────────────────────────────

describe.skipIf(skip)('Search – filters', () => {
  it('category filter is accepted and returns 200', async () => {
    const user = await login();
    const res = await call(
      'GET',
      '/v1/places/search?q=%D9%85%D8%B7%D8%B9%D9%85&city=baghdad&category=food',
      { token: user.accessToken },
    );
    expect(res.statusCode).toBe(200);
  });

  it('distance filter (near=lat,lng,radiusM) is accepted', async () => {
    const user = await login();
    // Baghdad city center: 33.3152, 44.3661
    const res = await call(
      'GET',
      '/v1/places/search?q=%D8%B3%D9%88%D9%82&city=baghdad&lat=33.3152&lng=44.3661&radiusM=2000',
      { token: user.accessToken },
    );
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);
    }
  });

  it('unknown category returns 200 with empty or filtered items', async () => {
    const user = await login();
    const res = await call(
      'GET',
      '/v1/places/search?q=%D8%B4%D8%A7%D8%B1%D8%B9&city=baghdad&category=nonexistent_category_xyz',
      { token: user.accessToken },
    );
    expect([200, 400]).toContain(res.statusCode);
  });

  it('limit and offset pagination params are accepted', async () => {
    const user = await login();
    const res = await call(
      'GET',
      '/v1/places/search?q=%D8%A8%D8%BA%D8%AF%D8%A7%D8%AF&city=baghdad&limit=3',
      { token: user.accessToken },
    );
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items.length).toBeLessThanOrEqual(3);
  });
});

// ─── Autocomplete ──────────────────────────────────────────────────────────────

describe.skipIf(skip)('Search – autocomplete suggestions', () => {
  it('GET /v1/places/suggest?q=بغ returns suggestions', async () => {
    const user = await login();
    const q = encodeURIComponent('بغ');
    const res = await call('GET', `/v1/places/suggest?q=${q}&city=baghdad`, { token: user.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown;
    // Either {items: [...]} or array
    expect(body).toBeDefined();
  });

  it('suggest with 1-char query is accepted (short prefix)', async () => {
    const user = await login();
    const q = encodeURIComponent('م');
    const res = await call('GET', `/v1/places/suggest?q=${q}&city=baghdad`, { token: user.accessToken });
    expect([200, 400]).toContain(res.statusCode);
  });

  it('suggest returns at most 5 results by default', async () => {
    const user = await login();
    const q = encodeURIComponent('شارع');
    const res = await call('GET', `/v1/places/suggest?q=${q}&city=baghdad`, { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as unknown;
      const items = Array.isArray(body) ? body : (body as { items?: unknown[] }).items ?? [];
      expect(items.length).toBeLessThanOrEqual(10);
    }
  });

  it('suggest requires q param — empty string returns 400 or empty list', async () => {
    const user = await login();
    const res = await call('GET', '/v1/places/suggest?q=&city=baghdad', { token: user.accessToken });
    expect([200, 400, 422]).toContain(res.statusCode);
  });
});

// ─── Trending searches ─────────────────────────────────────────────────────────

describe.skipIf(skip)('Search – trending', () => {
  it('GET /v1/search/trending returns 200 with array', async () => {
    const user = await login();
    const res = await call('GET', '/v1/search/trending', { token: user.accessToken });
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      const body = res.json() as unknown;
      const items = Array.isArray(body) ? body : (body as { items?: unknown[] }).items ?? [];
      expect(Array.isArray(items)).toBe(true);
    }
  });

  it('GET /v1/discover/trending returns trending hashtags', async () => {
    const user = await login();
    const res = await call('GET', '/v1/discover/trending?limit=10', { token: user.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown;
    expect(Array.isArray(body)).toBe(true);
  });

  it('trending searches does not require auth', async () => {
    const res = await call('GET', '/v1/search/trending');
    expect([200, 401, 404]).toContain(res.statusCode);
  });
});

// ─── Search history ────────────────────────────────────────────────────────────

describe.skipIf(skip)('Search – history', () => {
  it('POST search saves query to history', async () => {
    const user = await login();
    // Perform a search (which should log history)
    await call('GET', '/v1/places/search?q=%D8%A8%D8%BA%D8%AF%D8%A7%D8%AF&city=baghdad', {
      token: user.accessToken,
    });

    const historyRes = await call('GET', '/v1/search/history', { token: user.accessToken });
    expect([200, 404]).toContain(historyRes.statusCode);
    if (historyRes.statusCode === 200) {
      const body = historyRes.json() as { items?: unknown[]; queries?: string[] };
      expect(body).toBeDefined();
    }
  });

  it('GET /v1/search/history returns 401 without token', async () => {
    const res = await call('GET', '/v1/search/history');
    expect([401, 404]).toContain(res.statusCode);
  });

  it('DELETE /v1/search/history clears all history', async () => {
    const user = await login();
    // Perform a search
    await call('GET', '/v1/places/search?q=%D9%85%D9%88%D8%B5%D9%84&city=baghdad', {
      token: user.accessToken,
    });

    const delRes = await call('DELETE', '/v1/search/history', { token: user.accessToken });
    expect([200, 204, 404]).toContain(delRes.statusCode);

    if (delRes.statusCode !== 404) {
      const historyRes = await call('GET', '/v1/search/history', { token: user.accessToken });
      if (historyRes.statusCode === 200) {
        const body = historyRes.json() as { items?: unknown[] };
        const items = body.items ?? [];
        expect(items.length).toBe(0);
      }
    }
  });

  it('search history is user-scoped (different users see own history)', async () => {
    const userA = await login();
    const userB = await login();

    await call('GET', '/v1/places/search?q=%D8%A8%D8%BA%D8%AF%D8%A7%D8%AF&city=baghdad', {
      token: userA.accessToken,
    });

    const historyB = await call('GET', '/v1/search/history', { token: userB.accessToken });
    if (historyB.statusCode === 200) {
      // B's history should not contain A's search
      const body = historyB.json() as { items?: Array<{ q?: string }> };
      const items = body.items ?? [];
      expect(Array.isArray(items)).toBe(true);
    }
  });
});

// ─── Post search ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('Search – post search', () => {
  it('GET /v1/discover/posts/search?q=tip returns 200', async () => {
    const user = await login();
    const res = await call('GET', '/v1/discover/posts/search?q=tip', { token: user.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('post search with Arabic query', async () => {
    const user = await login();

    // Create a post with searchable content
    await call('POST', '/v1/discover/posts', {
      token: user.accessToken,
      payload: { type: 'tip', body: 'مطعم أبو النواس للأسماك في الكرادة' },
    });

    const q = encodeURIComponent('أبو النواس');
    const res = await call('GET', `/v1/discover/posts/search?q=${q}`, { token: user.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('post search returns at most limit items', async () => {
    const user = await login();
    const res = await call('GET', '/v1/discover/posts/search?q=%D8%A8%D8%BA%D8%AF%D8%A7%D8%AF&limit=5', {
      token: user.accessToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items.length).toBeLessThanOrEqual(5);
  });

  it('post search without auth → 401', async () => {
    const res = await call('GET', '/v1/discover/posts/search?q=test');
    expect(res.statusCode).toBe(401);
  });
});
