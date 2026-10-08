# M0 contract requests from builder-identity

## 1. meContract loses its 401 response in the ts-rest types (blocking for type-safety, not for runtime)

**Status: resolved (integrator, M0).** Each `meContract` route now declares `401: Problem` literally, and the `as never`
cast in `modules/identity/src/http.ts` is gone.

`packages/contracts/src/http.ts` declares `const authed = { 401: Problem } as const` and spreads it into each `meContract`
route (`responses: { 200: Me, ...authed }`). TypeScript turns a spread numeric key into the string key `"401"`
(`keyof typeof meContract.get.responses` is `200 | "401"`), and ts-rest keeps only numeric `HTTPStatusCode` keys. So:

- the server types reject `{ status: 401 }` from `get`/`update`/`remove` (identity works around it with one `as never`
  cast in `modules/identity/src/http.ts`, marked with a comment pointing here);
- `ClientInferResponses` in `packages/api-client` has no 401 variant for `/v1/me`.

Runtime behaviour is unaffected (`responses["401"]` resolves). Proposed additive fix: write `401: Problem` literally in
each `meContract` route (or type `authed` as `{ 401: typeof Problem }`). After it lands, drop the cast in identity.

## 2. PhoneVerificationPort.start has no rate-limited outcome (non-blocking, for M3)

**Status: deferred** to the milestone where the providers module first consumes the port. Until then `start()` throws
`Error('otp_rate_limited')`, as documented in `modules/identity/README.md`.

`start()` shares the login limits per phone: a 60s resend wait, and an escalating lock (15 min, then 1 h, then 4 h)
after more than 5 requests in 15 minutes or 10 wrong codes. The port's return type has no variant for a refusal, so identity throws
`Error('otp_resend_too_soon' | 'otp_rate_limited' | 'otp_locked')`. Consider adding
`| { refused: 'resend_too_soon' | 'rate_limited' | 'locked' }` (or documenting the error) before the providers module
consumes the port in M3. `confirm()` reports a locked phone as `too_many_attempts`.
