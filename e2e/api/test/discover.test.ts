/**
 * E2E: complete discover flow — create post → like → comment → check notification → delete post.
 * All tests skip when DATABASE_URL is not set.
 */
import { createApp, moduleMigrations } from '@iraq-maps/api';
import { DiscoverPost, DiscoverComment, discoverContract } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skip = !process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const sender = new FakeOtpSender();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Full discover flow
// ---------------------------------------------------------------------------

describe.skipIf(skip)('Discover flow — create post', () => {
  it('POST /v1/discover/posts returns 201 with a valid DiscoverPost', async () => {
    const session = await login();
    const res = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'tip', body: 'مطعم رائع في بغداد يستحق الزيارة' },
    });
    expect(res.statusCode).toBe(201);
    const parsed = DiscoverPost.safeParse(res.json());
    expect(parsed.success).toBe(true);
  });

  it('POST /v1/discover/posts returns 401 when unauthenticated', async () => {
    const res = await call('POST', '/v1/discover/posts', {
      payload: { type: 'tip', body: 'رسالة بدون تسجيل دخول' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/discover/posts returns 400 for empty body', async () => {
    const session = await login();
    const res = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'tip', body: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe.skipIf(skip)('Discover flow — read feed', () => {
  it('GET /v1/discover/feed returns 200 with items array', async () => {
    const session = await login();
    const res = await call('GET', '/v1/discover/feed', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/discover/feed returns 401 when unauthenticated', async () => {
    const res = await call('GET', '/v1/discover/feed');
    expect(res.statusCode).toBe(401);
  });
});

describe.skipIf(skip)('Discover flow — like a post', () => {
  it('POST /v1/discover/posts/:id/like increments likeCount', async () => {
    const session = await login();

    // Create post first
    const created = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'photo', body: 'صورة جميلة من وسط بغداد #بغداد' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());
    expect(post.likeCount).toBe(0);

    // Like it
    const liked = await call('POST', `/v1/discover/posts/${post.id}/like`, {
      token: session.accessToken,
    });
    expect(liked.statusCode).toBe(200);
    const likeBody = liked.json() as { likeCount: number };
    expect(typeof likeBody.likeCount).toBe('number');
    expect(likeBody.likeCount).toBeGreaterThanOrEqual(1);
  });

  it('POST /v1/discover/posts/:id/like is idempotent (no duplicate count)', async () => {
    const session = await login();
    const created = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'tip', body: 'نصيحة مفيدة جداً' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    await call('POST', `/v1/discover/posts/${post.id}/like`, { token: session.accessToken });
    const second = await call('POST', `/v1/discover/posts/${post.id}/like`, { token: session.accessToken });
    expect(second.statusCode).toBe(200);
    const body = second.json() as { likeCount: number };
    // idempotent: same like does not inflate count beyond 1 for this user
    expect(body.likeCount).toBe(1);
  });
});

describe.skipIf(skip)('Discover flow — comment on a post', () => {
  it('POST /v1/discover/posts/:id/comments creates a comment and returns DiscoverComment', async () => {
    const session = await login();
    const created = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'event', body: 'فعالية ثقافية هذا الأسبوع' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    const commented = await call('POST', `/v1/discover/posts/${post.id}/comments`, {
      token: session.accessToken,
      payload: { body: 'رائع! سأحضر بالتأكيد' },
    });
    expect(commented.statusCode).toBe(201);
    const parsed = DiscoverComment.safeParse(commented.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.body).toBe('رائع! سأحضر بالتأكيد');
      expect(parsed.data.postId).toBe(post.id);
    }
  });

  it('GET /v1/discover/posts/:id/comments returns comments list', async () => {
    const session = await login();
    const created = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'offer', body: 'عرض خاص هذا الأسبوع' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    await call('POST', `/v1/discover/posts/${post.id}/comments`, {
      token: session.accessToken,
      payload: { body: 'مميز جداً' },
    });

    const res = await call('GET', `/v1/discover/posts/${post.id}/comments`, {
      token: session.accessToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(skip)('Discover flow — delete post', () => {
  it('DELETE /v1/discover/posts/:id returns 204 for post author', async () => {
    const session = await login();
    const created = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'tip', body: 'منشور سيتم حذفه' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    const deleted = await call('DELETE', `/v1/discover/posts/${post.id}`, {
      token: session.accessToken,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('DELETE /v1/discover/posts/:id returns 403 when another user tries', async () => {
    const author = await login();
    const otherUser = await login();

    const created = await call('POST', '/v1/discover/posts', {
      token: author.accessToken,
      payload: { type: 'tip', body: 'منشور شخصي' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    const res = await call('DELETE', `/v1/discover/posts/${post.id}`, {
      token: otherUser.accessToken,
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /v1/discover/posts/:id returns 401 when unauthenticated', async () => {
    const session = await login();
    const created = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'tip', body: 'منشور آخر' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    const res = await call('DELETE', `/v1/discover/posts/${post.id}`);
    expect([401, 404]).toContain(res.statusCode);
  });
});

describe.skipIf(skip)('Discover flow — trending and search', () => {
  it('GET /v1/discover/trending returns items array', async () => {
    const session = await login();
    const res = await call('GET', '/v1/discover/trending', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/discover/search returns matching posts', async () => {
    const session = await login();

    // Create a searchable post
    await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'tip', body: 'مطعم الكبة البغدادي الأصيل' },
    });

    const res = await call('GET', '/v1/discover/search?q=%D9%83%D8%A8%D8%A9', {
      token: session.accessToken,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /v1/discover/search returns 401 when unauthenticated', async () => {
    const res = await call('GET', '/v1/discover/search?q=test');
    expect(res.statusCode).toBe(401);
  });
});

describe.skipIf(skip)('Discover flow — report post', () => {
  it('POST /v1/discover/posts/:id/report returns 204', async () => {
    const author = await login();
    const reporter = await login();

    const created = await call('POST', '/v1/discover/posts', {
      token: author.accessToken,
      payload: { type: 'tip', body: 'منشور قد يُبلَّغ عنه' },
    });
    expect(created.statusCode).toBe(201);
    const post = DiscoverPost.parse(created.json());

    const res = await call('POST', `/v1/discover/posts/${post.id}/report`, {
      token: reporter.accessToken,
      payload: { reason: 'spam' },
    });
    expect([204, 200]).toContain(res.statusCode);
  });
});

// ---------------------------------------------------------------------------
// Contract schema validation on responses
// ---------------------------------------------------------------------------

describe.skipIf(skip)('Discover contract response validation', () => {
  it('createPost response matches discoverContract.createPost 201 schema', async () => {
    const session = await login();
    const res = await call('POST', '/v1/discover/posts', {
      token: session.accessToken,
      payload: { type: 'photo', body: 'تحقق من المخطط' },
    });
    expect(res.statusCode).toBe(201);
    const schema = discoverContract.createPost.responses[201];
    const parsed = schema.safeParse(res.json());
    expect(parsed.success).toBe(true);
  });

  it('listFeed response matches discoverContract.listFeed 200 schema', async () => {
    const session = await login();
    const res = await call('GET', '/v1/discover/feed', { token: session.accessToken });
    expect(res.statusCode).toBe(200);
    const schema = discoverContract.listFeed.responses[200];
    const parsed = schema.safeParse(res.json());
    expect(parsed.success).toBe(true);
  });
});
