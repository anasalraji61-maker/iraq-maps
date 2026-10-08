# M1 contract requests from builder-e2e-m1

## 1. pnpm-lock.yaml: the new `tools/bench` workspace package (blocking for `pnpm install --frozen-lockfile`)

`tools/bench/package.json` (`@iraq-maps/bench`, `CliContracts.benchSearch`) is a new workspace package under `tools/*`.
The lockfile needs its importer entry. Computed with `pnpm install --lockfile-only` on HEAD's manifests plus this
package, so the hunk holds this change alone:

```diff
@@ importers (after tools/ownership's neighbours, alphabetical)
+  tools/bench:
+    dependencies:
+      '@iraq-maps/contracts':
+        specifier: workspace:*
+        version: link:../../packages/contracts
+      zod:
+        specifier: 3.25.76
+        version: 3.25.76
+    devDependencies:
+      tsx:
+        specifier: ^4.23.15
+        version: 4.23.15
```

It must land in the same push as `tools/bench/package.json`. A plain `pnpm install` produces it.

## 2. android.yml e2e job: Java 21 and the Planetiler cache before "Start the API" (blocking for AC#10)

`e2e/mobile/start-api.sh` now builds the fixture city's tiles and glyphs with `CliContracts.tilesBuild` and
`glyphsBuild`, from the pipeline's committed `geo-services/pipeline/tests/fixtures/baghdad-mini` output. It then
imports the places and starts the API with `TILES_SOURCE` and `GLYPHS_SOURCE`, so the map is served from the job and
needs no network. Planetiler needs Java 21, but the job sets up Java 17 for Gradle. Maestro runs on 21 too. No osmium
or Python is needed, because the extract output is committed.

```diff
       - name: Build the x86_64 e2e release APK
         ...
+      # Java 21 + Maven (preinstalled) for the fixture tiles (Planetiler, ADR-0008); Gradle above needed 17.
+      - uses: actions/setup-java@cf277c60eb25467037889841efdb72551f06f6c3 # v4.9.1
+        with:
+          distribution: temurin
+          java-version: 21
+          cache: maven
+          cache-dependency-path: geo-services/tiles/pom.xml
+      - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830 # v4.3.0
+        with:
+          path: geo-services/tiles/.cache
+          key: planetiler-${{ hashFiles('geo-services/tiles/scripts/planetiler.sh') }}
       - run: sh e2e/ci-secrets.sh
-      - name: Start the API (migrate, fixed OTP)
+      - name: Start the API (migrate, fixture city with tiles and glyphs, fixed OTP)
         run: e2e/mobile/start-api.sh
```

`CITY_DATA` defaults to `$RUNNER_TEMP/city-data`, outside the uploaded `e2e-output`. `jq` is preinstalled on the runner.

The M0 follow-up on screenshot visibility needs **no** workflow change. `run-flows.sh` calls
`e2e/mobile/screenshots-summary.sh` last, inside the emulator step, with the job's JDK. Note that it is unverified
whether GitHub renders `data:` image URIs in a job summary. If it strips them, the base64 groups in the job log, which
GitHub MCP `get_job_logs` can read, are still there.

## 3. mobile-features/account/maestro/login.yaml: stale `OUT` and the Arabic assumption (non-blocking; account has no M1 owner)

M0 follow-up "(account / e2e-m1)". The flow-order dependency itself is gone: `run-flows.sh` now clears the app's data
(`pm clear`) before every flow. Each flow therefore starts signed out and in the device locale (ar-IQ, so Arabic),
whatever ran before it, and launch-tabs still runs first. What is left is in a file I do not own:

- Drop the `OUT` env entry and its comment, and use plain screenshot names (`takeScreenshot: login-phone`,
  `login-otp`, `login-account`). `run-flows.sh` stopped passing `OUT`; Maestro 2 writes the screenshots to
  `--test-output-dir`.
- Replace "The app must be in Arabic (launch-tabs.yaml ends in Arabic)" with a note that `run-flows.sh` starts every
  flow on cleared app data in the ar-IQ locale. For manual runs on a non-Arabic device, select Arabic explicitly before
  signing in (`tab.account`, then `account.language`, then `auth.locale.ar`), as the M0 audit suggested.

## 4. packages/contracts CliContracts wording (non-blocking)

- `placesImport.command` reads `pnpm --filter @iraq-maps/places import`, which runs pnpm's own `import` command.
  It should be `pnpm --filter @iraq-maps/places run import`. The e2e test and `start-api.sh` use the `run` form.
- `benchSearch.outputs` says "exit code 1 when p95Ms > budget". AC#8 asks for p95 *under* 800 ms, and the bench exits
  1 when `p95Ms >= budget`. Suggested wording: "exit code 1 unless p95Ms < budget and errors = 0".
- `benchSearch`: callers that parse stdout should run `pnpm -s --filter @iraq-maps/bench search ...`. Without `-s`,
  pnpm prints its `> @iraq-maps/bench search` banner on stdout before the JSON line.

## 5. Integration notes for apps/api (no change requested, for the wiring)

- `e2e/api/test/places.test.ts` runs only when `moduleMigrations` includes the `places` schema. That is the wiring
  signal, so the suite turns itself on when `placesModule` is wired. Until then it reports 8 skipped tests.
- It passes `TILES_SOURCE` and `GLYPHS_SOURCE` through `createApp({ env })`, so `placesModule` must get `opts.env`.
- It ran green (8/8) here against `modules/places` in this working copy, through a throwaway local Nest composition
  (`placesModule` and a Problem filter), not `createApp`. The 400 and 404 bodies must stay Problems through `ProblemFilter`.
- The AC#4 command `pnpm --filter @iraq-maps/e2e-api test -- places` runs the whole e2e-api package, because Vitest
  ignores arguments after `--`. `pnpm --filter @iraq-maps/e2e-api test places` runs the places file alone. Either one
  covers AC#4.
