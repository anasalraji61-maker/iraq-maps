# @iraq-maps/api-client

`createClient({ baseUrl, getTokens, onTokens, fetch? })` returns a typed ts-rest client for `apiContract` (`/health`,
`/v1/auth/*` and `/v1/me`). It is the only way the app and the admin panel reach the API.

- `baseUrl()` is read on every request, so the developer server-URL setting applies without a restart.
- The client adds `authorization: Bearer <accessToken>` from `getTokens()`.
- On a 401 with `code: 'unauthorized'`, it refreshes once and retries once. The refresh is single-flight per stale access
  token, so parallel 401s, or one that arrives after the refresh finished, share one `POST /v1/auth/refresh`. A second
  refresh with the same token would trip the server's reuse detection and revoke the session.
- A refresh rejected with 401 calls `onTokens(null)` (signed out) and surfaces the original 401. A network or 5xx failure
  does not sign out; the call rejects and the next 401 retries the refresh. A new pair goes to `onTokens(pair)`.
- Every response is validated with the contract's zod schema for its status. Errors without one are parsed as `Problem`,
  so `res.status === 429 && res.body.code` is typed.

**Ports:** none. **Env:** none (the caller passes `baseUrl`).
