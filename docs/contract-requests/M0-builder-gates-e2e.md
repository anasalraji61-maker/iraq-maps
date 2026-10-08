# M0 contract requests from builder-gates-e2e

## 1. pnpm-lock.yaml: e2e/api workspace dependencies (blocking for the AC#4 auth e2e)

**Status: open (integrator).**

The auth e2e (`e2e/api/test/auth.test.ts`) builds its database and app with `createTestDatabase` (db-kit), the fakes
and env helpers (testing), `captureLogs` (observability) and `PortTokens` (contracts). `e2e/api/package.json` now
declares those four as `workspace:*` dependencies. The lockfile needs the matching importer entries, or
`pnpm install --frozen-lockfile` fails. Exact hunk (checked with `pnpm install --frozen-lockfile --lockfile-only`
on HEAD plus this change):

```diff
@@ importers: e2e/api
       '@iraq-maps/api':
         specifier: workspace:*
         version: link:../../apps/api
+      '@iraq-maps/contracts':
+        specifier: workspace:*
+        version: link:../../packages/contracts
+      '@iraq-maps/db-kit':
+        specifier: workspace:*
+        version: link:../../packages/db-kit
+      '@iraq-maps/observability':
+        specifier: workspace:*
+        version: link:../../packages/observability
+      '@iraq-maps/testing':
+        specifier: workspace:*
+        version: link:../../packages/testing
```

It must land in the same push as `e2e/api/package.json`.

## 2. apps/mobile/app.config.ts: allow cleartext HTTP in the e2e build only (blocking for login.yaml, AC#13)

**Status: open (integrator).**

The e2e job's x86_64 build is a release build (ADR-0009) and talks to the API inside the job at
`http://10.0.2.2:3000`. Release manifests from `expo prebuild` do not set `android:usesCleartextTraffic` (only the
debug manifest does), so Android blocks the plain-HTTP call and every flow that hits the API fails. `launch-tabs.yaml`
makes no API call and is unaffected. The fix keeps production and the downloadable APK unchanged:

```diff
-    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
+    // The e2e build calls the API inside the CI job over plain HTTP (http://10.0.2.2:3000); no other build may.
+    ['expo-build-properties', { android: { minSdkVersion: 26, ...(appEnv === 'e2e' && { usesCleartextTraffic: true }) } }],
```

For the integrator to decide: the downloadable arm64 APK (`development` by default) has the same block, so a phone
pointed at `pnpm dev:api` on a laptop (`http://192.168.x.x:3000`, the M0 real-phone path) cannot log in either. If that
path should work, use `appEnv !== 'production'` instead of `appEnv === 'e2e'`.
