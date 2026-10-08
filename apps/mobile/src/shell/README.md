# apps/mobile/src/shell

The app shell: root layout, the five tabs, the Arabic-first locale with its RTL/LTR layout direction, the auth gate and the developer server-URL screen. Route files under `apps/mobile/app/**` (integrator-owned) are one-line re-exports of what `index.tsx` exports. User-facing text lives in the `shell` i18n namespace (`i18n/{ar,ckb,en}.json`).

## Exports (`index.tsx`)

| Export | Route file | What it does |
|---|---|---|
| `RootLayout` | `app/_layout.tsx` | Waits for the ui fonts (`useUiFonts`), restores the locale and its layout direction and the saved server URL, then renders `SessionProvider` (mobile-kit, `apiBaseUrl` getter) > `AvailableRoutesProvider` > expo-router `Stack` (no header). Renders nothing until then, and nothing while a direction reload is under way. |
| `TabsLayout` | `app/(tabs)/_layout.tsx` | expo-router JS `Tabs`: map (`index`), discover, messages, activity, account. Labels and headers come from `t('shell:tabs.*')` and re-render on every locale change; each tab button has `testIDs.tabs.*` and the label as its accessible name. The account tab header has the developer-settings button when `useRouteAvailable('devSettings')`. Deeper in a tab's own stack (e.g. `/account/language`) that stack's header replaces the tab header. |
| `PendingScreen` | `app/(tabs)/{index,discover,messages,activity}.tsx` (and `account.tsx` until it is replaced) | ui `Screen` + `EmptyState` with the tab's own title and body, saying honestly that the feature arrives in a later update. The tab comes from the pathname. |
| `AccountLayout` | `app/(tabs)/account/_layout.tsx` | `loading`: spinner. `signedOut`: `Redirect` to `/auth/phone`. Signed in without a name: `Redirect` to `/auth/name` (a new user is signed in before the name step). Otherwise a `Stack` for `/account` (tab header) and `/account/language` (own header with back). |
| `AuthLayout` | `app/auth/_layout.tsx` | `Stack` for `/auth/phone`, `/auth/otp`, `/auth/name`, titled "تسجيل الدخول". A signed-in user with a name is redirected to `/account`. The header has the developer-settings button (a real phone needs the server URL before it can sign in) and, on the first step, a close button back to the map, because the account tab's redirect replaces the tabs. |
| `DevSettingsScreen` | `app/dev-settings.tsx` | Server URL for emulators and real phones. Outside production only; production renders `<Redirect href="/" />`. |

### Route-file wiring for the integrator

Each file holds exactly one line. The first five exist today; the rest are requested in `docs/contract-requests/M0-builder-mobile-shell.md`.

| File | Line |
|---|---|
| `app/_layout.tsx` | `export { RootLayout as default } from '../src/shell';` |
| `app/(tabs)/_layout.tsx` | `export { TabsLayout as default } from '../../src/shell';` |
| `app/(tabs)/index.tsx`, `discover.tsx`, `messages.tsx`, `activity.tsx` | `export { PendingScreen as default } from '../../src/shell';` |
| `app/(tabs)/account.tsx` | delete (replaced by the `account/` folder) |
| `app/(tabs)/account/_layout.tsx` | `export { AccountLayout as default } from '../../../src/shell';` |
| `app/(tabs)/account/index.tsx` | `export { AccountScreen as default } from '@iraq-maps/feature-account';` |
| `app/(tabs)/account/language.tsx` | `export { LanguageScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/_layout.tsx` | `export { AuthLayout as default } from '../../src/shell';` |
| `app/auth/phone.tsx` | `export { PhoneScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/otp.tsx` | `export { OtpScreen as default } from '@iraq-maps/feature-account';` |
| `app/auth/name.tsx` | `export { NameScreen as default } from '@iraq-maps/feature-account';` |
| `app/dev-settings.tsx` | `export { DevSettingsScreen as default } from '../src/shell';` |

`test/app.tsx` renders exactly this table (feature screens stubbed), so the layout tests cover the wiring.

## Available routes

`available-routes.ts` lists the screens this build has: `map`, `discover`, `messages`, `activity`, `account`, `accountLanguage`, `authPhone`, `authOtp`, `authName`, plus `devSettings` outside production. `useRouteAvailable(name)` (mobile-kit) hides every action that leads anywhere else. Each milestone appends what it delivers.

## Locale and layout direction

