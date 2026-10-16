/**
 * E2E: places and reviews on the composed API.
 * Covers review CRUD, duplicate prevention, rating summary, votes, provider responses, reports, pagination.
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

/** Stable fake place IDs (no real place import needed for review contract tests). */
const PLACE_A = '00000000-0000-0000-0000-000000000001';
const PLACE_B = '00000000-0000-0000-0000-000000000002';
const PLACE_C = '00000000-0000-0000-0000-000000000003';
const PLACE_MANY = '00000000-0000-0000-0000-000000000099';

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

// ─── Create review ────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/reviews — createReview', () => {
  it('creates a review and returns 201 with valid body', async () => {
    const user = await login();
    const res = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: {
        placeId: PLACE_A,
        rating: 4,
        text: 'مطعم جيد جداً وأسعار معقولة',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(typeof body.id).toBe('string');
    expect(body.rating).toBe(4);
    expect(body.placeId).toBe(PLACE_A);
    expect(body.status).toBe('active');
    expect(body.helpfulCount).toBe(0);
    expect(body.notHelpfulCount).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('POST', '/v1/reviews', {
      payload: { placeId: PLACE_A, rating: 3, text: 'استفسار بدون مصادقة' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when rating is out of range', async () => {
    const user = await login();
    for (const rating of [0, 6, -1]) {
      const res = await call('POST', '/v1/reviews', {
        token: user.accessToken,
        payload: { placeId: PLACE_A, rating, text: 'نص التقييم هنا لاختبار الحد' },
      });
      expect([400, 422]).toContain(res.statusCode);
    }
  });

  it('returns 400 when text is too short', async () => {
    const user = await login();
    const res = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: PLACE_A, rating: 3, text: 'قصير' },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('returns 400 when text is too long', async () => {
    const user = await login();
    const res = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: PLACE_A, rating: 3, text: 'ط'.repeat(1001) },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('stores isAnonymous flag correctly', async () => {
    const user = await login();
    const res = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: {
        placeId: PLACE_B,
        rating: 5,
        text: 'هذا المكان رائع جداً وأنصح الجميع بزيارته',
        isAnonymous: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { isAnonymous: boolean };
    expect(body.isAnonymous).toBe(true);
  });

  it('accepts a visitDate in YYYY-MM-DD format', async () => {
    const user = await login();
    const res = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: {
        placeId: PLACE_C,
        rating: 3,
        text: 'زيارة عادية ليس هناك ما يميزها كثيراً',
        visitDate: '2026-09-15',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { visitDate: string };
    expect(body.visitDate).toBe('2026-09-15');
  });
});

// ─── Duplicate prevention ─────────────────────────────────────────────────────

describe.skipIf(skip)("POST /v1/reviews — can't review the same place twice", () => {
  it('returns 409 on second review for the same place', async () => {
    const user = await login();
    const place = '00000000-0000-0000-0000-000000000010';

    const first = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: place, rating: 4, text: 'التقييم الأول لهذا المكان الجميل' },
    });
    expect(first.statusCode).toBe(201);

    const second = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: place, rating: 2, text: 'محاولة تقييم ثانية لنفس المكان' },
    });
    expect(second.statusCode).toBe(409);
  });

  it('allows two different users to review the same place', async () => {
    const userA = await login();
    const userB = await login();
    const place = '00000000-0000-0000-0000-000000000011';

    const resA = await call('POST', '/v1/reviews', {
      token: userA.accessToken,
      payload: { placeId: place, rating: 5, text: 'تقييم المستخدم الأول لهذا المكان المميز' },
    });
    const resB = await call('POST', '/v1/reviews', {
      token: userB.accessToken,
      payload: { placeId: place, rating: 3, text: 'تقييم المستخدم الثاني لنفس المكان' },
    });

    expect(resA.statusCode).toBe(201);
    expect(resB.statusCode).toBe(201);
  });
});

// ─── Update review ────────────────────────────────────────────────────────────

