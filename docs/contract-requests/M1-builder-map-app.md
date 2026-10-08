# M1 contract requests from builder-map-app

## 1. apps/mobile: dependencies and config plugins (blocking for AC#9 and AC#10)

`@iraq-maps/feature-map` provides the map tab and the place route. MapLibre and expo-location are native modules, so
they must be direct dependencies of the app: autolinking reads only the app's own dependencies, as with `expo-symbols`
in M0. The versions match map-kit (`~11.5.0`) and Expo SDK 57's `bundledNativeModules.json` (`~57.0.20`), and the
lockfile already has both.

`apps/mobile/package.json`:

```diff
   "dependencies": {
     ...
     "@iraq-maps/feature-account": "workspace:*",
+    "@iraq-maps/feature-map": "workspace:*",
     "@iraq-maps/i18n": "workspace:*",
+    "@maplibre/maplibre-react-native": "~11.5.0",
     ...
     "expo-linking": "~57.0.12",
+    "expo-location": "~57.0.20",
     "expo-router": "~57.0.25",
```

`apps/mobile/app.config.ts`, under `plugins`:

```diff
   plugins: [
     'expo-router',
     'expo-secure-store',
+    '@maplibre/maplibre-react-native',
+    // Foreground location only (locate-me). Android gets ACCESS_COARSE/FINE_LOCATION from the library manifest.
+    ['expo-location', { locationWhenInUsePermission: 'يستخدم خرائط العراق موقعك لإظهاره على الخريطة وترتيب نتائج البحث حسب القرب.' }],
     [
       'expo-build-properties',
```

The plugin defaults already leave background location, the foreground service and motion activity off. On Android, the
permission prompt is the system's own (localized by the OS), and the text above is used on iOS only.

## 2. apps/mobile/app: route files and available routes (blocking for AC#10)

| Route name | Path | File | Content |
|---|---|---|---|
| `map` | `/` | `app/(tabs)/index.tsx` (replaces `PendingScreen`) | `export { MapScreen as default } from '@iraq-maps/feature-map';` |
| `place` | `/place/[placeId]` | `app/place/[placeId].tsx` (new, root Stack, so it gets a header with a back button) | `export { PlaceScreen as default } from '@iraq-maps/feature-map';` |

`MapCanvas` needs the API base URL. **Resolved (integrator, M1):** mobile-kit now exports `useApiBaseUrl()`, so
`MapScreen` takes no props and both route files are the one-line re-exports above.

`apps/mobile/src/shell/available-routes.ts`: add `'map'` and `'place'`. Without `place`, nothing hides the result cards,
but the shell's list would not match the delivered screens. Also update the comment ("The map, discover, ... only show
coming soon"), because the map tab is now delivered. `iraqmaps://place/<id>` then resolves through expo-router with the
existing `scheme: 'iraqmaps'`.

## 3. packages/api-client: forward the abort signal (non-blocking, needed for real cancellation)

Search aborts the previous request with `fetchOptions: { signal }`, which ts-rest passes to the fetcher as
`ApiFetcherArgs.fetchOptions`. `createClient`'s `send` drops it today, so a superseded search still runs to completion
on the network. The UI is already correct: `useLatest` drops the late answer, and the RNTL test checks that the old
signal is aborted. Proposed fix:

```diff
-  const send = async ({ route, path, method, headers, body }: ApiFetcherArgs, accessToken?: string) => {
-    const res = await doFetch(baseUrl() + path, { method, body, headers: accessToken ? { ...headers, authorization: `Bearer ${accessToken}` } : headers });
+  const send = async ({ route, path, method, headers, body, fetchOptions }: ApiFetcherArgs, accessToken?: string) => {
+    const res = await doFetch(baseUrl() + path, {
+      method,
+      body,
+      signal: fetchOptions?.signal,
+      headers: accessToken ? { ...headers, authorization: `Bearer ${accessToken}` } : headers,
+    });
```

A test in `packages/api-client` would abort a call and expect the fake fetch to receive an aborted signal.

## 4. map-kit (builder-map-kit)

**Status: resolved (map-kit, `f7e1e0b`).** feature-map uses the real `MapCanvas`, and its tests use
`@iraq-maps/map-kit/jest-mock`. `onCameraChanged` feeds search `near`, so the next search follows the panned map. The
search panel (top) and the locate button (end side, 64dp up) stay clear of the bottom-end attribution corner.

## 5. For information

- **places (builder-places):** feature-map expects the following.
  - `GET /v1/cities` lists the MVP city first.
  - `distanceM` is set whenever `near` is sent. `near` is sent as `lng,lat` with 6 decimals, which the frozen regex accepts.
  - `GET /v1/places/:id` answers 404 Problem for an unknown id. The card shows «لم نجد هذا المكان» for it.
  - 429 is shown with the shared `common:errors.rateLimited`.
- **account (M0 follow-up «صفوف اللغة لا تُظهر حالة التعطيل»):** `ListItem` now takes `disabled` (it ignores presses,
  dims the row, and exposes `accessibilityState.disabled`). The account owner adds `disabled={busy}` to the three rows in
  `mobile-features/account/src/LanguageScreen.tsx`.
- **ui:** `Badge` and `PlaceSummaryCard` are new exports. `Card` now has a 48dp minimum height. The SF Symbols note is in
  `packages/ui/README.md`. The DATA_SOURCES row was added by builder-geo-data.
- **Maestro:** `mobile-features/map/maestro/search-place.yaml` types Arabic with `inputText: قلعه`. Maestro 2.11.0
  (pinned in android.yml) types non-ASCII text on Android through its own IME (`AndroidDriver.inputUnicodeText`).
  `run-flows.sh` already picks the flow up. It needs the e2e harness (builder-e2e-m1) to load the baghdad-mini places
  and serve its tiles. It asserts a name containing قلعة («قلعة الرصافة» in the fixture).
