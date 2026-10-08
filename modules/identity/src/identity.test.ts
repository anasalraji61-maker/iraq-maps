import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PortTokens, type IdentityPort, type IraqiPhone, type PhoneVerificationPort, type UserId } from '@iraq-maps/contracts';
import { createOutboxPublisher, createTestDatabase, startOutboxRelay, type OutboxRelay, type TestDatabase } from '@iraq-maps/db-kit';
import { captureLogs } from '@iraq-maps/observability';
import { FakeOtpSender, FixedClock, InMemoryEventBus, InMemoryUserDataEraser, userDataEraserConformance } from '@iraq-maps/testing';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decrypt, mac } from './crypto';
import { identityMigrationsDir, identityModule } from './index';
import { sessions, users } from './schema';
import { grantRole, identityEraser } from './users';

const secret = () => randomBytes(32).toString('base64');
const env = { APP_ENV: 'test', JWT_ACCESS_SECRET: secret(), JWT_REFRESH_SECRET: secret(), PHONE_ENCRYPTION_KEY: secret(), PHONE_HASH_KEY: secret() };
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
// Fresh phones and IPs per test keep the shared Redis rate-limit counters from leaking between tests and runs.
const newPhone = () => `+9647${randomInt(1e9).toString().padStart(9, '0')}` as IraqiPhone;
const newIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`;

const logs = captureLogs();
const sender = new FakeOtpSender();
const clock = new FixedClock(new Date());
const places = new InMemoryUserDataEraser('places');
const media = { module: 'media', fail: false, erased: [] as UserId[], async erase(id: UserId) { if (this.fail) throw new Error('media is down'); this.erased.push(id); } };
const bus = new InMemoryEventBus();
let tdb: TestDatabase;
let app: NestFastifyApplication;
let relay: OutboxRelay;
let redis: Redis;

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: [{ schema: 'identity', migrationsDir: identityMigrationsDir }] });
  const outbox = createOutboxPublisher(tdb.db);
  app = await NestFactory.create<NestFastifyApplication>(
    identityModule({ db: tdb.db, redisUrl, otpSender: sender, erasers: [places, media], outbox, clock, env }),
    new FastifyAdapter(),
    { logger: false },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  relay = startOutboxRelay({ db: tdb.db, target: { bus }, pollIntervalMs: 60_000 });
  redis = new Redis(redisUrl);
});

afterAll(async () => {
  logs.stop();
  await relay?.stop();
  await app?.close();
  await redis?.quit();
  await tdb?.drop();
});

const post = (url: string, payload: object, ip = newIp()) => app.inject({ method: 'POST', url, payload, remoteAddress: ip });
const requestOtp = (phone: string, ip?: string) => post('/v1/auth/otp/request', { phone, locale: 'ckb' }, ip);
const verifyOtp = (phone: string, code: string) => post('/v1/auth/otp/verify', { phone, code });
const refresh = (refreshToken: string) => post('/v1/auth/refresh', { refreshToken });
const me = (accessToken: string, method: 'GET' | 'PATCH' | 'DELETE' = 'GET', payload?: object) =>
  app.inject({ method, url: '/v1/me', headers: { authorization: `Bearer ${accessToken}` }, payload });
const otherThan = (code: string) => (code === '000000' ? '111111' : '000000');

async function login(phone = newPhone()) {
  expect((await requestOtp(phone)).statusCode).toBe(202);
  const res = await verifyOtp(phone, sender.lastCodeFor(phone)!);
  expect(res.statusCode).toBe(200);
  return { phone, ...(res.json() as { accessToken: string; refreshToken: string; isNewUser: boolean; user: { id: UserId } }) };
}

async function eventsFor(userId: string) {
  await relay.drainOnce();
  return bus.published.filter((e) => e.payload.userId === userId).map((e) => e.name);
}

describe('OTP login', () => {
  it('registers a phone once (one registered event), then logs it in again', async () => {
    const first = await login();
    expect(first).toMatchObject({ isNewUser: true, user: { name: null, locale: 'ckb', roles: ['user'] } });
    const again = await login(first.phone);
    expect(again).toMatchObject({ isNewUser: false, user: { id: first.user.id } });
    expect(await eventsFor(first.user.id)).toEqual(['identity.user.registered.v1']);
  });

  it('stores the phone only as AES-GCM ciphertext and a keyed hash', async () => {
    const { phone, user } = await login();
    const { rows } = await tdb.db.execute<{ phone_enc: string; phone_hash: string }>(sql`SELECT * FROM identity.users WHERE id = ${user.id}`);
    expect(JSON.stringify(rows)).not.toContain(phone.slice(4));
    expect(rows[0]!.phone_hash).toBe(mac(env.PHONE_HASH_KEY, phone));
    expect(decrypt(Buffer.from(env.PHONE_ENCRYPTION_KEY, 'base64'), rows[0]!.phone_enc)).toBe(phone);
  });

  it('stores the code hashed with a 5 minute TTL, and accepts it only once', async () => {
    const phone = newPhone();
    const res = await requestOtp(phone);
    expect(res.json()).toMatchObject({ resendAfterSec: 60 });
    const code = sender.lastCodeFor(phone)!;
    const key = `identity:otp:login:${mac(env.PHONE_HASH_KEY, phone)}`;
    expect(await redis.hget(key, 'code')).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(await redis.hgetall(key))).not.toContain(code);
    expect(await redis.ttl(key)).toBeGreaterThan(290);
    expect((await verifyOtp(phone, code)).statusCode).toBe(200);
    expect((await verifyOtp(phone, code)).json()).toMatchObject({ status: 401, code: 'otp_expired' });
  });

  it('answers the 6th code request for a phone inside the window with 429', async () => {
    const phone = newPhone();
    for (let i = 0; i < 5; i++) expect((await requestOtp(phone)).statusCode).toBe(202);
    const res = await requestOtp(phone);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ code: 'otp_rate_limited' });
    expect(sender.sent.filter((m) => m.phone === phone)).toHaveLength(5);
  });

  it('limits code requests per IP across phones (20 per window)', async () => {
    const ip = newIp();
    for (let i = 0; i < 20; i++) expect((await requestOtp(newPhone(), ip)).statusCode).toBe(202);
    expect((await requestOtp(newPhone(), ip)).statusCode).toBe(429);
    expect((await requestOtp(newPhone())).statusCode).toBe(202);
  });

  it('invalidates the code after 5 wrong attempts', async () => {
    const phone = newPhone();
    await requestOtp(phone);
    const code = sender.lastCodeFor(phone)!;
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await verifyOtp(phone, otherThan(code))).statusCode);
    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    expect((await verifyOtp(phone, code)).json()).toMatchObject({ status: 401, code: 'otp_expired' });
  });
});

describe('sessions', () => {
  it('rotates the refresh token; reusing a rotated one revokes the whole family', async () => {
    const session = await login();
    const rotated = await refresh(session.refreshToken);
    expect(rotated.statusCode).toBe(200);
    const next = rotated.json() as { accessToken: string; refreshToken: string };
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect((await me(next.accessToken)).statusCode).toBe(200);

    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    expect((await refresh(next.refreshToken)).statusCode).toBe(401);
    expect((await me(next.accessToken)).statusCode).toBe(401);
    expect((await me((await login(session.phone)).accessToken)).statusCode).toBe(200);
  });

  it('ignores garbage refresh tokens without revoking anything', async () => {
    const session = await login();
    for (const token of ['garbage', session.accessToken]) expect((await refresh(token)).json()).toMatchObject({ status: 401, code: 'refresh_invalid' });
    expect((await refresh(session.refreshToken)).statusCode).toBe(200);
  });

  it('logout revokes the session and its access tokens', async () => {
    const session = await login();
    expect((await post('/v1/auth/logout', { refreshToken: session.refreshToken })).statusCode).toBe(204);
    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    expect((await me(session.accessToken)).statusCode).toBe(401);
  });

  it('access tokens expire after 15 minutes; the refresh token still works', async () => {
    const session = await login();
    clock.advance(16 * 60_000);
    expect((await me(session.accessToken)).statusCode).toBe(401);
    expect((await refresh(session.refreshToken)).statusCode).toBe(200);
  });
});

describe('/v1/me', () => {
  it('reads and updates name and locale, and rejects missing tokens', async () => {
    const session = await login();
    expect((await me(session.accessToken, 'PATCH', { name: 'زينب', locale: 'en' })).json()).toMatchObject({ id: session.user.id, name: 'زينب', locale: 'en' });
    expect((await me(session.accessToken, 'PATCH', {})).json()).toMatchObject({ name: 'زينب', locale: 'en' });
    expect((await me(session.accessToken)).json()).toMatchObject({ name: 'زينب', locale: 'en', roles: ['user'] });
    expect((await app.inject({ method: 'GET', url: '/v1/me' })).json()).toMatchObject({ status: 401, code: 'unauthorized' });
  });

  it('DELETE runs every eraser, removes identity rows, then emits identity.user.deleted.v1 exactly once', async () => {
    const session = await login();
    expect((await me(session.accessToken, 'DELETE')).statusCode).toBe(204);
    expect(places.erased).toContain(session.user.id);
    expect(media.erased).toContain(session.user.id);
    const { rows } = await tdb.db.execute(sql`SELECT 1 FROM identity.users WHERE id = ${session.user.id} UNION ALL SELECT 1 FROM identity.sessions WHERE user_id = ${session.user.id}`);
    expect(rows).toHaveLength(0);
    expect((await me(session.accessToken)).statusCode).toBe(401);
    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    expect((await me(session.accessToken, 'DELETE')).statusCode).toBe(401);
    expect(await eventsFor(session.user.id)).toEqual(['identity.user.registered.v1', 'identity.user.deleted.v1']);
    expect(await relay.drainOnce()).toBe(0);
  });

  it('keeps the account and emits nothing when an eraser fails, so the client can retry', async () => {
    const session = await login();
    media.fail = true;
    expect((await me(session.accessToken, 'DELETE')).statusCode).toBe(500);
    media.fail = false;
    expect((await me(session.accessToken)).statusCode).toBe(200);
    expect(await eventsFor(session.user.id)).toEqual(['identity.user.registered.v1']);
    expect((await me(session.accessToken, 'DELETE')).statusCode).toBe(204);
  });
});

describe('ports and grant-role', () => {
  it('IdentityPort verifies access tokens and sees roles granted by grant-role (idempotent, by phone or id)', async () => {
    const port = app.get<IdentityPort>(PortTokens.IdentityPort);
    const session = await login();
    expect(await grantRole(tdb.db, env.PHONE_HASH_KEY, session.phone, 'admin')).toBe(true);
    expect(await grantRole(tdb.db, env.PHONE_HASH_KEY, session.user.id, 'admin')).toBe(true);
    expect(await port.verifyAccessToken(session.accessToken)).toEqual({ userId: session.user.id, roles: ['user', 'admin'] });
    expect(await port.getUser(session.user.id)).toMatchObject({ id: session.user.id, roles: ['user', 'admin'] });
    expect(await port.verifyAccessToken('not-a-token')).toBeNull();
    expect(await grantRole(tdb.db, env.PHONE_HASH_KEY, newPhone(), 'moderator')).toBe(false);
  });

  it('PhoneVerificationPort confirms a phone with the code sent to it, once', async () => {
    const port = app.get<PhoneVerificationPort>(PortTokens.PhoneVerificationPort);
    const phone = newPhone();
    const { verificationId } = await port.start({ phone, locale: 'ar', purpose: 'provider_phone' });
    const code = sender.lastCodeFor(phone)!;
    expect(await port.confirm({ verificationId, code: otherThan(code) })).toEqual({ verified: false, reason: 'invalid' });
    expect(await port.confirm({ verificationId, code })).toEqual({ verified: true, phone });
    expect(await port.confirm({ verificationId, code })).toEqual({ verified: false, reason: 'expired' });
  });
});

userDataEraserConformance('identity', () => ({
  eraser: identityEraser(tdb.db),
  async seed(id) {
    await tdb.db.insert(users).values({ id, phoneHash: randomUUID(), phoneEnc: 'x', locale: 'ar', roles: ['user'], createdAt: new Date() });
    await tdb.db.insert(sessions).values({ id: randomUUID(), userId: id, generation: 0 });
  },
  async hasData(id) {
    const { rows } = await tdb.db.execute(sql`SELECT 1 FROM identity.users WHERE id = ${id} UNION ALL SELECT 1 FROM identity.sessions WHERE user_id = ${id}`);
    return rows.length > 0;
  },
}));

// Last on purpose: covers everything identity logged above. The logger would mask a phone as [phone]; identity never even tries.
it('never logs a phone number', () => {
  expect(logs.records.length).toBeGreaterThan(0);
  expect(logs.text()).not.toMatch(/9647\d{9}|07\d{9}|\[phone\]/);
});
