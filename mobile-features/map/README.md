# @iraq-maps/feature-map

The «الخريطة» (map) tab and the place card: the city map, Arabic search, locate-me, the map label language and a
shareable place card.

## Screens

The package exports two screens, mounted by route files in `apps/mobile/app`:

- `MapScreen` (`/`, the map tab):
  - Loads the city with `GET /v1/cities` (the first item; MVP has one city) and draws it with map-kit's `MapCanvas`,
    which always shows the OSM attribution. mobile-kit's `useApiBaseUrl()` resolves the descriptor's root-relative tile
    and glyph URLs.
  - **Search.** The search field waits 300ms after the last keystroke. It then calls
    `GET /v1/search?q&city&near&lang` and aborts the previous request (`fetchOptions.signal`); a late answer for an
    old query is dropped.
    - `near` is the user's location after locate-me, else the city centre.
    - `lang` is the map label language.
  - **Results.** Each result is a `PlaceSummaryCard` with the name (`pickName` in the map language), category (or
    street/area), neighbourhood, distance (`formatNumber`: Arabic-Indic digits in ar and ckb) and an OpenStreetMap
    source badge. The results are also map markers. Tapping a card or a marker opens `href('place', { placeId })`.
    Loading, no results, offline (with retry) and rate-limited states are shown as announced banners.
  - **Locate-me.** The button asks for the foreground location permission (`expo-location`). When it is granted, the
    camera centres on the user and the location dot shows. A denial or unreadable location shows a localized banner,
    and the map stays as it was.
  - **Map label language.** A sheet sets the map labels to ar, ckb or en. It starts in the app language.
- `PlaceScreen` (`/place/[placeId]`, also the target of `iraqmaps://place/<id>`): `GET /v1/places/:id` as a card.
  - It shows the name (`pickName` in the app language), category, neighbourhood and a «من OpenStreetMap» source badge.
  - Opening hours show «مفتوح الآن» or «مغلق الآن» (`src/hours.ts`, Iraq time UTC+3). The parser covers `24/7` and
    `;`-separated rules of weekday ranges or lists with time spans or `off`, including spans past midnight.
    Anything else (PH, months, comments, `||`) is shown raw, with no open or closed claim.
  - The OSM `phone` and `website` tags are displayed, not linked. M4 uses them for the manual handoff.
  - Share sends `<name>\niraqmaps://place/<id>` through the React Native Share sheet.
  - Directions (`routePreview`), message (`messageCompose`) and assistant (`assistant`) buttons stay hidden until
    `useRouteAvailable` lists their route. Each then pushes its route with `params: { placeId }`. Save is not here:
    it is an API toggle (M6), not a route.
  - 404 shows «لم نجد هذا المكان», and other failures show the shared messages with a retry.

Values that may run left to right (the search query, phone, URL and raw opening hours) are wrapped in a first-strong
isolate (`isolate()` in `src/strings.ts`), so they keep their order inside Arabic text.

## Ports and dependencies

- Consumes `MapCanvas` and `MapCamera` from `@iraq-maps/map-kit`.
- Consumes `useApi`, `useApiBaseUrl`, `href`, `routes` and `useRouteAvailable` from `@iraq-maps/mobile-kit`.
- Consumes `PlaceSummaryCard`, `Badge` and the other primitives from `@iraq-maps/ui`.
- Consumes `t`, `getLocale` and `formatNumber` from `@iraq-maps/i18n`.
- Consumes `pickName`, `testIDs` and the `cities`/`places` routes of the API contract from `@iraq-maps/contracts`.
- Depends on `expo-location`. `expo-router` is a peer dependency.
- Provides no ports and needs no env vars.

## Strings

All strings are in the `map` namespace, in `src/i18n/{ar,ckb,en}.json`. `test/i18n.test.ts` checks key and placeholder
parity, and that every `PlaceCategory` has a label.

## Tests

- `pnpm --filter @iraq-maps/feature-map test` runs jest-expo and RNTL. `test/setup.ts` replaces map-kit's `MapCanvas`
  (which needs MapLibre's native module) with a view carrying the same `map.view` and `map.attribution` testIDs, and
  mocks `expo-location` and `expo-router`.
- `maestro/search-place.yaml` is the emulator flow for M1 acceptance criterion 10. It needs the e2e harness with the
  baghdad-mini fixture places and tiles.
