# @iraq-maps/api-client

Typed HTTP client for the Iraq Smart Maps API. The mobile app and the admin panel reach the server only through this package.

## Provides

- `createClient(opts): ApiClient`: a ts-rest client for `apiContract` (`health`, `auth`, `me`). Each call resolves to `{ status, body, headers }` and is typed from the contract.
- `ApiClient`, `CreateClientOptions` types.

| Option | Meaning |
|---|---|
| `baseUrl()` | Read on **every** request (trailing `/` trimmed), so the developer server-URL setting applies without a restart. |
| `getTokens()` | Current `TokenPair` or `null`. |
| `onTokens(pair \| null)` | Awaited after a refresh: the new pair, or `null` when the server rejected the refresh token (sign out). |
| `fetch` | Optional; defaults to `globalThis.fetch`. |

## Behaviour

- **Bearer token:** `Authorization: Bearer <accessToken>` is added when `getTokens()` returns a pair, except on `/v1/auth/otp/*` and `/v1/auth/refresh`.
- **Refresh on 401:** a 401 on a request that carried an access token triggers one `POST /v1/auth/refresh { refreshToken }`.
  - Single-flight: concurrent 401s share the same refresh. A request whose token was already replaced while it was in flight retries with the current token without refreshing again.
  - 200: `await onTokens(newPair)`, then the original request is retried **once** with the new token. A second 401 is returned as-is (no loop).
  - 4xx (the refresh token is invalid or revoked): `await onTokens(null)` and the original 401 is returned.
  - 5xx: tokens are left untouched and the original 401 is returned.
  - Network error: tokens are left untouched and the error is thrown. Intermittent connectivity never signs the user out.
- **Bodies:** JSON request bodies; JSON responses are parsed, empty bodies (204) become `undefined`, other content types are returned as text.
- **Validation:** every response whose status has a zod schema in the contract is parsed with it (defaults applied, unknown keys stripped). A mismatch throws ts-rest's `ResponseValidationError`. A single call can opt out with `overrideClientOptions: { validateResponse: false }`.

## Ports

- Consumes: `apiContract`, `TokenPair` from `@iraq-maps/contracts`.
- Provides: no port; `@iraq-maps/mobile-kit` wraps it with the session.

## Environment variables

None. The base URL comes from the caller.

## Tests

`pnpm --filter @iraq-maps/api-client test` (Vitest, fake `fetch`): token injection, per-request base URL, refresh and retry, single-flight refresh, sign-out on rejected refresh, network and 5xx errors keep the session, no refresh without a session, no retry loop, 204 and non-JSON bodies, contract validation.