- The app starts in Arabic (`ar`), not the device language: the CI emulator is en-US and the product is Arabic first.
- `startLocale()` restores the saved locale before the first render and then saves every later `setLocale()` from `@iraq-maps/i18n`. Features change the language only through `setLocale`; components re-render with `useLocale()` from mobile-kit.
- `ar` and `ckb` are right-to-left, `en` left-to-right. React Native fixes the layout direction when the app starts, so when `I18nManager.isRTL` differs from the locale the shell calls `I18nManager.allowRTL(rtl)` and `forceRTL(rtl)` and reloads with `reloadAppAsync()` from `expo` (works in release builds; there is no expo-updates). Switching between `ar` and `ckb` needs no reload.
- The first launch on an LTR phone therefore reloads once into RTL; the screen stays empty until then.
- Reload-loop guard: before reloading, the shell saves the direction it asked for. If the app still starts in the other direction, it does not reload again and runs in the current direction. A storage or reload failure also keeps the current direction.
- A direction change reloads at once, so a feature must finish its own request (e.g. `PATCH /v1/me { locale }`) before it calls `setLocale`.

## Server URL (developer settings)

Precedence, read on every request through the `SessionProvider` `apiBaseUrl` getter:

1. the URL saved in developer settings (never loaded in production),
2. `process.env.EXPO_PUBLIC_API_URL`,
3. outside production, `http://10.0.2.2:3000` (the host machine as seen from the Android emulator).

The screen is prefilled with the current URL. Save trims the input and accepts only `http://` or `https://` URLs (a zod pattern, because React Native's `URL` class accepts any string); it stores the URL and the next request uses it, without a restart. Reset deletes it. A storage failure shows an error banner and keeps the current URL.

## Environment variables

Both are `EXPO_PUBLIC_*`: Expo inlines them into the JavaScript bundle at build time, so they ship inside the APK and are public. Never put a secret in them.

| Variable | Effect |
|---|---|
| `EXPO_PUBLIC_APP_ENV` | `production` hides the developer settings (no route, no button, saved URL ignored) and drops the emulator fallback. Anything else, or unset (`app.config.ts` defaults to `development`), keeps them. The CI e2e build uses `e2e`. |
| `EXPO_PUBLIC_API_URL` | Default API base URL. A production build must set it. |

## expo-secure-store keys

| Key | Value |
|---|---|
| `iraq-maps.shell.locale` | `ar`, `ckb` or `en`; anything else falls back to `ar` |
| `iraq-maps.shell.directionReload` | `rtl` or `ltr`: the direction the last reload asked for (loop guard); deleted once the app starts in that direction |
| `iraq-maps.shell.serverUrl` | developer server URL |

The session keys belong to mobile-kit (see its README).

## Ports and dependencies

Provides no backend port. Consumes `SessionProvider`, `useSession`, `useLocale`, `AvailableRoutesProvider`, `useRouteAvailable`, `href` and `routes` from `@iraq-maps/mobile-kit`; `t`, `setLocale`, `onLocaleChange`, `isRtl` and `registerNamespace` from `@iraq-maps/i18n`; ui components, `Icon`, `tokens` and `useUiFonts` from `@iraq-maps/ui`; `Locale`, `Me` and `testIDs` from `@iraq-maps/contracts`.

## Tests

```
pnpm --filter @iraq-maps/mobile test     # jest --config src/shell/jest.config.js (jest-expo + RNTL 14)
```

Layouts render through `renderRouter` from `expo-router/testing-library` with the route table above. `test/setup.ts` gives every test an in-memory `expo-secure-store`, Arabic, a native layout that is already RTL, and a `reloadAppAsync` mock that only records the call.

- `tabs.test.tsx`: five tabs in order with Arabic labels from i18n (accessible names, `testIDs.tabs.*`); labels and header change at once for `en` and `ckb`; `PendingScreen` title and body for each tab; pressing a tab.
- `locale.test.tsx`: first launch in Arabic on an LTR device forces RTL and reloads once with an empty screen; no second reload for the same direction (loop guard); the guard is cleared after a good start; unknown saved locale falls back to Arabic; `en` forces LTR and reloads; `ckb` and `ar` force RTL and reload from English; `ar` to `ckb` neither reloads nor forces; the choice is restored after an unmount and a new render.
- `auth-gate.test.tsx`: spinner while the session restores; signed out goes from the account tab to `/auth/phone`; no name goes to `/auth/name`; a named user sees the account under the tab header, and the language page gets its own header; `/auth/*` sends a named user to `/account`, also right after the name is saved; the auth header title and its developer-settings button; only the first auth step has the close button (later steps go back), and closing returns to the map.
- `dev-settings.test.tsx`: base-URL precedence (default, `EXPO_PUBLIC_API_URL`, saved override, invalid saved value, production); the saved URL is applied before the first request; the screen opens from the account header prefilled; invalid input is rejected and nothing is saved; a valid URL is saved, applied and confirmed; reset; storage failure; production redirects the screen, drops `devSettings` from the available routes and hides the button.

Maestro: `maestro/dev-settings.yaml` (appId `iq.iraqmaps.app`) opens `iraqmaps://dev-settings`, saves a URL through `testIDs.dev.*`, restarts the app, checks that the URL persisted, then resets it for the next flows. It needs `app/dev-settings.tsx` and a non-production build, and runs in the android.yml e2e job once that job includes `apps/mobile/src/shell/maestro/*.yaml` (contract request).
