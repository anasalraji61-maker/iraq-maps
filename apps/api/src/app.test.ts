import { PortTokens, type DomainEvent, type EventBus } from '@iraq-maps/contracts';
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { captureLogs } from '@iraq-maps/observability';
import { FakeOtpSender, identityTestEnv, randomIp, randomPhone } from '@iraq-maps/testing';
import type { AuthenticatedRequest } from '@iraq-maps/identity';
import { Controller, Get, Req } from '@nestjs/common';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createApp, moduleMigrations } from './app';

const MARKER = 'Secret-Name-Marker';
const logs = captureLogs();
const sender = new FakeOtpSender();
// Fails like a driver error whose message carries user data (drizzle: "Failed query: ... params: ...").
const failingEraser = { module: 'test', erase: async () => Promise.reject(Object.assign(new Error(`Failed query, params: ${MARKER}`), { cause: { code: '22021' } })) };

/** A non-identity route: only the global guard protects it, and it sets the principal. */
@Controller()
class ProtectedDummy {
  @Get('/v1/dummy')
  get(@Req() req: AuthenticatedRequest) {
    return { userId: req.principal.userId };
  }
}

let tdb: TestDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
const delivered: DomainEvent[] = [];

beforeAll(async () => {
  tdb = await createTestDatabase({ modules: moduleMigrations });
  const env = { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379' };
  app = await createApp({ env, otpSender: sender, erasers: [failingEraser], logger: true, controllers: [ProtectedDummy] });
  app.get<EventBus>(PortTokens.EventBus).subscribe('identity.user.registered.v1', (e) => void delivered.push(e));
});

afterAll(async () => {
  logs.stop();
  await app?.close();
  await tdb?.drop();
});

const post = (url: string, payload: object, remoteAddress = randomIp()) => app.inject({ method: 'POST', url, payload, remoteAddress });

async function login() {
  const phone = randomPhone();
  expect((await post('/v1/auth/otp/request', { phone })).statusCode).toBe(202);
  const verified = await post('/v1/auth/otp/verify', { phone, code: sender.lastCodeFor(phone) });
  expect(verified.statusCode).toBe(200);
  const body = verified.json() as { accessToken: string; user: { id: string } };
  return { userId: body.user.id, headers: { authorization: `Bearer ${body.accessToken}` } };
}

const invalidRequest = { type: 'about:blank', title: 'Invalid request', status: 400, code: 'invalid_request' };

it('GET /health returns ok', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ status: 'ok' });
});

it('serves the OpenAPI document without a token', async () => {
  const res = await app.inject({ method: 'GET', url: '/openapi.json' });
  expect(res.statusCode).toBe(200);
  expect(Object.keys(res.json().paths)).toEqual(expect.arrayContaining(['/health', '/v1/auth/otp/request', '/v1/me']));
});

it('guards every route but /health and /v1/auth/*, including non-identity ones', async () => {
  for (const url of ['/v1/me', '/v1/dummy']) {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ status: 401, code: 'unauthorized' });
  }
  const { userId, headers } = await login();
  expect((await app.inject({ method: 'GET', url: '/v1/dummy', headers })).json()).toEqual({ userId });
});

it('logs in with an OTP, reads GET /v1/me, and the relay delivers identity.user.registered.v1 to the bus', async () => {
  const { userId, headers } = await login();
  const res = await app.inject({ method: 'GET', url: '/v1/me', headers });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ id: userId, locale: 'ar', roles: ['user'] });
  await vi.waitFor(() => expect(delivered.map((e) => e.payload.userId)).toContain(userId), { timeout: 5000 });
});

it('answers invalid requests with the 400 Problem', async () => {
  const badPhone = await post('/v1/auth/otp/request', { phone: '+9641234' });
  expect([badPhone.statusCode, badPhone.json()]).toEqual([400, invalidRequest]);
  const { headers } = await login();
  const emptyName = await app.inject({ method: 'PATCH', url: '/v1/me', headers, payload: { name: '' } });
  expect([emptyName.statusCode, emptyName.json()]).toEqual([400, invalidRequest]);
});

it('never logs error messages or request data', async () => {
  const { headers } = await login();
  const patch = await app.inject({ method: 'PATCH', url: '/v1/me', headers, payload: { name: `Zainab\u0000${MARKER}` } });
  expect(patch.statusCode).toBe(400); // control characters are refused by the contract
  const remove = await app.inject({ method: 'DELETE', url: '/v1/me', headers });
  expect([remove.statusCode, remove.json()]).toEqual([500, { type: 'about:blank', title: 'Internal server error', status: 500, code: 'internal' }]);
  expect(logs.records).toContainEqual(expect.objectContaining({ errorName: 'Error', pgCode: '22021', route: '/v1/me', msg: 'unhandled error' }));
  expect(logs.text()).not.toContain(MARKER);
});
