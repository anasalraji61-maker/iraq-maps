# e2e

End-to-end checks against the composed system. No secrets: identity keys are generated per run.

## api (`@iraq-maps/e2e-api`)

Vitest against `createApp()` from `@iraq-maps/api`, on an isolated database from `createTestDatabase()` and the
local Redis. It runs inside `pnpm gate`; alone: `pnpm infra:local up && pnpm --filter @iraq-maps/e2e-api test`.

- `test/auth.test.ts` (AC#4, AC#6): OTP request and verify, `GET`/`PATCH /v1/me`, refresh rotation and reuse
  detection, logout, and `DELETE /v1/me` (erasers called, `identity.user.deleted.v1` written to `platform.outbox`
  and delivered, old tokens 401).
  The whole flow runs under `captureLogs()`, which must find no phone number, JWT or OTP code.
- Env: `REDIS_URL` (default `redis://localhost:6379`), `TEST_DATABASE_ADMIN_URL` or `DATABASE_URL` (default: the
  `pnpm infra:local` database).

## mobile

The emulator harness of `.github/workflows/android.yml` (ADR-0009). It needs the Android SDK and an emulator, so it
runs only on GitHub runners.

| Script | Does |
|---|---|
| `build-apk.sh <abi> <out.apk>` | `expo prebuild`, then Gradle `assembleRelease` for one ABI; a `::error` with the log tail on failure |
| `start-api.sh` | `migrate`, then the API in the background; waits for `/health` |
| `install-maestro.sh` | the pinned Maestro CLI (`MAESTRO_VERSION`, `MAESTRO_SHA256`) |
| `run-flows.sh <apk> <out-dir>` | installs the APK, runs `flows/*.yaml` and `mobile-features/*/maestro/*.yaml` |

`start-api.sh` reads the job env: `APP_ENV=e2e`, `OTP_SENDER=fixed`, `OTP_FIXED_CODE`, `DATABASE_URL`, `REDIS_URL`,
`API_PORT`, the identity secrets and `API_LOG`. The e2e APK is built with `EXPO_PUBLIC_APP_ENV=e2e` and
`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` (the emulator's alias for the runner's localhost).

Flows get the job's fixed OTP as `${OTP_CODE}` (`maestro test -e OTP_CODE=$OTP_FIXED_CODE`).

Flows select elements by the testIDs in `packages/contracts` (`testIDs`). A flow is rerun once only when its log
matches a known emulator-infrastructure failure (`INFRA` in `run-flows.sh`); app and assertion failures never are.

`ci-secrets.sh` writes fresh, masked identity secrets to `$GITHUB_ENV` for `ci.yml` and `android.yml`.
