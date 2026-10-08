# e2e

End-to-end checks against the composed system. No secrets: identity keys are generated per run.

## api (`@iraq-maps/e2e-api`)

Vitest against `createApp()` from `@iraq-maps/api`, on an isolated database from `createTestDatabase()` and the
local Redis. It runs inside `pnpm gate`; alone: `pnpm infra:local up && pnpm --filter @iraq-maps/e2e-api test`.

- `test/auth.test.ts` (AC#4, AC#6): OTP request and verify, `GET`/`PATCH /v1/me`, refresh rotation and reuse
  detection, logout, and `DELETE /v1/me` (erasers called, `identity.user.deleted.v1` written to `platform.outbox`
  and delivered, old tokens 401).
  The whole flow runs under `captureLogs()`, which must find no phone number, JWT or OTP code.
- `test/places.test.ts` (M1 AC#4): the pipeline's fixture output for the CC0 `baghdad-mini.osm.xml`
  (`geo-services/pipeline/tests/fixtures/baghdad-mini`) imported twice with the places import CLI, then: اربيل, أربيل
  and إربيل share a top result, as do قلعه and قلعة; street and area kinds; `near` reorders equal names by distance;
  `GET /v1/places/:id` details, a 404 Problem, and 400 Problems for invalid queries; `GET /v1/cities` with the
  fallback `tilesUrl`/`glyphsUrl` and the OSM attribution; the tiles fallback at that `tilesUrl` serving a valid MVT
  (gzip or bare protobuf) from a one-tile PMTiles archive the test writes, 204 and 400; the glyphs fallback, and a
  path-traversal attempt refused with 400.
  `pnpm --filter @iraq-maps/e2e-api test places` runs this file alone.
- Env: `REDIS_URL` (default `redis://localhost:6379`), `TEST_DATABASE_ADMIN_URL` or `DATABASE_URL` (default: the
  `pnpm infra:local` database).

## mobile

The emulator harness of `.github/workflows/android.yml` (ADR-0009). It needs the Android SDK and an emulator, so it
runs only on GitHub runners.

| Script | Does |
|---|---|
| `build-apk.sh <abi> <out.apk>` | `expo prebuild`, then Gradle `assembleRelease` for one ABI, with `EXPO_PUBLIC_APP_ENV` required and the Metro cache cleared; a `::error` with the log tail on failure |
| `start-api.sh` | `migrate`; the fixture city: tiles and glyphs built with the CliContracts commands from the pipeline's `baghdad-mini` output, places imported; then the API in the background, serving the tiles and glyphs through its fallback routes; waits for `/health` |
| `install-maestro.sh` | the pinned Maestro CLI (`MAESTRO_VERSION`, `MAESTRO_SHA256`) |
| `run-flows.sh <apk> <out-dir>` | installs the APK, runs `flows/*.yaml` then `mobile-features/*/maestro/*.yaml`, each on cleared app data, then `screenshots-summary.sh` |
| `screenshots-summary.sh <out-dir>` | every screenshot as a JPEG thumbnail (`Thumbnails.java`, JDK only) in the job summary (data-URI images, 480 or 240 px to stay under 1 MiB) and as base64 in collapsed job-log groups, for reviewers who cannot reach the artifact host |

`start-api.sh` reads the job env: `APP_ENV=e2e`, `OTP_SENDER=fixed`, `OTP_FIXED_CODE`, `DATABASE_URL`, `REDIS_URL`,
`API_PORT`, the identity secrets and `API_LOG`. The city data goes to `CITY_DATA` (default `$RUNNER_TEMP/city-data`);
a step whose output is already there is skipped, so an unzipped `data-baghdad-<date>` artifact can stand in for the
fixture. The tiles build needs Java 21 and Maven. The API gets `TILES_SOURCE` and `GLYPHS_SOURCE` pointing there.
The e2e APK is built with `EXPO_PUBLIC_APP_ENV=e2e` and `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` (the emulator's
alias for the runner's localhost).

`run-flows.sh` first sets the emulator's system locale to `ar-IQ` (an Iraqi phone). Before each flow it clears the
app's data (`pm clear`), so every flow starts signed out and in Arabic, whatever ran before it; launch-tabs still runs
first. Flows get the job's fixed OTP as `${OTP_CODE}`. `takeScreenshot: <name>` (a relative name: Maestro 2 refuses paths outside the flow's output folder)
lands in the `e2e-output` artifact of the run, which is always uploaded with the JUnit reports and the Maestro and
API logs.

Flows select elements by the testIDs in `packages/contracts` (`testIDs`). A flow is rerun once only when its log
matches a known emulator-infrastructure failure (`INFRA` in `run-flows.sh`); app and assertion failures never are.

`ci-secrets.sh` writes fresh, masked identity secrets to `$GITHUB_ENV` for `ci.yml` and `android.yml`.
