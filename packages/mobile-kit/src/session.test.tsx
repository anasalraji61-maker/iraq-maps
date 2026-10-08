import { Me, TokenPair } from '@iraq-maps/contracts';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SessionProvider, useApi, useSession } from './index';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockStore.set(key, value),
  deleteItemAsync: async (key: string) => void mockStore.delete(key),
}));

const TOKENS = 'iraq-maps.session.tokens';
const USER = 'iraq-maps.session.user';
const session = (n: number) => TokenPair.parse({ accessToken: `jwt-${n}`, refreshToken: `rt-${n}`, accessExpiresAt: '2026-10-08T18:00:00.000Z' });
const profile = (name: string | null) =>
  Me.parse({ id: '7c0b1f9e-2a51-4f6b-8d0e-3b9a7c5d1e22', name, locale: 'ckb', roles: ['user'], createdAt: '2026-10-01T08:00:00.000Z' });
const stored = (key: string) => JSON.parse(mockStore.get(key) ?? 'null') as unknown;

type Request = { method: string; url: string; auth: string | null; body: unknown };
let requests: Request[];
let respond: (req: Request) => Response | Promise<Response>;
const reply = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const problem = () => reply(401, { type: 'about:blank', title: 'Unauthorized', status: 401 });

beforeEach(() => {
  mockStore.clear();
  requests = [];
  respond = () => reply(200, profile('سارا'));
  globalThis.fetch = async (input, init) => {
    const req = { method: init?.method ?? 'GET', url: String(input), auth: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body ?? 'null')) };
    requests.push(req);
    return respond(req);
  };
});

const seed = (tokens: unknown, user: unknown) => {
  mockStore.set(TOKENS, typeof tokens === 'string' ? tokens : JSON.stringify(tokens));
  mockStore.set(USER, typeof user === 'string' ? user : JSON.stringify(user));
};

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider apiBaseUrl={() => 'http://10.0.2.2:3000/'}>{children}</SessionProvider>;

async function renderSession(expected: 'signedIn' | 'signedOut') {
  const hook = await renderHook(() => ({ session: useSession(), api: useApi() }), { wrapper });
  await waitFor(() => expect(hook.result.current.session.state.status).toBe(expected));
  return hook.result;
}

describe('SessionProvider', () => {
  it('starts loading, then signs out when nothing is stored', async () => {
    const statuses: string[] = [];
    await renderHook(() => statuses.push(useSession().state.status), { wrapper });
    await waitFor(() => expect(statuses.at(-1)).toBe('signedOut'));
    expect(statuses[0]).toBe('loading');
    expect(requests).toEqual([]);
  });

  it('restores the stored session and refreshes the profile in the background', async () => {
    seed(session(1), profile('قديم'));
    const result = await renderSession('signedIn');
    await waitFor(() => expect(result.current.session.state).toEqual({ status: 'signedIn', user: profile('سارا') }));
    expect(requests).toMatchObject([{ method: 'GET', url: 'http://10.0.2.2:3000/v1/me', auth: 'Bearer jwt-1' }]);
    expect(stored(USER)).toEqual(profile('سارا'));
  });

  it('keeps the cached session offline', async () => {
    seed(session(1), profile('قديم'));
    respond = () => Promise.reject(new TypeError('Network request failed'));
    const result = await renderSession('signedIn');
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(result.current.session.state).toEqual({ status: 'signedIn', user: profile('قديم') });
    expect(stored(TOKENS)).toEqual(session(1));
  });

  it.each([
    ['unparsable tokens', '{"accessToken":', profile('سارا')],
    ['tokens that fail the schema', { accessToken: 'jwt-1' }, profile('سارا')],
    ['a missing profile', session(1), 'null'],
  ])('clears %s and signs out', async (_case, tokens, user) => {
    seed(tokens, user);
    await renderSession('signedOut');
    expect(mockStore.size).toBe(0);
    expect(requests).toEqual([]);
  });

  it('signIn persists the tokens and the user', async () => {
    const result = await renderSession('signedOut');
    await act(() => result.current.session.signIn(session(1), profile(null)));
    expect(result.current.session.state).toEqual({ status: 'signedIn', user: profile(null) });
    expect([stored(TOKENS), stored(USER)]).toEqual([session(1), profile(null)]);
    await result.current.api.me.get();
    expect(requests.at(-1)?.auth).toBe('Bearer jwt-1');
  });

  it('updateUser updates the state and the stored profile', async () => {
    seed(session(1), profile('سارا'));
    const result = await renderSession('signedIn');
    await act(async () => result.current.session.updateUser(profile('ئاسۆ')));
    expect(result.current.session.state).toEqual({ status: 'signedIn', user: profile('ئاسۆ') });
    await waitFor(() => expect(stored(USER)).toEqual(profile('ئاسۆ')));
  });

  it('signOut clears the stored session and revokes the refresh token, even offline', async () => {
    seed(session(1), profile('سارا'));
    const result = await renderSession('signedIn');
    respond = () => Promise.reject(new TypeError('Network request failed'));
    await act(() => result.current.session.signOut());
    expect(result.current.session.state).toEqual({ status: 'signedOut' });
    expect(mockStore.size).toBe(0);
    expect(requests.at(-1)).toMatchObject({ method: 'POST', url: 'http://10.0.2.2:3000/v1/auth/logout', body: { refreshToken: 'rt-1' } });
  });

  it('stores the rotated pair when an expired access token is refreshed', async () => {
    seed(session(1), profile('سارا'));
    respond = ({ url, auth }) => (url.endsWith('/v1/auth/refresh') ? reply(200, session(2)) : auth === 'Bearer jwt-2' ? reply(200, profile('سارا')) : problem());
    const result = await renderSession('signedIn');
    await waitFor(() => expect(stored(TOKENS)).toEqual(session(2)));
    expect(result.current.session.state.status).toBe('signedIn');
  });

  it('signs out when the server rejects the refresh token', async () => {
    seed(session(1), profile('سارا'));
    respond = problem;
    await renderSession('signedOut');
    expect(mockStore.size).toBe(0);
    expect(requests.map((r) => r.url)).toEqual(['http://10.0.2.2:3000/v1/me', 'http://10.0.2.2:3000/v1/auth/refresh']);
  });

  it.each<[string, () => unknown]>([
    ['useSession', useSession],
    ['useApi', useApi],
  ])('%s throws outside the provider', async (name, hook) => {
    const silenced = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(hook)).rejects.toThrow(`${name}() must be used inside <SessionProvider>`);
    silenced.mockRestore();
  });
});