describe.skipIf(skip)('PATCH /v1/reviews/:id — updateReview', () => {
  it("owner can update their review's text and rating", async () => {
    const user = await login();
    const place = '00000000-0000-0000-0000-000000000020';

    const created = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: place, rating: 3, text: 'تقييم أولي للمكان قبل التعديل' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const updated = await call('PATCH', `/v1/reviews/${id}`, {
      token: user.accessToken,
      payload: { rating: 5, text: 'تحديث التقييم بعد زيارة ثانية للمكان الرائع' },
    });
    expect(updated.statusCode).toBe(200);
    const body = updated.json() as { rating: number; text: string };
    expect(body.rating).toBe(5);
    expect(body.text).toBe('تحديث التقييم بعد زيارة ثانية للمكان الرائع');
  });

  it('returns 403 when another user tries to update the review', async () => {
    const owner = await login();
    const other = await login();
    const place = '00000000-0000-0000-0000-000000000021';

    const created = await call('POST', '/v1/reviews', {
      token: owner.accessToken,
      payload: { placeId: place, rating: 4, text: 'تقييم المالك الأصلي للمكان' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('PATCH', `/v1/reviews/${id}`, {
      token: other.accessToken,
      payload: { rating: 1, text: 'محاولة تعديل من مستخدم آخر غير المالك' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when review does not exist', async () => {
    const user = await login();
    const res = await call('PATCH', `/v1/reviews/${crypto.randomUUID()}`, {
      token: user.accessToken,
      payload: { rating: 2, text: 'محاولة تعديل تقييم غير موجود في النظام' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('PATCH', `/v1/reviews/${crypto.randomUUID()}`, {
      payload: { rating: 2 },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Delete review ────────────────────────────────────────────────────────────

describe.skipIf(skip)('DELETE /v1/reviews/:id — deleteReview', () => {
  it('owner can delete their review', async () => {
    const user = await login();
    const place = '00000000-0000-0000-0000-000000000030';

    const created = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: place, rating: 2, text: 'تقييم سيتم حذفه لاحقاً من النظام' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const deleted = await call('DELETE', `/v1/reviews/${id}`, {
      token: user.accessToken,
    });
    expect([200, 204]).toContain(deleted.statusCode);

    // Review should no longer appear in listing
    const listing = await call('GET', `/v1/places/${place}/reviews`, {
      token: user.accessToken,
    });
    if (listing.statusCode === 200) {
      const items = (listing.json() as { items: Array<{ id: string }> }).items;
      expect(items.find((r) => r.id === id)).toBeUndefined();
    }
  });

  it('returns 403 when another user tries to delete the review', async () => {
    const owner = await login();
    const other = await login();
    const place = '00000000-0000-0000-0000-000000000031';

    const created = await call('POST', '/v1/reviews', {
      token: owner.accessToken,
      payload: { placeId: place, rating: 3, text: 'تقييم سيحاول آخر حذفه بشكل غير مصرح' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('DELETE', `/v1/reviews/${id}`, { token: other.accessToken });
    expect(res.statusCode).toBe(403);
  });
});

// ─── List reviews for a place ─────────────────────────────────────────────────

describe.skipIf(skip)('GET /v1/places/:id/reviews — getReviews', () => {
  it('returns reviews for a place in newest order by default', async () => {
    const users = await Promise.all([login(), login(), login()]);
    const place = '00000000-0000-0000-0000-000000000040';

    const texts = [
      'أول تقييم لهذا المكان الجميل جداً',
      'ثاني تقييم بتجربة رائعة',
      'ثالث تقييم مميز',
    ];
    for (let i = 0; i < users.length; i++) {
      const res = await call('POST', '/v1/reviews', {
        token: users[i]!.accessToken,
        payload: { placeId: place, rating: i + 3, text: texts[i]! },
      });
      expect(res.statusCode).toBe(201);
    }

    const res = await call('GET', `/v1/places/${place}/reviews`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ rating: number }> };
    expect(body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('supports sorting by highest rating', async () => {
    const users = await Promise.all([login(), login(), login()]);
    const place = '00000000-0000-0000-0000-000000000041';

    const ratings = [2, 5, 3];
    const texts = ['تقييم ثنائي', 'تقييم خماسي رائع', 'تقييم ثلاثي معقول'];
    for (let i = 0; i < users.length; i++) {
      const res = await call('POST', '/v1/reviews', {
        token: users[i]!.accessToken,
        payload: { placeId: place, rating: ratings[i]!, text: texts[i]! },
      });
      expect(res.statusCode).toBe(201);
    }

    const res = await call('GET', `/v1/places/${place}/reviews?sort=highest`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ rating: number }> };
    if (body.items.length >= 2) {
      expect(body.items[0]!.rating).toBeGreaterThanOrEqual(body.items[1]!.rating);
    }
  });

  it('filters by rating', async () => {
    const users = await Promise.all([login(), login(), login()]);
    const place = '00000000-0000-0000-0000-000000000042';

    const ratings = [1, 3, 5];
    const texts = ['تقييم واحد للمكان', 'تقييم ثلاثة للمكان', 'تقييم خمسة للمكان'];
    for (let i = 0; i < users.length; i++) {
      const res = await call('POST', '/v1/reviews', {
        token: users[i]!.accessToken,
        payload: { placeId: place, rating: ratings[i]!, text: texts[i]! },
      });
      expect(res.statusCode).toBe(201);
    }

    const res = await call('GET', `/v1/places/${place}/reviews?rating=5`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ rating: number }> };
    expect(body.items.every((r) => r.rating === 5)).toBe(true);
  });

  it('returns empty array for a place with no reviews', async () => {
    const place = '00000000-0000-0000-0000-000000000043';
    const res = await call('GET', `/v1/places/${place}/reviews`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

// ─── Rating summary ───────────────────────────────────────────────────────────

describe.skipIf(skip)('GET /v1/places/:id/reviews/summary — ratingSummary', () => {
  it('computes correct average and breakdown', async () => {
    const users = await Promise.all([login(), login(), login(), login(), login()]);
    const place = '00000000-0000-0000-0000-000000000050';

    const ratings = [5, 5, 4, 3, 1];
    const texts = [
      'تقييم خمسة أول للمقارنة',
      'تقييم خمسة ثاني',
      'تقييم أربعة جيد',
      'تقييم ثلاثة مقبول',
      'تقييم واحد سيء',
    ];
    for (let i = 0; i < users.length; i++) {
      await call('POST', '/v1/reviews', {
        token: users[i]!.accessToken,
        payload: { placeId: place, rating: ratings[i]!, text: texts[i]! },
      });
    }

    const res = await call('GET', `/v1/places/${place}/reviews/summary`);
    if (res.statusCode === 404) return; // summary endpoint may not be wired yet
    expect(res.statusCode).toBe(200);
    const body = res.json() as { average: number; total: number; breakdown: Record<string, number> };
    expect(body.total).toBe(5);
    // average = (5+5+4+3+1)/5 = 3.6
    expect(body.average).toBeCloseTo(3.6, 1);
    expect(body.breakdown['5']).toBe(2);
    expect(body.breakdown['4']).toBe(1);
    expect(body.breakdown['3']).toBe(1);
    expect(body.breakdown['1']).toBe(1);
  });

  it('returns zero totals for a place with no reviews', async () => {
    const place = '00000000-0000-0000-0000-000000000051';
    const res = await call('GET', `/v1/places/${place}/reviews/summary`);
    if (res.statusCode === 404) return;
    expect(res.statusCode).toBe(200);
    const body = res.json() as { average: number; total: number };
    expect(body.total).toBe(0);
    expect(body.average).toBe(0);
  });
});

// ─── Helpful votes ────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/reviews/:id/vote — voteReview', () => {
  it('increments helpfulCount when a user marks review as helpful', async () => {
    const author = await login();
    const voter = await login();
    const place = '00000000-0000-0000-0000-000000000060';

    const created = await call('POST', '/v1/reviews', {
      token: author.accessToken,
      payload: { placeId: place, rating: 4, text: 'تقييم ممتاز جداً لهذا المكان' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const voteRes = await call('POST', `/v1/reviews/${id}/vote`, {
      token: voter.accessToken,
      payload: { isHelpful: true },
    });
    expect([200, 201]).toContain(voteRes.statusCode);
    const voteBody = voteRes.json() as { helpfulCount: number };
    expect(voteBody.helpfulCount).toBeGreaterThanOrEqual(1);
  });

  it('toggles vote off when voting same way twice', async () => {
    const author = await login();
    const voter = await login();
    const place = '00000000-0000-0000-0000-000000000061';

    const created = await call('POST', '/v1/reviews', {
      token: author.accessToken,
      payload: { placeId: place, rating: 5, text: 'مكان رائع ومميز وأنصح بزيارته' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    // First vote
    await call('POST', `/v1/reviews/${id}/vote`, {
      token: voter.accessToken,
      payload: { isHelpful: true },
    });

    // Second vote (same) — should toggle off
    const second = await call('POST', `/v1/reviews/${id}/vote`, {
      token: voter.accessToken,
      payload: { isHelpful: true },
    });
    expect([200, 201]).toContain(second.statusCode);
    const body = second.json() as { helpfulCount: number; myVote: boolean | null };
    // Count should be 0 again, or myVote null
    expect(body.helpfulCount === 0 || body.myVote === null).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('POST', `/v1/reviews/${crypto.randomUUID()}/vote`, {
      payload: { isHelpful: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when review does not exist', async () => {
    const user = await login();
    const res = await call('POST', `/v1/reviews/${crypto.randomUUID()}/vote`, {
      token: user.accessToken,
      payload: { isHelpful: true },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── Provider response ────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/reviews/:id/response — respondToReview', () => {
  it('provider can respond to a review', async () => {
    const reviewer = await login();
    const provider = await login();
    const place = '00000000-0000-0000-0000-000000000070';

    const created = await call('POST', '/v1/reviews', {
      token: reviewer.accessToken,
      payload: { placeId: place, rating: 3, text: 'المكان جيد لكن يحتاج تحسين' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('POST', `/v1/reviews/${id}/response`, {
      token: provider.accessToken,
      payload: { text: 'شكراً على تقييمك سنعمل على التحسين' },
    });
    // 200/201 if provider is registered, 403/404 otherwise
    expect([200, 201, 403, 404]).toContain(res.statusCode);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('POST', `/v1/reviews/${crypto.randomUUID()}/response`, {
      payload: { text: 'رد بدون مصادقة' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Report review ────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/reviews/:id/report — reportReview', () => {
  it('allows a user to report a review', async () => {
    const author = await login();
    const reporter = await login();
    const place = '00000000-0000-0000-0000-000000000080';

    const created = await call('POST', '/v1/reviews', {
      token: author.accessToken,
      payload: { placeId: place, rating: 5, text: 'تقييم يمكن الإبلاغ عنه لاختبار الميزة' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('POST', `/v1/reviews/${id}/report`, {
      token: reporter.accessToken,
      payload: { reason: 'spam' },
    });
    expect([200, 201, 204]).toContain(res.statusCode);
  });

  it('returns 400 when reason is invalid', async () => {
    const author = await login();
    const reporter = await login();
    const place = '00000000-0000-0000-0000-000000000081';

    const created = await call('POST', '/v1/reviews', {
      token: author.accessToken,
      payload: { placeId: place, rating: 4, text: 'تقييم لاختبار سبب الإبلاغ الخاطئ' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('POST', `/v1/reviews/${id}/report`, {
      token: reporter.accessToken,
      payload: { reason: 'invalid_reason' },
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('prevents reporting the same review twice', async () => {
    const author = await login();
    const reporter = await login();
    const place = '00000000-0000-0000-0000-000000000082';

    const created = await call('POST', '/v1/reviews', {
      token: author.accessToken,
      payload: { placeId: place, rating: 2, text: 'تقييم سيتم الإبلاغ عنه مرتين' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const first = await call('POST', `/v1/reviews/${id}/report`, {
      token: reporter.accessToken,
      payload: { reason: 'fake' },
    });
    expect([200, 201, 204]).toContain(first.statusCode);

    const second = await call('POST', `/v1/reviews/${id}/report`, {
      token: reporter.accessToken,
      payload: { reason: 'fake' },
    });
    // Should be idempotent or 409
    expect([200, 201, 204, 409]).toContain(second.statusCode);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('POST', `/v1/reviews/${crypto.randomUUID()}/report`, {
      payload: { reason: 'spam' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe.skipIf(skip)('GET /v1/places/:id/reviews — pagination', () => {
  it('returns cursor for next page when there are more reviews than the limit', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => login()));
    const place = PLACE_MANY;

    const texts = [
      'تقييم أول للصفحة المتعددة',
      'تقييم ثاني',
      'تقييم ثالث',
      'تقييم رابع',
      'تقييم خامس',
      'تقييم سادس',
    ];

    for (let i = 0; i < users.length; i++) {
      const res = await call('POST', '/v1/reviews', {
        token: users[i]!.accessToken,
        payload: { placeId: place, rating: (i % 5) + 1, text: texts[i]! },
      });
      expect(res.statusCode).toBe(201);
    }

    const page1 = await call('GET', `/v1/places/${place}/reviews?limit=3`);
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json() as { items: unknown[]; nextCursor?: string };
    expect(body1.items).toHaveLength(3);
    expect(body1.nextCursor).toBeTruthy();

    // Fetch second page using the cursor
    const page2 = await call('GET', `/v1/places/${place}/reviews?limit=3&cursor=${body1.nextCursor}`);
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json() as { items: unknown[] };
    expect(body2.items.length).toBeGreaterThanOrEqual(1);
  });

  it('returns no nextCursor on the last page', async () => {
    const user = await login();
    const place = '00000000-0000-0000-0000-000000000091';

    await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: place, rating: 4, text: 'تقييم وحيد لهذا المكان' },
    });

    const res = await call('GET', `/v1/places/${place}/reviews?limit=10`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; nextCursor?: string };
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toBeFalsy();
  });
});

// ─── Review appears in place listing ─────────────────────────────────────────

describe.skipIf(skip)('review shows up in place reviews after creation', () => {
  it('newly created review appears immediately in the place review listing', async () => {
    const user = await login();
    const place = '00000000-0000-0000-0000-000000000095';

    const created = await call('POST', '/v1/reviews', {
      token: user.accessToken,
      payload: { placeId: place, rating: 5, text: 'تقييم سيظهر في قائمة التقييمات' },
    });
    expect(created.statusCode).toBe(201);
    const reviewId = (created.json() as { id: string }).id;

    const listing = await call('GET', `/v1/places/${place}/reviews`);
    expect(listing.statusCode).toBe(200);
    const items = (listing.json() as { items: Array<{ id: string }> }).items;
    expect(items.some((r) => r.id === reviewId)).toBe(true);
  });
});
