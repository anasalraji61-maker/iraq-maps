import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PortTokens, type IdentityPort, type IraqiPhone, type PhoneVerificationPort, type UserId } from '@iraq-maps/contracts';
import { createOutboxPublisher, createTestDatabase, startOutboxRelay, type OutboxRelay, type TestDatabase } from '@iraq-maps/db-kit';
import { captureLogs, createLogger } from '@iraq-maps/observability';
import { FakeOtpSender, FixedClock, InMemoryEventBus, InMemoryUserDataEraser, userDataEraserConformance } from '@iraq-maps/testing';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decrypt, mac } from './crypto';
import { INTERNALS, type Internals } from './http';
import { IdentityAuthGuard, identityMigrationsDir, identityModule } from './index';
import { ipBucket } from './otp';
import { sessions, users } from './schema';
import { Sessions } from './sessions';
import { grantRole } from './users';

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
  // Bound like apps/api does: identity's guard is the app-wide auth check.
  class TestApp {}
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: TestApp,
      imports: [identityModule({ db: tdb.db, redisUrl, otpSender: sender, erasers: [places, media], outbox, clock, env })],
      providers: [{ provide: APP_GUARD, useClass: IdentityAuthGuard }],
    },
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
/** Stands in for waiting out the 60s resend cooldown. */
const skipResendWait = (phone: string) => redis.del(`identity:otp-resend:${mac(env.PHONE_HASH_KEY, phone)}`);
async function newCode(phone: string) {
  await skipResendWait(phone);
  expect((await requestOtp(phone)).statusCode).toBe(202);
  return sender.lastCodeFor(phone)!;
}

async function login(phone = newPhone()) {
  await newCode(phone);
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

  it('enforces the 60s resend wait on the server', async () => {
    const phone = newPhone();
    expect((await requestOtp(phone)).statusCode).toBe(202);
    expect((await requestOtp(phone)).json()).toMatchObject({ status: 429, code: 'otp_resend_too_soon' });
    expect(await redis.ttl(`identity:otp-resend:${mac(env.PHONE_HASH_KEY, phone)}`)).toBeGreaterThan(55);
    expect(sender.sent.filter((m) => m.phone === phone)).toHaveLength(1);
  });

  it('answers the 6th code request for a phone inside the window with 429', async () => {
    const phone = newPhone();
    for (let i = 0; i < 5; i++) await newCode(phone);
    await skipResendWait(phone);
    expect((await requestOtp(phone)).json()).toMatchObject({ status: 429, code: 'otp_rate_limited' });
    expect(sender.sent.filter((m) => m.phone === phone)).toHaveLength(5);
  });

  it('caps a phone at 10 codes per 24h, across 15-minute windows', async () => {
    const phone = newPhone();
    const nextWindow = () => redis.del(`identity:otp-rate:phone:${mac(env.PHONE_HASH_KEY, phone)}`);
    for (let i = 0; i < 10; i++) {
      if (i === 5) await nextWindow();
      await newCode(phone);
    }
    await nextWindow();
    await skipResendWait(phone);
    expect((await requestOtp(phone)).json()).toMatchObject({ status: 429, code: 'otp_rate_limited' });
  });

  it('limits code requests per client network: an IPv4 address (mapped or not) or an IPv6 /64', async () => {
    const v4 = newIp();
    const v6 = `2001:db8:${randomInt(0x10000).toString(16)}:${randomInt(0x10000).toString(16)}`;
    for (const address of [(i: number) => (i % 2 ? `::ffff:${v4}` : v4), (i: number) => `${v6}::${(i + 1).toString(16)}`]) {
      for (let i = 0; i < 20; i++) expect((await requestOtp(newPhone(), address(i))).statusCode).toBe(202);
      expect((await requestOtp(newPhone(), address(20))).json()).toMatchObject({ status: 429, code: 'otp_rate_limited' });
    }
    expect((await requestOtp(newPhone())).statusCode).toBe(202);
    expect(ipBucket('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff')).toBe(ipBucket('2001:db8:1:2::1'));
    expect(ipBucket('2001:db8:1:3::1')).not.toBe(ipBucket('2001:db8:1:2::1'));
  });

  it('invalidates the code after 5 wrong attempts', async () => {
    const phone = newPhone();
    const code = await newCode(phone);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await verifyOtp(phone, otherThan(code))).statusCode);
    expect(statuses).toEqual([401, 401, 401, 401, 429]);
    expect((await verifyOtp(phone, code)).json()).toMatchObject({ status: 401, code: 'otp_expired' });
  });

  it('locks a phone for the day after 10 wrong codes, across codes and challenges', async () => {
    const phone = newPhone();
    const guess = async (code: string) => ((await verifyOtp(phone, code)).json() as { code?: string }).code;
    const first = await newCode(phone);
    for (let i = 0; i < 5; i++) await guess(otherThan(first));
    const login = await newCode(phone);
    for (let i = 0; i < 4; i++) expect(await guess(otherThan(login))).toBe('otp_invalid');
    await skipResendWait(phone);
    const port = app.get<PhoneVerificationPort>(PortTokens.PhoneVerificationPort);
    const { verificationId } = await port.start({ phone, locale: 'ar', purpose: 'provider_phone' });
    const wrong = otherThan(sender.lastCodeFor(phone)!);
    expect(await port.confirm({ verificationId, code: wrong })).toEqual({ verified: false, reason: 'too_many_attempts' });
    expect(await guess(login)).toBe('otp_locked');
    await skipResendWait(phone);
    expect((await requestOtp(phone)).json()).toMatchObject({ status: 429, code: 'otp_locked' });
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

  it('never accepts one token kind as the other, even if both secrets were equal', async () => {
    const session = await login();
    expect((await me(session.refreshToken)).statusCode).toBe(401);
    const shared = { JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET };
    const sameKey = new Sessions(tdb.db, shared, clock, createLogger({ name: 'identity-test' }));
    const pair = await sameKey.start(session.user.id);
    expect(await sameKey.verify(pair.refreshToken)).toBeNull();
    expect(await sameKey.rotate(pair.accessToken)).toBeNull();
    expect(await sameKey.verify(pair.accessToken)).toMatchObject({ userId: session.user.id });
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
  it('reads and updates name and locale; the guard rejects missing tokens with the 401 Problem', async () => {
    const session = await login();
    expect((await me(session.accessToken, 'PATCH', { name: 'زينب', locale: 'en' })).json()).toMatchObject({ id: session.user.id, name: 'زينب', locale: 'en' });
    expect((await me(session.accessToken, 'PATCH', {})).json()).toMatchObject({ name: 'زينب', locale: 'en' });
    expect((await me(session.accessToken)).json()).toMatchObject({ name: 'زينب', locale: 'en', roles: ['user'] });
    const anonymous = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ type: 'about:blank', title: 'Missing, invalid or revoked access token', status: 401, code: 'unauthorized' });
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

// identity's own erasure is the DELETE /v1/me path itself (Users.remove), run here as an eraser.
userDataEraserConformance('identity', () => ({
  eraser: { module: 'identity', erase: (id) => app.get<Internals>(INTERNALS).users.remove(id) },
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
