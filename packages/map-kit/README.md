# @iraq-maps/map-kit

The city vector map for the app: a MapLibre Native map (`@maplibre/maplibre-react-native` 11.5) with one style
template for every label language, the OSM attribution, the user location puck and a result-marker layer. It also
ships a Jest mock of the native map for feature tests.

| Export | What it does |
|---|---|
| `MapCanvas(props)` | The map (`testIDs.map.view`) with `MapAttribution` on top. It fills its parent (`flex: 1`). |
| `MapAttribution()` | `OSM_ATTRIBUTION` (`testIDs.map.attribution`). `MapCanvas` already renders it. |
| `resolveSource(city, apiBaseUrl)` | The descriptor's tile and glyph URLs, made absolute. |
| `buildStyle(lang, source)` | The MapLibre style for one label language. |
| Types | `MapCanvasProps`, `MapCamera`, `MapMarker`, `StyleSource`. |

## Using MapCanvas (feature-map)

```tsx
import { MapCanvas, type MapCamera, type MapMarker } from '@iraq-maps/map-kit';

// city: one item of GET /v1/cities (api.cities.list()), apiBaseUrl: the base URL the API client uses.
<MapCanvas
  city={city}
  apiBaseUrl={apiBaseUrl}
  lang={mapLang}                 // 'ar' | 'ckb' | 'en'
  camera={camera}                // optional, controlled
  markers={markers}              // optional: search results
  onMarkerPress={(id) => openPlace(id)}
  showUserLocation={granted}     // after the caller got the location permission
  onPress={() => setSelected(undefined)}
  onCameraChanged={(center, zoom) => setNear(center)}  // optional: after each pan/zoom settles
/>
```

`MapCanvas` fills its parent (`flex: 1`); give the parent a size.

- **Source.** `tilesUrl` is `pmtiles://https://...` or an XYZ template, often the API fallback route
  `/v1/cities/:id/tiles/{z}/{x}/{y}`. Root-relative URLs are joined to `apiBaseUrl` the same way `@iraq-maps/api-client`
  joins paths (trailing slashes are dropped), and absolute and `pmtiles://` URLs pass through.
- **Style.** It is rebuilt only when `lang` or the resolved URLs change, so a new `city` object with the same URLs or
  a new marker list does not reload the map.
- **Camera.** Without `camera`, the map opens on `city.bbox`. Every new `camera` object animates the map to
  `{ center, zoom }` or to `{ bounds, paddingPx }`, also when its values equal the previous one (locate-me pressed
  again after a pan). Keep the value in state and create a new object only to move the map: an unrelated re-render
  with the same object does not pull a panned map back. `MapCanvas` calls the MapLibre camera's `setStop` imperatively,
  because the native `stop` prop is diffed by value, and applies the current camera once the style has loaded. Panning is
  limited to `cameraBounds(city.bbox)` from `@iraq-maps/geo` (the bbox plus 10% on each side). `onCameraChanged(center,
  zoom)` fires once the region settles (MapLibre `onRegionDidChange`), after a user pan or zoom and after a camera move,
  so search `near` can follow the visible map. In tests: `fireEvent(mapView, 'regionDidChange', { nativeEvent: { center,
  zoom } })`.
- **Markers.** A GeoJSON source with a circle layer, drawn above the map labels. A `selected` marker is larger, red,
  and drawn on top of the others. A tap on a marker calls `onMarkerPress(id)` and does not reach `onPress`. Memoise the
  array.
- **User location.** `showUserLocation` shows MapLibre's native puck. The caller requests the permission first.
  MapLibre's Android manifest already declares `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`.
- **Attribution.** MapLibre's own attribution button and logo are off, because `MapAttribution` is always rendered at the
  bottom-end corner (bottom-left in RTL), and no prop hides it. It does not take touches, and it wraps rather than
  truncating at large font scales. A card or sheet must not
  cover that corner: lay it out below the canvas or shrink the canvas.

## Style template

