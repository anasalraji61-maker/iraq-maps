# M1 contract requests from builder-map-kit

## 1. pnpm-lock.yaml: `@iraq-maps/geo` in map-kit (blocking for `pnpm install --frozen-lockfile`)

**Status: resolved.** `pnpm install` after rebasing on b6dc05b wrote the importer entry; pnpm-lock.yaml is committed with the map-kit change, as the lead asked.

`MapCanvas` limits the camera with `cameraBounds(city.bbox)` from `@iraq-maps/geo`, so `packages/map-kit/package.json`
now declares `"@iraq-maps/geo": "workspace:*"`. The frozen package.json did not have it. The lockfile needs the matching
importer entry (builders may not run `pnpm install`):

```diff
@@ importers: packages/map-kit
     dependencies:
       '@iraq-maps/contracts':
         specifier: workspace:*
         version: link:../contracts
+      '@iraq-maps/geo':
+        specifier: workspace:*
+        version: link:../geo
       '@maplibre/maplibre-gl-style-spec':
```

For local runs, builder-map-kit created the same link that pnpm makes with `nodeLinker: hoisted`
(`packages/map-kit/node_modules/@iraq-maps/geo -> ../../../geo`). It is untracked. Run `pnpm install` on integration.

## 2. apps/mobile/app.config.ts: MapLibre config plugin (non-blocking on Android, required for iOS)

**Status: resolved** (b6dc05b). `'@maplibre/maplibre-react-native'` is in `plugins` without options. The iOS location text
comes from the `expo-location` plugin's `locationWhenInUsePermission` (Arabic).

Add `'@maplibre/maplibre-react-native'` to `plugins`, without options. Its `app.plugin.js` (`withMapLibre`) writes
`org.maplibre.reactnative.*` Gradle properties only for options that are passed, so Android keeps the library defaults
(MapLibre Native 13.6.1, OpenGL, the default location engine). It also adds the Podfile hooks that iOS needs.

- Location permissions: the library's Android manifest already declares `ACCESS_COARSE_LOCATION` and
  `ACCESS_FINE_LOCATION`, and they merge into the app. iOS needs `ios.infoPlist.NSLocationWhenInUseUsageDescription`
  (Arabic first) when iOS starts.
- `minSdkVersion` 26 (expo-build-properties) is above MapLibre's 24.

## 3. packages/tooling/knip.json: drop the map-kit freeze-stub ignores (non-blocking)

**Status: resolved** (M1 integration step 2). b6dc05b removed only the places block; step 2 removes the map-kit block, and
`pnpm knip` reports no unused map-kit dependency.

`@jest/globals`, `@testing-library/react-native` and `test-renderer` are now used by the map-kit tests.
`pnpm knip` exits 0 but prints "Remove from ignoreDependencies" for all three under `workspaces["packages/map-kit"]`.

## 4. packages/mobile-kit: expose the API base URL to features (blocking for feature-map, not for map-kit)

**Status: resolved** (b6dc05b). `useApiBaseUrl()` is exported, and `renderWithProviders` takes `apiBaseUrl` (default
`'http://api.test'`).

`MapCanvasProps.apiBaseUrl` (frozen) resolves root-relative `tilesUrl`/`glyphsUrl`, such as the XYZ fallback
`/v1/cities/:id/tiles/{z}/{x}/{y}`. Features cannot read that URL today: `SessionProvider` receives
`apiBaseUrl: () => string` from the shell but exports no accessor. Proposed additive change: export
`useApiBaseUrl(): string` from `@iraq-maps/mobile-kit`. It returns the shell's `apiBaseUrl()`, which also honours the dev
server override. Add it to `renderWithProviders` options with a default such as `'http://api.test'`.

## 5. Locate-me position source (question for the integrator and builder-map-app)

**Status: resolved** (b6dc05b): `expo-location`. feature-map requests the foreground permission and the position with it;
`apps/mobile` depends on it and lists its config plugin (foreground only). map-kit needs no position API.

`MapCanvas` shows the puck, and the caller owns the permission and the position used for the camera. The frozen
contracts do not say which API feature-map uses for this. There are two options:

- `expo-location`. It is not installed, so it would be a new dependency of `mobile-features/map` and `apps/mobile`, with
  its config plugin.
- MapLibre's own `LocationManager.requestPermissions()` and `getCurrentPosition()` (already in the APK). map-kit would
  re-export them as `requestLocationPermission()` and `getCurrentPosition(): Promise<LngLat | undefined>`, with
  matching fakes in `@iraq-maps/map-kit/jest-mock`.

builder-map-kit adds the second option on request. It is about 10 lines and needs no new dependency.
