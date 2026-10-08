# @iraq-maps/identity

Phone + OTP login, sessions, roles and account deletion. Owns the Postgres schema `identity` and the Redis keys `identity:*`.

## API

```ts
import { IdentityAuthGuard, identityModule, identityMigrationsDir, type AuthenticatedRequest } from '@iraq-maps/identity';

runModuleMigrations({ url, schema: 'identity', migrationsDir: identityMigrationsDir });
@Module({
  imports: [identityModule({ db, redisUrl, outbox, erasers, otpSender?, clock?, env? })],
  providers: [{ provide: APP_GUARD, useClass: IdentityAuthGuard }],
})
```

`IdentityAuthGuard` is the only auth check, and `/v1/me` relies on it. Every route except `/v1/auth/*` and the GET or
HEAD of `/health` and the six public places routes (`/v1/search`, `/v1/places/nearby`, `/v1/places/:id`, `/v1/cities`,
`/v1/cities/:id/tiles/:z/:x/:y`, `/v1/cities/:id/glyphs/:fontstack/:range`) needs a valid, unrevoked access token.
Routes are matched on the method and the exact registered pattern, so a new route under `/v1/places/`, or a POST on a
public path, stays protected. The guard sets `req.principal`
(`AuthenticatedRequest`) or answers 401 `{type, title, status: 401, code: 'unauthorized'}`.

`identityModule` is a global Nest module. It serves the `authContract` and `meContract` routers and provides:

| Token | Implementation |
|---|---|
| `PortTokens.IdentityPort` | `verifyAccessToken` (JWT + live-session check, current roles from the DB) and `getUser` |
| `PortTokens.PhoneVerificationPort` | the same OTP machinery and limits under a random `verificationId`; `start` throws `otp_<refusal>` when refused |

It consumes `OutboxPublisher<DbTx>`, the bound `UserDataEraser[]`, and optionally an `OtpSender` and a `Clock`.

| Route | Behaviour |
|---|---|
| `POST /v1/auth/otp/request` | 202 `{expiresAt, resendAfterSec: 60}`; 429 `otp_resend_too_soon` / `otp_rate_limited` / `otp_locked` |
| `POST /v1/auth/otp/verify` | 200 tokens + `user` + `isNewUser`; a new user writes `identity.user.registered.v1` to the outbox in the same transaction. 401 `otp_invalid` / `otp_expired`; 429 `otp_too_many_attempts` / `otp_locked` |
| `POST /v1/auth/refresh` | 200 new pair; 401 `refresh_invalid` |
| `POST /v1/auth/logout` | 204; revokes the session (refresh and access tokens) |
| `GET` / `PATCH /v1/me` | profile; `PATCH` takes `name` and `locale`; 401 `unauthorized` (from the guard) |
| `DELETE /v1/me` | 204. Runs every bound eraser, then deletes the identity rows and writes `identity.user.deleted.v1` in one transaction. Erasers must be idempotent. If one throws, the account is kept and DELETE can be retried; erasers that already ran will run again. |

## Security model

- **OTP:** a 6-digit code stored in Redis only as an HMAC, with a 5-minute TTL. A correct code is consumed. The 5th
  wrong code deletes the code.
- **OTP requests:** refused with 429 when any of these limits is hit:
  - 1 per 60s per phone, enforced on the server (`otp_resend_too_soon`).
  - 20 per 15 minutes per client network (`otp_rate_limited`). That is one IPv4 address, or one IPv6 /64; IPv4-mapped
    IPv6 counts as IPv4. The limit is higher than per phone because of carrier CGNAT.
- **Phone lock:** a phone is locked by either of these:
  - its 6th code request in 15 minutes (that request gets `otp_rate_limited`);
  - its 10th wrong code since the last lock, counted across codes and across login and verification.

  While locked, both requests and verifies get 429 `otp_locked`, including a correct pending code. Locks escalate:
  15 minutes, then 1 hour, then 4 hours for every further lock. The lock level is kept for 24h. Each lock resets the
  phone's failure and request counters. So someone who only knows the number can keep the owner out for at most 4
  hours at a time, never a whole day. Both checks run atomically in Lua scripts that share the lock logic.
- **Proxy:** behind a reverse proxy, set Fastify `trustProxy` to the hop count or to the proxy CIDRs, so that `req.ip`
  is the client's address. `true` is forbidden in production; the integrator enforces this in `apps/api`.
- **Phone:** stored as AES-256-GCM ciphertext (`PHONE_ENCRYPTION_KEY`) plus an HMAC for lookup (`PHONE_HASH_KEY`), in
  `identity.users` and in pending verification challenges. Redis keys use the HMAC. The phone is never logged, and
  the console sender prints only the code.
- **Sessions:** each `identity.sessions` row is one refresh-token family.
  - The access token is a 15-minute HS256 JWT (`JWT_ACCESS_SECRET`) that carries the session id. It is rejected once
    the session is revoked.
  - The refresh token is a 30-day HS256 JWT (`JWT_REFRESH_SECRET`) that carries the session id and a generation.
  - The two token kinds have different secrets (equal secrets refuse to boot) and a verified `aud` (`access` or
    `refresh`), so neither is accepted as the other.
  - Only the current generation can rotate. A validly signed older token is a reuse, and it revokes the whole family.
    Unsigned tokens are rejected and revoke nothing.
- **Roles:** `user` (the default), `provider`, `moderator` and `admin`.

## OTP senders (`OtpSender`)

| `OTP_SENDER` | Allowed when | Notes |
|---|---|---|
| injected (`FakeOtpSender`) | not production | tests and `createApp({ otpSender })` |
| `console` | `APP_ENV=development` | prints the code, never the phone |
| `fixed` | `APP_ENV=e2e` | every code is `OTP_FIXED_CODE` |
| `sms` | — | mocked until a provider is chosen ([MOCKS.md](../../docs/milestones/MOCKS.md)); refuses to boot |

Production refuses `fake`, `fixed` and `console` (both through `packages/config` `productionForbidden` and for injected senders).

## Env

| Var | |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 chars each; must differ (checked at boot) |
| `PHONE_ENCRYPTION_KEY` | base64 of 32 random bytes (`openssl rand -base64 32`) |
| `PHONE_HASH_KEY` | ≥ 32 chars |
| `OTP_SENDER`, `OTP_FIXED_CODE` | see above; not needed when a sender is injected |
| `APP_ENV` | required: `development`, `test`, `e2e` or `production` (via `packages/config`) |

`DATABASE_URL` and `REDIS_URL` are read by the composition root, which passes `db` and `redisUrl`.

## grant-role

```sh
APP_ENV=... DATABASE_URL=... PHONE_HASH_KEY=... pnpm --filter @iraq-maps/identity grant-role <userId|+9647xxxxxxxxx> <user|provider|moderator|admin>
```

The command is idempotent. It exits 1 when the user does not exist and 2 on bad arguments.

## Tests

Run `pnpm infra:local up`, then `pnpm --filter @iraq-maps/identity test`. The tests use an isolated database from
`createTestDatabase` and the local Redis. Each test uses a fresh phone and IP, because rate-limit counters stay in the
shared Redis (up to 24h). Tests stand in for waiting by deleting the relevant key: the 60s resend key, or a lock.