`buildStyle` has one template for every locale, derived from `TileSchema` in `@iraq-maps/contracts`:

- One vector source `city`: `{ url }` for `pmtiles://`, or `{ tiles: [template], minzoom, maxzoom }` from
  `TileSchema.minZoom`/`maxZoom` for XYZ. It carries `OSM_ATTRIBUTION`. `glyphs` is `source.glyphsUrl`.
- Layers draw every `TileSchema` layer: background, landuse, water (fill and line), building, roads (casing and line,
  width and colour by class), boundary, then road, POI and place labels. They read only `TileSchema.fields`. A class
  lookup is a `match` over all of the layer's `TileSchema` classes, and the class tables are typed
  `Record<class, …>`, so a schema change fails the typecheck.
- Every symbol layer uses `text-font: [Glyphs.fontstack]` and
  `text-field: ['coalesce', ...nameFallback(lang).map((l) => ['get', 'name:' + l]), ['get', 'name']]`, so `ar` is
  `name:ar, name:ckb, name`, `ckb` is `name:ckb, name:ar, name`, and `en` is `name:en, name:ar, name:ckb, name`. Labels are
  `#1f2328` on a 92% white halo. There is no letter spacing, which would break Arabic shaping.
- The tests check every language with both source kinds against `validateStyleMin` from
  `@maplibre/maplibre-gl-style-spec`, with zero errors.

## Testing with the Jest mock

The real module cannot load in Jest, so mock it in every test that renders `MapCanvas`:

```ts
jest.mock('@maplibre/maplibre-react-native', () => jest.requireActual('@iraq-maps/map-kit/jest-mock'));
import { mapPartIDs, markerTestID } from '@iraq-maps/map-kit/jest-mock';
```

Each MapLibre component becomes a host `View` that keeps its props. As on the device, the map mounts its children
after the first render and then reports that the style has loaded, all within `await render(...)`.

- `testIDs.map.view` has `mapStyle` and `onPress`. Simulate a map tap with
  `await fireEvent.press(screen.getByTestId(testIDs.map.view), { nativeEvent: { lngLat, point } })`.
- `mapPartIDs.camera` has `maxBounds`, `initialViewState` and `setStop`, a `jest.fn` that records every camera move:
  `expect(screen.getByTestId(mapPartIDs.camera).props.setStop).toHaveBeenLastCalledWith(expect.objectContaining({ center: [lng, lat], zoom: 16 }))`.
- `mapPartIDs.markers` has the GeoJSON `data`. Each marker is a pressable `markerTestID(id)` whose `aria-selected`
  follows `selected`: `await user.press(screen.getByTestId(markerTestID('n1')))` calls `onMarkerPress('n1')`. Like
  MapLibre, a feature press bubbles to the map's `onPress` unless the source handler calls `event.stopPropagation()`,
  which `MapCanvas` does for markers.
- `mapPartIDs.userLocation` is present only while `showUserLocation` is set.
- `testIDs.map.attribution` is the real `MapAttribution`.

## Licences and integration

- `@maplibre/maplibre-react-native`: MIT. MapLibre Native (the Android and iOS SDKs it pulls in, 13.6.1 on Android):
  BSD-2-Clause. `@maplibre/maplibre-gl-style-spec` (BSD-3-Clause text): only its types are imported by `src`, and the
  validator runs in tests only, so it is not bundled.
- Map data is © OpenStreetMap contributors (ODbL). The attribution is always visible (CLAUDE.md rule 4). The tiles
  come only from the city descriptor (our PMTiles or the API fallback), never from `tile.openstreetmap.org` or another
  third-party tile host.
- The app config must list the `@maplibre/maplibre-react-native` config plugin, without options (see
  `docs/contract-requests/M1-builder-map-kit.md`).

**Ports:** none. **Env:** none. The tile and glyph URLs come from `GET /v1/cities`, and the API base URL from the shell.
Tests: `pnpm --filter @iraq-maps/map-kit test` (jest-expo and RNTL).
