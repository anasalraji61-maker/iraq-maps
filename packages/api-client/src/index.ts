import { apiContract, Problem, type ApiContract, type TokenPair } from '@iraq-maps/contracts';
import { initClient, isZodType, type ApiFetcher, type ApiFetcherArgs, type InitClientReturn } from '@ts-rest/core';

export type ApiClient = InitClientReturn<ApiContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export interface CreateClientOptions {
  /** Read on every request so the developer server-URL setting applies without a restart. */
  baseUrl: () => string;
  getTokens(): TokenPair | null;
  /** Called after a successful refresh (new pair) or a failed one (null => signed out). */
  onTokens(tokens: TokenPair | null): void | Promise<void>;
  fetch?: typeof fetch;
}

// '', '.' and '..' would drop or climb a path segment even when percent-encoded (URL parsers treat %2E as a dot).
const encodeParam = (value: unknown) => {
  const s = String(value);
  if (/^\.{0,2}$/.test(s)) throw new TypeError(`invalid path parameter "${s}"`);
  return encodeURIComponent(s);
};

/** ts-rest inserts path params verbatim: encode each one, so a placeId such as `../me` stays one path segment. */
function encodingPathParams<T extends object>(client: T): T {
  const wrap = (route: (args?: { params?: object }) => Promise<unknown>) => async (args?: { params?: object }) =>
    route(args?.params ? { ...args, params: Object.fromEntries(Object.entries(args.params).map(([k, v]) => [k, encodeParam(v)])) } : args);
  return Object.fromEntries(
    Object.entries(client).map(([key, value]) => [key, typeof value === 'function' ? wrap(value as Parameters<typeof wrap>[0]) : encodingPathParams(value as object)]),
  ) as T;
}

/** ts-rest client that injects the bearer token and, on 401, refreshes once (single-flight) and retries. */
export function createClient({ baseUrl, getTokens, onTokens, fetch: doFetch = (...args) => fetch(...args) }: CreateClientOptions): ApiClient {
  const send = async ({ route, path, method, headers, body, fetchOptions }: ApiFetcherArgs, accessToken?: string) => {
    const res = await doFetch(baseUrl() + path, {
      method,
      body,
      // A superseded search aborts its request (fetchOptions: { signal }).
      signal: fetchOptions?.signal,
      headers: accessToken ? { ...headers, authorization: `Bearer ${accessToken}` } : headers,
    });
    const json: unknown = res.headers.get('content-type')?.includes('json') ? await res.json() : undefined;
    // Every server answer is validated against the contract (errors are Problem bodies, see apps/api).
    const schema = route.responses[res.status] ?? (res.status >= 400 ? Problem : undefined);
    return { status: res.status, headers: res.headers, body: isZodType(schema) ? schema.parse(json) : json };
  };
  const auth = initClient(apiContract.auth, { baseUrl: '', api: (args) => send(args) });

  // One refresh per stale access token: concurrent refreshes would trip the server's reuse detection and log the user out.
  let refreshing: { from: string; next: Promise<TokenPair | null> } | undefined;
  const refreshFrom = (stale: TokenPair) => {
    if (refreshing?.from !== stale.accessToken) {
      const next = auth.refresh({ body: { refreshToken: stale.refreshToken } }).then(async (res) => {
        if (res.status !== 200 && res.status !== 401) throw new Error(`refresh failed with ${res.status}`);
        const pair = res.status === 200 ? res.body : null;
        await onTokens(pair);
        return pair;
      });
      // A network or server error is not a rejection of the refresh token: forget it so the next 401 retries.
      next.catch(() => (refreshing = undefined));
      refreshing = { from: stale.accessToken, next };
    }
    return refreshing.next;
  };

  const api: ApiFetcher = async (args) => {
    const tokens = getTokens();
    const res = await send(args, tokens?.accessToken);
    if (res.status !== 401 || !tokens || (res.body as Problem).code !== 'unauthorized') return res;
    const fresh = await refreshFrom(tokens);
    return fresh ? send(args, fresh.accessToken) : res;
  };
  return encodingPathParams(initClient(apiContract, { baseUrl: '', baseHeaders: {}, api }));
}
