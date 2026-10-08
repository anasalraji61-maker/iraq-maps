import { createApp, moduleMigrations } from '@iraq-maps/api';
import { PortTokens, type DomainEvent, type EventBus } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { captureLogs } from '@iraq-maps/observability';
import { FakeOtpSender, identityTestEnv, InMemoryUserDataEraser, randomIp, randomPhone } from '@iraq-maps/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// AC#4: phone login end to end on the composed app (createApp), and AC#6: none of it reaches the logs.
// The tests run in order; the last one checks the logs the whole flow wrote.
const logs = captureLogs();
const sender = new FakeOtpSender();
const eraser = new InMemoryUserDataEraser('x');
const deleted: DomainEvent[] = [];
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: moduleMigrations });
  app = await createApp({ env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl }, otpSender: sender, erasers: [eraser], logger: true });
  app.get<EventBus>(PortTokens.EventBus).subscribe('identity.user.deleted.v1', (e) => void deleted.push(e));
});

afterAll(async () => {
  logs.stop();
  await app?.close();
  await tdb?.drop();
});

type Session = { accessToken: string; refreshToken: string };
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const call = (method: Method, url: string, { token, payload }: { token?: string; payload?: object } = {}) =>
  app.inject({ method, url, payload, remoteAddress: randomIp(), headers: token ? { authorization: `Bearer ${token}` } : {} });
const me = (token: string) => call('GET', '/v1/me', { token });
const refresh = (refreshToken: string) => call('POST', '/v1/auth/refresh', { payload: { refreshToken } });

/** A fresh phone per login: the server allows one code per phone per 60 s. */
async function login() {
  const phone = randomPhone();
  expect((await call('POST', '/v1/auth/otp/request', { payload: { phone } })).statusCode).toBe(202);
  const verified = await call('POST', '/v1/auth/otp/verify', { payload: { phone, code: sender.lastCodeFor(phone) } });
  expect(verified.statusCode).toBe(200);
  return verified.json() as Session & { user: { id: string }; isNewUser: boolean };
}

describe('phone login on the composed API', () => {
  it('signs in with an OTP, reads GET /v1/me and updates the name and locale', async () => {
    const session = await login();
    expect(session).toMatchObject({ isNewUser: true, user: { name: null, locale: 'ar', roles: ['user'] } });
    const read = await me(session.accessToken);
    expect([read.statusCode, read.json()]).toEqual([200, session.user]);
    const patched = await call('PATCH', '/v1/me', { token: session.accessToken, payload: { name: 'زينب', locale: 'ckb' } });
    expect([patched.statusCode, patched.json()]).toEqual([200, { ...session.user, name: 'زينب', locale: 'ckb' }]);
    expect((await me(session.accessToken)).json()).toMatchObject({ name: 'زينب', locale: 'ckb' });
  });

  it('rotates the refresh token, and reusing a rotated one revokes the whole family', async () => {
    const first = await login();
    const rotated = await refresh(first.refreshToken);
    expect(rotated.statusCode).toBe(200);
    const second = rotated.json() as Session;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await me(second.accessToken)).statusCode).toBe(200);

    const reuse = await refresh(first.refreshToken);
    expect([reuse.statusCode, reuse.json()]).toMatchObject([401, { code: 'refresh_invalid' }]);
    expect((await refresh(second.refreshToken)).statusCode).toBe(401);
    expect((await me(second.accessToken)).statusCode).toBe(401);
  });

  it('logs out: the refresh and access tokens of the session stop working', async () => {
    const session = await login();
    expect((await call('POST', '/v1/auth/logout', { payload: { refreshToken: session.refreshToken } })).statusCode).toBe(204);
    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    expect((await me(session.accessToken)).statusCode).toBe(401);
  });

  it('deletes the account: the erasers run, identity.user.deleted.v1 is delivered, the old tokens get 401', async () => {
    const { user, accessToken, refreshToken } = await login();
    expect((await call('DELETE', '/v1/me', { token: accessToken })).statusCode).toBe(204);
    expect(eraser.erased).toEqual([user.id]);
    const outbox = await tdb.db.execute<{ event: DomainEvent }>(`SELECT event FROM platform.outbox WHERE event->>'name' = 'identity.user.deleted.v1'`);
    expect(outbox.rows.map(({ event }) => event.payload)).toEqual([{ userId: user.id }]);
    await vi.waitFor(() => expect(deleted.map((e) => e.payload.userId)).toEqual([user.id]), { timeout: 5000 });
    expect((await me(accessToken)).statusCode).toBe(401);
    expect((await refresh(refreshToken)).statusCode).toBe(401);
  });

  it('wrote no phone number, token or OTP code to the logs', () => {
    const text = logs.text();
    expect(text).toContain('refresh token reuse'); // the capture saw the flow
    expect(text).not.toMatch(/\+9647\d{9}|(?<![\w.-])07\d{9}(?!\w)/);
    expect(text).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
    expect(sender.sent).toHaveLength(4);
    for (const { phone, code } of sender.sent) {
      expect(text).not.toContain(phone.slice(-10)); // 7xxxxxxxxx: the number in any format
      expect(text).not.toMatch(new RegExp(`(?<![\\w.])${code}(?!\\w)`));
    }
  });
});
