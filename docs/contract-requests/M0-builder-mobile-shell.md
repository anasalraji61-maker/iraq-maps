# M0 contract requests from builder-mobile-shell

Requests 1 to 3 block the shell at build time or at runtime. The rest are non-blocking for the CI gate.

## 1. apps/mobile/package.json: shell dependencies and test script (blocking for the shell build and acceptance #8)

**Status: open.** The lead applied most of this locally (uncommitted); two lines differ from that local diff.

The shell imports `@iraq-maps/i18n`, `@iraq-maps/mobile-kit`, `@iraq-maps/ui` and `zod`, and its jest-expo tests run through `pnpm --filter @iraq-maps/mobile test`. Proposed diff against the freeze commit:

```diff
-    "test": "echo 'shell RNTL tests: builder-mobile-shell (jest-expo)'"
+    "test": "jest --config src/shell/jest.config.js"
   },
   "dependencies": {
@@
-    "react-native-screens": "~4.26.0"
+    "react-native-screens": "~4.26.0",
+    "@iraq-maps/i18n": "workspace:*",
+    "@iraq-maps/mobile-kit": "workspace:*",
+    "@iraq-maps/ui": "workspace:*",
+    "zod": "3.25.76"
   },
   "devDependencies": {
-    "@types/react": "~19.2.2"
+    "@types/react": "~19.2.2",
+    "@jest/globals": "^29.7.0",
+    "@react-native/jest-preset": "0.86.3",
+    "@testing-library/react-native": "^14.1.0",
+    "jest": "^29.7.0",
+    "jest-expo": "~57.0.5",
+    "test-renderer": "~1.2.0"
   }
```

Differences from the local diff, both reported by `pnpm knip`:

- Add `"zod": "3.25.76"` (the same pin as `packages/contracts`). `src/shell/server-url.ts` validates the developer server URL with zod. It already resolves through the hoisted install, so knip reports it as an unlisted dependency.
- Drop `"@iraq-maps/api-client": "workspace:*"`. The shell never imports it: mobile-kit's `SessionProvider` owns the client. knip reports it as an unused dependency.

## 2. pnpm-lock.yaml: regenerate after merging (blocking for `pnpm install --frozen-lockfile`)

**Status: open.** After request 1 (and the dependencies the other builders added in their own packages) is merged, run `pnpm install` and commit the regenerated `pnpm-lock.yaml`. Check it with `pnpm install --frozen-lockfile`. Builders may not run `pnpm install`.

## 3. Route files under apps/mobile/app (blocking for sign-in and developer settings at runtime, and for Maestro #13)

**Status: open.** The current route files are enough for the app to bundle and launch: `pnpm android:precheck` exits 0, and the account tab shows its empty state. Sign-in, the language page and the developer settings need these one-line files. The full table is in `apps/mobile/src/shell/README.md`, and `apps/mobile/src/shell/test/app.tsx` tests exactly this wiring.

Delete `app/(tabs)/account.tsx` and add:

| File | Line |
|---|---|
| `app/(tabs)/account/_layout.tsx` | `export { AccountLayout as default } from '../../../src/shell';` |
| `app/(tabs)/account/index.tsx` | `export { AccountScreen as default } from '@iraq-maps/feature-account';` |
| `app/(tabs)/account/language.tsx` | `export { LanguageScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/_layout.tsx` | `export { AuthLayout as default } from '../../src/shell';` |
| `app/auth/phone.tsx` | `export { PhoneScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/otp.tsx` | `export { OtpScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/name.tsx` | `export { NameScreen as default } from '@iraq-maps/feature-account';` |
| `app/dev-settings.tsx` | `export { DevSettingsScreen as default } from '../src/shell';` |

This also needs `"@iraq-maps/feature-account": "workspace:*"` in `apps/mobile/package.json` dependencies (then request 2).

## 4. android.yml e2e job: run the shell's Maestro flow (non-blocking for the gate, needed for full #13 coverage)

**Status: open.** Owner in M0: builder-gates-e2e (android.yml), then the integrator.

The e2e job runs Maestro on `e2e/mobile/flows/*.yaml` and `mobile-features/*/maestro/*.yaml` only. Add `apps/mobile/src/shell/maestro/*.yaml` to the same Maestro step. The flow needs a non-production build, which the e2e build already is (`EXPO_PUBLIC_APP_ENV=e2e`), and `app/dev-settings.tsx` (request 3). At the end it resets the server URL, so flow order does not matter. Also update the Maestro glob list in `docs/milestones/README.md` ("آلية بوابة بناء أندرويد", job e2e).

## 5. tools/ownership/milestones/M0.json: each builder owns its own contract-request file (non-blocking)

**Status: open.** `docs/milestones/README.md` ("ملكية الملفات المشتركة") says the requesting agent owns `docs/contract-requests/Mx-<agent>.md`. `tools/ownership/milestones/M0.json` gives `docs/contract-requests/**` to the integrator, so `pnpm ownership:check --agent builder-mobile-shell` reports this file. Proposed change, in both the JSON and the M0 front-matter: remove `docs/contract-requests/**` from `integrator`, and add `docs/contract-requests/M0-<builder>.md` to each builder (here `"docs/contract-requests/M0-builder-mobile-shell.md"` under `builder-mobile-shell`). The globs then stay disjoint.

## 6. app.config.ts: stop expo-localization from re-allowing RTL on every start (non-blocking for CI; blocking for English on Arabic-language phones)

**Status: open.**

`['expo-localization', { supportsRTL: true }]` writes `ExpoLocalization_supportsRTL=true` into `strings.xml`, which I checked in the `android:precheck` output. On every start, expo-localization's `LocalizationModule` then calls `I18nUtil.allowRTL(context, true)`, which undoes the shell's `I18nManager.allowRTL(false)` for English. React Native computes `isRTL = supportsRtl && (forceRTL || (allowRTL && deviceLanguageIsRtl))`. So on a phone whose system language is Arabic, Kurdish or Persian, English stays right-to-left. The shell's reload-loop guard stops after one reload, and the app keeps running RTL in English. The CI emulator (en-US) does not show this.

Proposed change: `['expo-localization', { supportsRTL: true }]` becomes `'expo-localization'`. Without options the string resource stays `unset` and the module leaves `allowRTL` alone. `android:supportsRtl="true"` comes from the Expo template manifest and stays; it is in the prebuild output. The shell does not use expo-localization at runtime, because it starts in Arabic rather than the device language. Removing the plugin and the dependency instead would also work.

## 7. packages/contracts testIDs: reset button and header entry (additive, non-blocking)

**Status: open.**

```ts
dev: { serverUrlInput: 'dev.serverUrl.input', serverUrlSave: 'dev.serverUrl.save', serverUrlReset: 'dev.serverUrl.reset', open: 'dev.open' },
```

`maestro/dev-settings.yaml` taps the reset button by its Arabic label and reaches the screen with `openLink: iraqmaps://dev-settings`, so it works without these. With them, the flow would not depend on Arabic copy, and the shell would set `testID` on the reset `Button` and on the header `IconButton`.
