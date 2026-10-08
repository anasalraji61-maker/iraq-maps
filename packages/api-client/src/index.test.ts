import type { CityId, Me, PlaceId, TokenPair } from '@iraq-maps/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createClient } from './index';

const pair = (n: number): TokenPair => ({ accessToken: `a${n}`, refreshToken: `r${n}`, accessExpiresAt: '2026-10-08T12:00:00.000Z' });
const me: Me = { id: '0b7c1d4e-8f9a-4b2c-9d3e-1f2a3b4c5d6e' as Me['id'], name: 'Ali', locale: 'ar', roles: ['user'], createdAt: '2026-10-08T10:00:00.000Z' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const problem = (status: number, code: string) => json(status, { type: 'about:blank', title: code, status, code });

/** Fake server: accepts only the current access token; /auth/refresh rotates it (after a tick, so calls overlap).
 * `slowCall` delays the n-th /v1/me answer until well after the refresh completed. */
function fakeServer(opts: { refresh: 'ok' | 'reject'; slowCall?: number }) {
  const current = pair(2);
  const calls: string[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('http://api.test', '');
    calls.push(path);
    if (path === '/v1/auth/refresh') {
      await new Promise((r) => setTimeout(r, 5));
      if (opts.refresh === 'reject') return problem(401, 'refresh_invalid');
      return json(200, current);
    }
    const auth = new Headers(init?.headers).get('authorization');
    if (calls.length === opts.slowCall) await new Promise((r) => setTimeout(r, 30));
    return auth === `Bearer ${current.accessToken}` ? json(200, me) : problem(401, 'unauthorized');
  });
  return { fetch, calls };
}

function setup(opts: { refresh: 'ok' | 'reject'; slowCall?: number }) {
  const server = fakeServer(opts);
  let tokens: TokenPair | null = pair(1);
  const onTokens = vi.fn((t: TokenPair | null) => void (tokens = t));
  const client = createClient({ baseUrl: () => 'http://api.test', getTokens: () => tokens, onTokens, fetch: server.fetch });
  return { client, server, onTokens, tokens: () => tokens };
}

describe('createClient', () => {
  it('injects the bearer token and reads baseUrl per request', async () => {
    const { client, server } = setup({ refresh: 'ok' });
    await client.me.get();
    expect(server.fetch.mock.calls[0]?.[0]).toBe('http://api.test/v1/me');
    expect(new Headers(server.fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer a1');
  });

  it('parallel 401s trigger exactly one refresh, then every call retries with the new token', async () => {
    const { client, server, onTokens, tokens } = setup({ refresh: 'ok' });
    const results = await Promise.all([client.me.get(), client.me.get(), client.me.get()]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(server.calls.filter((p) => p === '/v1/auth/refresh')).toHaveLength(1);
    expect(onTokens).toHaveBeenCalledTimes(1);
    expect(tokens()).toEqual(pair(2));
  });

  it('a 401 that arrives after the refresh finished reuses it instead of refreshing again', async () => {
    const { client, server } = setup({ refresh: 'ok', slowCall: 2 });
    const results = await Promise.all([client.me.get(), client.me.get()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(server.calls).toEqual(['/v1/me', '/v1/me', '/v1/auth/refresh', '/v1/me', '/v1/me']);
  });

  it('a rejected refresh logs out (onTokens(null)) and surfaces the typed 401 Problem', async () => {
    const { client, onTokens } = setup({ refresh: 'reject' });
    const [a, b] = await Promise.all([client.me.get(), client.me.get()]);
    expect(onTokens).toHaveBeenCalledExactlyOnceWith(null);
    expect(a.status).toBe(401);
    if (a.status === 401) expect(a.body.code).toBe('unauthorized');
    expect(b.status).toBe(401);
  });

  it.each([
    ['signed in', pair(1)],
    ['signed out', null],
  ])('does not refresh on a 401 with another code (%s)', async (_state, tokens) => {
    const fetch = vi.fn(async () => problem(401, 'otp_invalid'));
    const onTokens = vi.fn();
    const client = createClient({ baseUrl: () => '', getTokens: () => tokens, onTokens, fetch });
    const res = await client.auth.verifyOtp({ body: { phone: '+9647701234567', code: '123456' } });
    expect(res.status).toBe(401);
    if (res.status === 401) expect(res.body.code).toBe('otp_invalid');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onTokens).not.toHaveBeenCalled();
  });

  it('surfaces 429 and 500 Problem bodies typed and validated', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(problem(429, 'otp_resend_too_soon'))
      .mockResolvedValueOnce(json(500, { title: 'Internal', status: 500, code: 'internal' }));
    const client = createClient({ baseUrl: () => '', getTokens: () => null, onTokens: vi.fn(), fetch });
    const limited = await client.auth.requestOtp({ body: { phone: '+9647701234567', locale: 'ar' } });
    expect(limited.status === 429 && limited.body.code).toBe('otp_resend_too_soon');
    const crashed = await client.health.health();
    expect(crashed).toMatchObject({ status: 500, body: { type: 'about:blank', code: 'internal' } });
  });

  it('passes the abort signal of a superseded call to fetch', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(200, { items: [] }));
    const client = createClient({ baseUrl: () => '', getTokens: () => null, onTokens: vi.fn(), fetch });
    const controller = new AbortController();
    controller.abort();
    await client.places.search({ query: { q: 'قلعه', city: 'baghdad' }, fetchOptions: { signal: controller.signal } });
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('encodes path params, so a place id cannot change the path', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request) => problem(404, 'not_found'));
    const client = createClient({ baseUrl: () => 'http://api.test', getTokens: () => null, onTokens: vi.fn(), fetch });
    await client.places.get({ params: { id: '../me' as PlaceId } });
    await client.cities.glyphs({ params: { id: 'baghdad' as CityId, fontstack: 'Noto Sans Arabic Regular', range: '0-255.pbf' } });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'http://api.test/v1/places/..%2Fme',
      'http://api.test/v1/cities/baghdad/glyphs/Noto%20Sans%20Arabic%20Regular/0-255.pbf',
    ]);
    for (const id of ['', '.', '..']) await expect(client.places.get({ params: { id: id as PlaceId } })).rejects.toThrow('invalid path parameter');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('a network error during refresh does not log out, and the next 401 retries the refresh', async () => {
    let tokens: TokenPair | null = pair(1);
    let refreshes = 0;
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/auth/refresh')) {
        if (++refreshes === 1) throw new TypeError('Network request failed');
        return json(200, pair(2));
      }
      return problem(401, 'unauthorized');
    });
    const onTokens = vi.fn((t: TokenPair | null) => void (tokens = t));
    const client = createClient({ baseUrl: () => '', getTokens: () => tokens, onTokens, fetch });
    await expect(client.me.get()).rejects.toThrow('Network request failed');
    expect(onTokens).not.toHaveBeenCalled();
    await client.me.get();
    expect(onTokens).toHaveBeenCalledExactlyOnceWith(pair(2));
  });
});
