# @iraq-maps/identity

Phone + OTP login, sessions, roles and account deletion. Owns the Postgres schema `identity` and the Redis keys `identity:*`.

## API

```ts
import { identityModule, identityMigrationsDir } from '@iraq-maps/identity';

runModuleMigrations({ url, schema: 'identity', migrationsDir: identityMigrationsDir });
@Module({ imports: [identityModule({ db, redisUrl, outbox, erasers, otpSender?, clock?, env? })] })
```

`identityModule` is a global Nest module. It serves the `authContract` and `meContract` routers and provides:

| Token | Implementation |
|---|---|
| `PortTokens.IdentityPort` | `verifyAccessToken` (JWT + live-session check, current roles from the DB) and `getUser` |
| `PortTokens.PhoneVerificationPort` | the same OTP machinery under a random `verificationId`; `start` throws `otp_rate_limited` when limited |

It consumes `OutboxPublisher<DbTx>`, the bound `UserDataEraser[]`, and optionally an `OtpSender` and a `Clock`.

| Route | Behaviour |
|---|---|
| `POST /v1/auth/otp/request` | 202 `{expiresAt, resendAfterSec: 60}`; 429 `otp_rate_limited` |
| `POST /v1/auth/otp/verify` | 200 tokens + `user` + `isNewUser`; a new user writes `identity.user.registered.v1` to the outbox in the same transaction. 401 `otp_invalid` / `otp_expired`; 429 `otp_too_many_attempts` |
| `POST /v1/auth/refresh` | 200 new pair; 401 `refresh_invalid` |
| `POST /v1/auth/logout` | 204; revokes the session (refresh and access tokens) |
| `GET` / `PATCH /v1/me` | profile; `PATCH` takes `name` and `locale`; 401 `unauthorized` |
| `DELETE /v1/me` | 204. Runs every bound eraser, then deletes the identity rows and writes `identity.user.deleted.v1` in one transaction. If an eraser throws, nothing is deleted and the client can retry. |

## Security model

- **OTP:** a 6-digit code stored in Redis only as an HMAC, with a 5-minute TTL. A correct code is consumed. The 5th wrong
  code deletes it (checked atomically in Lua). Requests are limited per 15-minute window: 5 per phone and 20 per IP (the
  IP limit is higher because of carrier CGNAT). Behind a reverse proxy, enable Fastify `trustProxy` so that `req.ip`
  is the client's address.
- **Phone:** stored as AES-256-GCM ciphertext (`PHONE_ENCRYPTION_KEY`) plus an HMAC for lookup (`PHONE_HASH_KEY`), in
  `identity.users` and in pending verification challenges. Redis keys use the HMAC. The phone is never logged, and
  the console sender prints only the code.
- **Sessions:** each `identity.sessions` row is one refresh-token family.
  - The access token is a 15-minute HS256 JWT (`JWT_ACCESS_SECRET`) that carries the session id. It is rejected once
    the session is revoked.
  - The refresh token is a 30-day HS256 JWT (`JWT_REFRESH_SECRET`) that carries the session id and a generation.
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
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | ≥ 32 chars each, different |
| `PHONE_ENCRYPTION_KEY` | base64 of 32 random bytes (`openssl rand -base64 32`) |
| `PHONE_HASH_KEY` | ≥ 32 chars |
| `OTP_SENDER`, `OTP_FIXED_CODE` | see above; not needed when a sender is injected |
| `APP_ENV` | via `packages/config` |

`DATABASE_URL` and `REDIS_URL` are read by the composition root, which passes `db` and `redisUrl`.

## grant-role

```sh
DATABASE_URL=... PHONE_HASH_KEY=... pnpm --filter @iraq-maps/identity grant-role <userId|+9647xxxxxxxxx> <user|provider|moderator|admin>
```

The command is idempotent. It exits 1 when the user does not exist and 2 on bad arguments.

## Tests

Run `pnpm infra:local up`, then `pnpm --filter @iraq-maps/identity test`. The tests use an isolated database from
`createTestDatabase` and the local Redis. Each test uses a fresh phone and IP, because rate-limit counters stay in the
shared Redis for 15 minutes.
