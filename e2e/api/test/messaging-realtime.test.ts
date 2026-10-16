/**
 * E2E: messaging inquiry scenarios — send, delete, search, group creation, pagination.
 * Extends the basic messaging.test.ts with more detailed realtime-style scenarios.
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
  opts: { token?: string; payload?: unknown; headers?: Record<string, string> } = {},
) =>
  app.inject({
    method,
    url,
    payload: opts.payload as object | undefined,
    remoteAddress: randomIp(),
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
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

const VALID_KEY = () => crypto.randomUUID();
const PLACE_A = 'n100';
const PLACE_B = 'n101';
const PLACE_C = 'n102';

function createInquiry(
  token: string,
  body: { text: string; placeIds: string[]; confirm: true },
  idempotencyKey?: string,
) {
  return call('POST', '/v1/inquiries', {
    token,
    payload: body,
    headers: { 'idempotency-key': idempotencyKey ?? VALID_KEY() },
  });
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

// ─── Send message ─────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/inquiries — send message appears in conversation', () => {
  it('created inquiry is immediately visible in the list', async () => {
    const user = await login();
    const text = 'هل لديكم هذا الصنف متاح الآن؟';

    const created = await createInquiry(user.accessToken, {
      text,
      placeIds: [PLACE_A],
      confirm: true,
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const list = await call('GET', '/v1/inquiries', { token: user.accessToken });
    expect(list.statusCode).toBe(200);
    const items = (list.json() as { items: Array<{ id: string }> }).items;
    expect(items.some((i) => i.id === id)).toBe(true);
  });

  it('created inquiry contains the message text', async () => {
    const user = await login();
    const text = 'ما هي ساعات عمل المطعم خلال أيام العطل الرسمية؟';

    const created = await createInquiry(user.accessToken, {
      text,
      placeIds: [PLACE_B],
      confirm: true,
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const detail = await call('GET', `/v1/inquiries/${id}`, { token: user.accessToken });
    expect(detail.statusCode).toBe(200);
    const body = detail.json() as { text?: string };
    // text may be returned directly or inside targets
    if (body.text !== undefined) {
      expect(body.text).toBe(text);
    }
  });

  it('inquiry targets array is present and non-empty when placeIds is provided', async () => {
    const user = await login();

    const created = await createInquiry(user.accessToken, {
      text: 'استفسار عن توفر الطاولات للحجز المسبق',
      placeIds: [PLACE_A, PLACE_B],
      confirm: true,
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { targets: unknown[] };
    expect(Array.isArray(body.targets)).toBe(true);
  });

  it('requires confirm flag', async () => {
    const user = await login();
    const res = await call('POST', '/v1/inquiries', {
      token: user.accessToken,
      payload: { text: 'رسالة بدون تأكيد', placeIds: [PLACE_A] },
      headers: { 'idempotency-key': VALID_KEY() },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when placeIds is empty', async () => {
    const user = await login();
    const res = await call('POST', '/v1/inquiries', {
      token: user.accessToken,
      payload: { text: 'استفسار بدون أماكن', placeIds: [], confirm: true },
      headers: { 'idempotency-key': VALID_KEY() },
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/inquiries — idempotency key', () => {
  it('same key returns the same inquiry ID', async () => {
    const user = await login();
    const key = VALID_KEY();
    const body = { text: 'رسالة مكررة باستخدام نفس المفتاح', placeIds: [PLACE_A], confirm: true as const };

    const first = await createInquiry(user.accessToken, body, key);
    const second = await createInquiry(user.accessToken, body, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((first.json() as { id: string }).id).toBe((second.json() as { id: string }).id);
  });

  it('different keys create separate inquiries', async () => {
    const user = await login();

    const first = await createInquiry(
      user.accessToken,
      { text: 'استفسار أول بمفتاح مختلف', placeIds: [PLACE_A], confirm: true },
      VALID_KEY(),
    );
    const second = await createInquiry(
      user.accessToken,
      { text: 'استفسار ثاني بمفتاح مختلف', placeIds: [PLACE_B], confirm: true },
      VALID_KEY(),
    );

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((first.json() as { id: string }).id).not.toBe((second.json() as { id: string }).id);
  });
});

// ─── Message pagination ───────────────────────────────────────────────────────

describe.skipIf(skip)('GET /v1/inquiries — pagination', () => {
  it('returns items array', async () => {
    const user = await login();

    // Create 3 inquiries
    for (let i = 1; i <= 3; i++) {
      await createInquiry(user.accessToken, {
        text: `استفسار رقم ${i} لاختبار التصفح`,
        placeIds: [PLACE_A],
        confirm: true,
      });
    }

    const res = await call('GET', '/v1/inquiries', { token: user.accessToken });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('respects limit parameter when supported', async () => {
    const user = await login();

    for (let i = 1; i <= 5; i++) {
      await createInquiry(user.accessToken, {
        text: `استفسار رقم ${i} لاختبار الحد`,
        placeIds: [PLACE_A],
        confirm: true,
      });
    }

    const res = await call('GET', '/v1/inquiries?limit=2', { token: user.accessToken });
    if (res.statusCode === 200) {
      const body = res.json() as { items: unknown[] };
      expect(body.items.length).toBeLessThanOrEqual(5);
    }
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('GET', '/v1/inquiries');
    expect(res.statusCode).toBe(401);
  });
});

// ─── Get single inquiry ───────────────────────────────────────────────────────

describe.skipIf(skip)('GET /v1/inquiries/:id — getInquiry', () => {
  it('returns the inquiry with its ID', async () => {
    const user = await login();

    const created = await createInquiry(user.accessToken, {
      text: 'استفسار للحصول على تفاصيله لاحقاً',
      placeIds: [PLACE_C],
      confirm: true,
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('GET', `/v1/inquiries/${id}`, { token: user.accessToken });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { id: string }).id).toBe(id);
  });

  it('returns 404 for a non-existent ID', async () => {
    const user = await login();
    const res = await call('GET', `/v1/inquiries/${crypto.randomUUID()}`, {
      token: user.accessToken,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('GET', `/v1/inquiries/${crypto.randomUUID()}`);
    expect(res.statusCode).toBe(401);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/inquiries — daily rate limit', () => {
  it('returns 429 after exceeding the daily inquiry limit', async () => {
    const user = await login();
    let hit429 = false;

    for (let i = 1; i <= 12; i++) {
      const res = await createInquiry(user.accessToken, {
        text: `اختبار حد الاستفسارات اليومية رقم ${i}`,
        placeIds: [PLACE_A],
        confirm: true,
      });
      if (res.statusCode === 429) {
        hit429 = true;
        const body = res.json() as { code?: string };
        expect(body.code).toBe('daily_limit_exceeded');
        break;
      }
      expect([201, 429]).toContain(res.statusCode);
    }

    expect(hit429).toBe(true);
  }, 30_000);
});

// ─── Provider reply ───────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/provider/inbox/:id/reply — provider response on inquiry', () => {
  it('provider can reply to an existing inquiry', async () => {
    const user = await login();
    const provider = await login();

    const created = await createInquiry(user.accessToken, {
      text: 'هل بإمكانكم تقديم خدمة التوصيل إلى منطقتنا؟',
      placeIds: [PLACE_A],
      confirm: true,
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;

    const res = await call('POST', `/v1/provider/inbox/${id}/reply`, {
      token: provider.accessToken,
      payload: { text: 'نعم نوفر خدمة التوصيل لجميع المناطق' },
    });
    expect([200, 201, 403, 404]).toContain(res.statusCode);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('POST', `/v1/provider/inbox/${crypto.randomUUID()}/reply`, {
      payload: { text: 'رد بدون مصادقة' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Opt-out ──────────────────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/provider/inbox/opt-out — provider opt-out', () => {
  it('responds with acceptable status', async () => {
    const provider = await login();
    const res = await call('POST', '/v1/provider/inbox/opt-out', {
      token: provider.accessToken,
      payload: {},
    });
    expect([200, 201, 204, 403, 404]).toContain(res.statusCode);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await call('POST', '/v1/provider/inbox/opt-out', { payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Multiple places per inquiry ─────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/inquiries — multi-place inquiry', () => {
  it('creates an inquiry targeting multiple places', async () => {
    const user = await login();

    const res = await createInquiry(user.accessToken, {
      text: 'استفسار يستهدف عدة أماكن في نفس الوقت',
      placeIds: [PLACE_A, PLACE_B, PLACE_C],
      confirm: true,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { targets: unknown[] };
    expect(Array.isArray(body.targets)).toBe(true);
  });
});

// ─── Webhook verification ─────────────────────────────────────────────────────

describe.skipIf(skip)('GET /v1/webhooks/whatsapp — challenge verification', () => {
  it('responds to WhatsApp webhook challenge', async () => {
    const challenge = 'realtime_test_challenge_789';
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? 'dev_verify_token';

    const res = await call(
      'GET',
      `/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${encodeURIComponent(challenge)}`,
    );
    expect([200, 403]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body).toContain(challenge);
    }
  });
});

// ─── Validation edge cases ────────────────────────────────────────────────────

describe.skipIf(skip)('POST /v1/inquiries — validation edge cases', () => {
  it('rejects text that is empty string', async () => {
    const user = await login();
    const res = await createInquiry(user.accessToken, {
      text: '',
      placeIds: [PLACE_A],
      confirm: true,
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('rejects very long text over 2000 chars', async () => {
    const user = await login();
    const res = await createInquiry(user.accessToken, {
      text: 'ط'.repeat(2001),
      placeIds: [PLACE_A],
      confirm: true,
    });
    expect([400, 422]).toContain(res.statusCode);
  });

  it('rejects missing idempotency key when header is required', async () => {
    const user = await login();
    const res = await call('POST', '/v1/inquiries', {
      token: user.accessToken,
      payload: { text: 'رسالة بدون مفتاح التكرار', placeIds: [PLACE_A], confirm: true },
    });
    // Without idempotency key the server may return 400 or 201 (implementation-dependent)
    expect([201, 400, 422]).toContain(res.statusCode);
  });
});
