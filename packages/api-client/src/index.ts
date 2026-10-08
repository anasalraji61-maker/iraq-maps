import { apiContract, type ApiContract, type TokenPair } from '@iraq-maps/contracts';
import { initClient, validateResponse, type ApiFetcherArgs, type InitClientReturn } from '@ts-rest/core';

export type ApiClient = InitClientReturn<ApiContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export interface CreateClientOptions {
  /** Read on every request so the developer server-URL setting applies without a restart. */
  baseUrl: () => string;
  getTokens(): TokenPair | null;
  /** Called after a successful refresh (new pair) or a failed one (null => signed out). */
  onTokens(tokens: TokenPair | null): void | Promise<void>;
  fetch?: typeof fetch;
}

/** OTP and refresh calls never carry (or renew) an access token. */
const UNAUTHENTICATED = /^\/v1\/auth\/(otp\/|refresh$)/;

/** ts-rest client that injects the bearer token and, on 401, refreshes once (single-flight) and retries. */
export function createClient(opts: CreateClientOptions): ApiClient {
  let refreshing: Promise<string | null> | undefined;

  const send = async ({ path, method, headers, body, fetchOptions }: ApiFetcherArgs, token: string | undefined) => {
    const res = await (opts.fetch ?? globalThis.fetch)(opts.baseUrl().replace(/\/+$/, '') + path, {
      ...fetchOptions,
      method,
      body,
      headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers,
    });
    const text = await res.text();
    const json = text !== '' && !!res.headers.get('content-type')?.includes('json');
    return { status: res.status, headers: res.headers, body: json ? (JSON.parse(text) as unknown) : text || undefined };
  };

  /**
   * Resolves to the new access token, or null when the server refused the refresh token (=> signed out) or failed.
   * A network error rejects without touching the stored tokens, so a flaky connection never signs the user out.
   */
  const refresh = (refreshToken: string) =>
    (refreshing ??= client.auth
      .refresh({ body: { refreshToken } })
      .then(async (res) => {
        if (res.status === 200) {
          await opts.onTokens(res.body);
          return res.body.accessToken;
        }
        if (res.status < 500) await opts.onTokens(null);
        return null;
      })
      .finally(() => (refreshing = undefined)));

  const client: ApiClient = initClient(apiContract, {
    baseUrl: '',
    baseHeaders: {},
    validateResponse: true,
    api: async (args: ApiFetcherArgs) => {
      const token = UNAUTHENTICATED.test(args.path) ? undefined : opts.getTokens()?.accessToken;
      let res = await send(args, token);
      const current = res.status === 401 && token ? opts.getTokens() : null;
      if (current) {
        // Another request may already have renewed the token while this one was in flight.
        const next = current.accessToken === token ? await refresh(current.refreshToken) : current.accessToken;
        if (next) res = await send(args, next);
      }
      return args.validateResponse ? { ...res, body: validateResponse({ appRoute: args.route, response: res }).body } : res;
    },
  });
  return client;
}
