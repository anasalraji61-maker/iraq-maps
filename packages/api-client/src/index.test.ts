import type { TokenPair } from '@iraq-maps/contracts';
import { ResponseValidationError } from '@ts-rest/core';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from './index';

const pair = (n: number): TokenPair => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, accessExpiresAt: '2026-10-08T12:00:00.000Z' });
const me = { id: '0b9d6a51-6f3c-4c39-9a64-5d2a4f1d8e10', name: 'زينب', locale: 'ar', roles: ['user'], createdAt: '2026-10-08T09:00:00.000Z' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const unauthorized = () => json(401, { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'unauthorized' });

type Handler = (path: string, auth: string | null) => Response | Promise<Response>;

/** Fake API: protected routes accept only `Bearer <accepted>`; /v1/auth/refresh answers with `onRefresh` (default: pair 2). */
const server =
  (accepted: string, onRefresh: () => Response | Promise<Response> = () => json(200, pair(2))): Handler =>
  (path, auth) =>
    path === '/v1/auth/refresh' ? onRefresh() : auth === `Bearer ${accepted}` ? json(200, me) : unauthorized();

function setup(handler: Handler, initial: TokenPair | null = pair(1), baseUrl = () => 'https://api.example.iq/') {
  let tokens = initial;
  const calls: { url: string; path: string; auth: string | null; body: unknown }[] = [];
  const onTokens = vi.fn(async (next: TokenPair | null) => {
    tokens = next;
  });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get('authorization');
    calls.push({ url, path: new URL(url).pathname, auth, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
    return handler(new URL(url).pathname, auth);
  };
  return { api: createClient({ baseUrl, getTokens: () => tokens, onTokens, fetch }), calls, onTokens, tokens: () => tokens };
}

const trace = (calls: { path: string; auth: string | null }[]) => calls.map((c) => `${c.path} ${c.auth ?? '-'}`);

describe('createClient', () => {
  it('injects the bearer token on protected routes but not on OTP or refresh calls', async () => {
    const { api, calls } = setup((path) => (path === '/v1/me' ? json(200, me) : json(202, { expiresAt: '2026-10-08T09:05:00.000Z', resendAfterSec: 60 })));
    expect((await api.me.get()).status).toBe(200);
    expect((await api.auth.requestOtp({ body: { phone: '+9647701234567', locale: 'ar' } })).status).toBe(202);
    expect(trace(calls)).toEqual(['/v1/me Bearer access-1', '/v1/auth/otp/request -']);
    expect(calls[1]?.body).toEqual({ phone: '+9647701234567', locale: 'ar' });
  });

  it('reads baseUrl on every request and trims trailing slashes', async () => {
    let base = 'https://api.example.iq/';
    const { api, calls } = setup(server('access-1'), pair(1), () => base);
    await api.me.get();
    base = 'http://10.0.2.2:3000';
    await api.me.get();
    expect(calls.map((c) => c.url)).toEqual(['https://api.example.iq/v1/me', 'http://10.0.2.2:3000/v1/me']);
  });

  it('refreshes once on 401, hands the new pair to onTokens and retries with it', async () => {
    const { api, calls, onTokens } = setup(server('access-2'));
    expect(await api.me.get()).toMatchObject({ status: 200, body: me });
    expect(onTokens).toHaveBeenCalledExactlyOnceWith(pair(2));
    expect(trace(calls)).toEqual(['/v1/me Bearer access-1', '/v1/auth/refresh -', '/v1/me Bearer access-2']);
    expect(calls[1]?.body).toEqual({ refreshToken: 'refresh-1' });
  });

  it('shares one refresh between concurrent 401s', async () => {
    const slowRefresh = () => new Promise<Response>((resolve) => setTimeout(() => resolve(json(200, pair(2))), 20));
    const { api, calls } = setup(server('access-2', slowRefresh));
    const results = await Promise.all([api.me.get(), api.me.get(), api.me.get()]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(calls.filter((c) => c.path === '/v1/auth/refresh')).toHaveLength(1);
  });

  it('signs out when the refresh token is rejected and returns the original 401', async () => {
    const { api, calls, onTokens } = setup(server('access-2', unauthorized));
    expect((await api.me.get()).status).toBe(401);
    expect(onTokens).toHaveBeenCalledExactlyOnceWith(null);
    expect(trace(calls)).toEqual(['/v1/me Bearer access-1', '/v1/auth/refresh -']);
  });

  it('keeps the session when the refresh fails on the network, surfacing the error', async () => {
    const { api, onTokens, tokens } = setup(server('access-2', () => Promise.reject(new TypeError('Network request failed'))));
    await expect(api.me.get()).rejects.toThrow('Network request failed');
    expect(onTokens).not.toHaveBeenCalled();
    expect(tokens()).toEqual(pair(1));
  });

  it('keeps the session when the server fails to refresh', async () => {
    const { api, onTokens } = setup(server('access-2', () => new Response('unavailable', { status: 503 })));
    expect((await api.me.get()).status).toBe(401);
    expect(onTokens).not.toHaveBeenCalled();
  });

  it('never refreshes without a session', async () => {
    const { api, calls, onTokens } = setup(server('access-1'), null);
    expect((await api.me.get()).status).toBe(401);
    expect(trace(calls)).toEqual(['/v1/me -']);
    expect(onTokens).not.toHaveBeenCalled();
  });

  it('returns a second 401 as-is instead of looping', async () => {
    const { api, calls, onTokens } = setup(server('revoked-everywhere'));
    expect((await api.me.get()).status).toBe(401);
    expect(trace(calls)).toEqual(['/v1/me Bearer access-1', '/v1/auth/refresh -', '/v1/me Bearer access-2']);
    expect(onTokens).toHaveBeenCalledExactlyOnceWith(pair(2));
  });

  it('handles empty 204 bodies and non-JSON error pages', async () => {
    const { api } = setup((path) => (path === '/v1/auth/logout' ? new Response(null, { status: 204 }) : new Response('<html>Bad gateway</html>', { status: 502 })));
    expect(await api.auth.logout({ body: { refreshToken: 'refresh-1' } })).toMatchObject({ status: 204, body: undefined });
    expect(await api.health.health()).toMatchObject({ status: 502, body: '<html>Bad gateway</html>' });
  });

  it('rejects responses that break the contract', async () => {
    const { api } = setup(() => json(200, { ...me, id: 'not-a-uuid' }));
    await expect(api.me.get()).rejects.toBeInstanceOf(ResponseValidationError);
  });
});
