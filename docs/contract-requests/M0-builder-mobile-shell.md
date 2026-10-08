# M0 contract requests from builder-mobile-shell

## 1. apps/mobile/package.json: shell deps, Jest config and test script (blocking AC#8, typecheck, knip, Metro, APK)

**Status: resolved (integrator, M0). Applied as proposed. `pnpm install` replaced the temporary links.**

`apps/mobile/src/shell` imports `@iraq-maps/{i18n,mobile-kit,ui}` and `expo-symbols`, and its RNTL tests
(`src/shell/shell.test.tsx`) need Jest. Without these, `pnpm --filter @iraq-maps/mobile test` stays an echo, typecheck and
Metro cannot resolve the workspace packages, and knip reports `expo-symbols` and `@jest/globals` as unlisted. There is no
jest config file under `src/shell` (knip flagged it as unused); the config goes in package.json, where knip's Jest plugin
reads it.

```diff
   "scripts": {
     ...
-    "test": "echo 'shell RNTL tests: builder-mobile-shell (jest-expo)'"
+    "test": "jest"
   },
+  "jest": { "preset": "jest-expo", "roots": ["<rootDir>/src"] },
   "dependencies": {
     "@expo/metro-runtime": "~57.0.16",
     "@iraq-maps/contracts": "workspace:*",
+    "@iraq-maps/feature-account": "workspace:*",
+    "@iraq-maps/i18n": "workspace:*",
+    "@iraq-maps/mobile-kit": "workspace:*",
+    "@iraq-maps/ui": "workspace:*",
     "expo": "~57.0.27",
     ...
     "expo-secure-store": "~57.0.4",
+    "expo-symbols": "~57.0.3",
     ...
   },
   "devDependencies": {
+    "@jest/globals": "^29.7.0",
+    "@react-native/jest-preset": "0.86.3",
+    "@testing-library/react-native": "^14.1.0",
     "@types/react": "~19.2.2",
+    "jest": "^29.7.0",
+    "jest-expo": "~57.0.5",
+    "test-renderer": "~1.2.0"
   }
```

- `expo-symbols` must be a direct dependency: today `npx expo-modules-autolinking resolve -p android` (from apps/mobile)
  does not list it, so the tab icons and `ui`'s `IconButton` would have no native module in the APK. `expo-font` is
  already linked through `expo`.
- `@iraq-maps/feature-account` is only for the route files in #2.
- Versions match the ones `ui`, `mobile-kit` and `feature-account` already use, so the lockfile adds no new packages.

Verified locally with temporary `apps/mobile/node_modules/@iraq-maps/{i18n,mobile-kit,ui}` links (untracked) standing in
for the workspace deps: `jest --config '{"preset":"jest-expo","roots":["<rootDir>/src"]}'` passes 10/10 (5 runs in a row),
`tsc --noEmit` is clean, and `CI=1 pnpm android:precheck` exports the Android bundle.

## 2. apps/mobile/app route files (blocking for the account flow and the developer settings screen)

**Status: resolved (integrator, M0). All six route files exist as listed.** One line each:

| File | Content |
|---|---|
| `app/dev-settings.tsx` (new) | `export { DevSettingsScreen as default } from '../src/shell';` |
| `app/(tabs)/account.tsx` (change) | `export { AccountScreen as default } from '@iraq-maps/feature-account';` |
| `app/account/language.tsx` (new) | `export { LanguageScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/phone.tsx` (new) | `export { PhoneScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/otp.tsx` (new) | `export { OtpScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/name.tsx` (new) | `export { NameScreen as default } from '@iraq-maps/feature-account';` |

`app/_layout.tsx`, `app/(tabs)/_layout.tsx` and the four pending tabs stay as they are. The paths match the frozen
`routes` map in `@iraq-maps/mobile-kit`. I checked with expo-router's `renderRouter` that `account/language` and
`(tabs)/account` coexist and that `router.push(href('accountLanguage'))` opens the language screen.
`apps/mobile/src/shell/available-routes.ts` lists exactly these screens (plus `devSettings` outside production). If a
route file is not added, tell me and I'll drop it from that list, so its buttons stay hidden.

## 3. apps/mobile/app.config.ts: cleartext HTTP outside production (supports gates-e2e request #2)

**Status: resolved (integrator, M0). `usesCleartextTraffic: appEnv !== 'production'`.** The developer settings screen exists so that one non-production APK can reach
`pnpm dev:api` on a laptop (`http://192.168.x.x:3000`) or the emulator host (`http://10.0.2.2:3000`). Both are plain
HTTP, which release builds block. Use the gates-e2e diff with `appEnv !== 'production'` rather than `appEnv === 'e2e'`.
Production keeps cleartext off, and production builds have no developer settings screen.

## 4. ESLint `i18next/no-literal-string` on enum props (same as account-app #2 and ui-i18n #1)

**Status: resolved (integrator, M0).** See ui-i18n #1. `apps/mobile/src/shell/index.tsx` had 8 errors of this kind: `name="(tabs)"`,
`variant="title"`, `keyboardType="url"`, `kind="success"`, `icon="developer_mode"`, `href('devSettings')`. None is
user-facing copy. With account-app's proposed `'jsx-attributes': { include: [...] }` layered on the current config,
`apps/mobile/src`, `packages/mobile-kit` and `packages/api-client` lint clean (I checked with a temporary config, since
removed).

## 5. Information: beyond the frozen stubs, and what other builders rely on

- `@iraq-maps/mobile-kit/testing` adds `memorySecureStore`, an in-memory `expo-secure-store` for Jest that is shared by
  the shell and mobile-kit tests (jscpd). Use it with
  `jest.mock('expo-secure-store', () => jest.requireActual<typeof import('@iraq-maps/mobile-kit/testing')>('@iraq-maps/mobile-kit/testing').memorySecureStore)`.
  Session types and contexts moved to `mobile-kit/src/context.ts`. The public exports are unchanged.
- `renderWithProviders` returns RNTL 14's promise, so `await` it. Its defaults are: signed out, no-op session actions,
  locale `ar`, and every route available.
- The shell listens to `onLocaleChange`. It persists the locale (SecureStore key `app.locale`), sets
  `I18nManager.allowRTL/forceRTL`, and calls `reloadAppAsync()` from `expo` when the direction flips. A change that keeps
  the direction (ar <-> ckb) re-keys the root navigator, so every screen re-reads `t()` in place. Features only call
  `setLocale`.
- `src/shell/config.ts` reads the app env at runtime from `Constants.expoConfig.extra.appEnv` (app.config `extra.appEnv`,
  set at prebuild, the same source as the cleartext flag). It fails closed (security R3-3): only `development`, `e2e`
  and `test` enable developer settings and the stored server-URL override, and a missing or unknown value counts as
  production. `EXPO_PUBLIC_API_URL` (defaults to `http://10.0.2.2:3000`) remains the build's API address.
