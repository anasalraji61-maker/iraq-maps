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

/** ts-rest client that injects the bearer token and, on 401, refreshes once (single-flight) and retries. */
export function createClient({ baseUrl, getTokens, onTokens, fetch: doFetch = (...args) => fetch(...args) }: CreateClientOptions): ApiClient {
  const send = async ({ route, path, method, headers, body }: ApiFetcherArgs, accessToken?: string) => {
    const res = await doFetch(baseUrl() + path, { method, body, headers: accessToken ? { ...headers, authorization: `Bearer ${accessToken}` } : headers });
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
  return initClient(apiContract, { baseUrl: '', baseHeaders: {}, api });
}
