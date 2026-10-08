import { randomBytes, randomInt } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { FakeOtpSender } from '@iraq-maps/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp, moduleMigrations } from './app';

const key = () => randomBytes(32).toString('base64');
const sender = new FakeOtpSender();
let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: moduleMigrations });
  const env = {
    APP_ENV: 'test',
    DATABASE_URL: tdb.url,
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    JWT_ACCESS_SECRET: key(),
    JWT_REFRESH_SECRET: key(),
    PHONE_ENCRYPTION_KEY: key(),
    PHONE_HASH_KEY: key(),
  };
  app = await createApp({ env, otpSender: sender });
});

afterAll(async () => {
  await app?.close();
  await tdb?.drop();
});

it('GET /health returns ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ status: 'ok' });
});

it('rejects GET /v1/me without a token', async () => {
  const res = await app.inject({ method: 'GET', url: '/v1/me' });
  expect(res.statusCode).toBe(401);
  expect(res.json()).toMatchObject({ status: 401, code: 'unauthorized' });
});

it('logs in with an OTP and reads GET /v1/me', async () => {
  // A fresh phone and client IP keep the shared Redis rate limits out of the way.
  const phone = `+9647${randomInt(1e9).toString().padStart(9, '0')}`;
  const remoteAddress = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`;
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload, remoteAddress });

  expect((await post('/v1/auth/otp/request', { phone })).statusCode).toBe(202);
  const verified = await post('/v1/auth/otp/verify', { phone, code: sender.lastCodeFor(phone) });
  expect(verified.statusCode).toBe(200);
  const res = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${verified.json().accessToken}` } });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ id: verified.json().user.id, locale: 'ar', roles: ['user'] });
});
