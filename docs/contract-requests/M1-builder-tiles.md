# M1 contract requests from builder-tiles

## 1. Export `Glyphs` to JSON, like `TileSchema` (non-blocking)

**Status: open.**

`TilesTest` (Java) has to check `Glyphs.fontstack` and `Glyphs.requiredRanges`. They exist only in
`packages/contracts/src/geo-data.ts`, so the test reads them from the TS source with a regular expression for now
(marked with a comment pointing here), which avoids copying them.

Proposed additive change in `packages/contracts`:
- add `await expect(json(Glyphs)).toMatchFileSnapshot('../schemas/glyphs.json');` to the
  `schemas/*.json are the exports of the TS contracts` test in `src/geo-data.test.ts`, and commit the generated
  `schemas/glyphs.json`.

After it lands, builder-tiles replaces the regular expression in `TilesTest.glyphsCoverTheRequiredRanges` with a
Jackson read of `schemas/glyphs.json`.

## 2. One shared OSM tag to `PlaceCategory` mapping (blocking for consistency between tiles and search)

**Status: open.**

The poi class in the tiles (`geo-services/tiles`) and `PlaceImportRecord.category` from the pipeline extract
(`geo-services/pipeline`, builder-geo-data) must agree. Otherwise a place shows one category icon on the map and
another on its card and in search. `PlaceCategory` says that the pipeline maps OSM tags onto the categories, but the
mapping itself is not in the contracts, and the two builders work in parallel. The pipeline had no mapping when this
was written, so `CityProfile.RULES` holds the poi rules below.

Proposed additive change in `packages/contracts/src/geo-data.ts`, exported to `schemas/place-category-rules.json` by the
same snapshot test, so the Python pipeline and the Java profile both read it:

```ts
/** OSM tags to PlaceCategory. The first rule whose tags all match wins; '*' is any value but "no". Elements that
 * match no rule are not POIs. @public frozen contract (M1) */
export const PlaceCategoryRules: readonly { category: PlaceCategory; tags: Readonly<Record<string, readonly string[]>> }[] = [
  { category: 'food', tags: { amenity: ['restaurant', 'fast_food', 'food_court', 'ice_cream'] } },
  { category: 'cafe', tags: { amenity: ['cafe', 'hookah_lounge'] } },
  { category: 'health', tags: { amenity: ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy'] } },
  { category: 'finance', tags: { amenity: ['bank', 'atm', 'bureau_de_change', 'money_transfer'] } },
  { category: 'fuel', tags: { amenity: ['fuel'] } },
  { category: 'worship', tags: { amenity: ['place_of_worship'] } },
  { category: 'education', tags: { amenity: ['school', 'university', 'college', 'kindergarten', 'library'] } },
  { category: 'government', tags: { amenity: ['townhall', 'police', 'courthouse', 'fire_station', 'post_office'] } },
  { category: 'transport', tags: { amenity: ['bus_station', 'taxi', 'ferry_terminal'] } },
  { category: 'entertainment', tags: { amenity: ['cinema', 'theatre', 'arts_centre'] } },
  { category: 'shopping', tags: { amenity: ['marketplace'] } },
  { category: 'lodging', tags: { tourism: ['hotel', 'hostel', 'guest_house', 'motel', 'apartment'] } },
  { category: 'entertainment', tags: { tourism: ['theme_park', 'zoo'] } },
  { category: 'tourism', tags: { tourism: ['attraction', 'museum', 'viewpoint', 'gallery', 'artwork'] } },
  { category: 'health', tags: { healthcare: ['*'] } },
  { category: 'government', tags: { office: ['government'] } },
  { category: 'office', tags: { office: ['*'] } },
  { category: 'shopping', tags: { shop: ['*'] } },
  { category: 'entertainment', tags: { leisure: ['park', 'stadium', 'sports_centre', 'fitness_centre', 'water_park', 'amusement_arcade'] } },
  { category: 'transport', tags: { railway: ['station'] } },
  { category: 'transport', tags: { aeroway: ['aerodrome'] } },
  { category: 'tourism', tags: { historic: ['*'] } },
];
```

After it lands, builder-tiles drops the poi rows from `CityProfile.RULES` and reads the JSON instead. builder-geo-data
reads the same file in the extract. Until then, builder-geo-data should mirror this table.

## 3. Turbo inputs for the geo-tiles test (non-blocking)

**Status: open.**

The geo-tiles test reads `packages/contracts/schemas/tile-schema.json` and `packages/contracts/src/geo-data.ts`, which
are outside the package and not workspace dependencies of it. With turbo's cache, a contract change would replay a
cached pass. Proposed addition to `turbo.json`, like `@iraq-maps/ownership#test`:

```json
"@iraq-maps/geo-tiles#test": {
  "inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/packages/contracts/schemas/*.json", "$TURBO_ROOT$/packages/contracts/src/geo-data.ts"]
}
```

## 4. DATA_SOURCES rows (for builder-geo-data, the owner of `docs/DATA_SOURCES.md`) (non-blocking)

**Status: open.**

- The fixture `geo-services/tiles/src/test/fixtures/city.osm`: hand-made original work, not derived from OSM,
  CC0 1.0, approved (like the pipeline's `mini-city.osm.xml` row).
- The glyph PBFs from `tiles glyphs`: rendered from Noto Sans Arabic (the existing row), SIL OFL 1.1, shipped in the
  `data-<city>-<date>` artifact and served by the glyphs fallback route. `tiles glyphs` writes the full OFL 1.1 text
  (the font's `LICENSE_FONT`) as `<dir>/Noto Sans Arabic Regular/OFL.txt`, so copy the fontstack directory whole into
  the artifact. Its `ATTRIBUTION.txt` carries the OFL notice and points to that file.
- Build tools that are not distributed in the app: Planetiler 0.10.2 (`planetiler.jar`, Apache-2.0, with GeoTools
  LGPL-2.1 inside) and fontnik 0.7.7 (BSD-3-Clause: its `LICENSE.txt` has the non-endorsement clause; its
  package.json has no licence field).

No CI change is needed: `ci.yml` already installs `osmium-tool`, sets up Java 21 with the Maven cache and caches
`geo-services/tiles/.cache`. `geo-data.yml` needs the same Java 21 setup to run `tiles build`.

## 5. ADR-0008: fontnik is BSD-3-Clause (for the integrator, the owner of `docs/adr/`) (non-blocking)

**Status: open.**

ADR-0008 decision 5 ("أداة الـ glyphs: fontnik 0.7.7 (npm، BSD-2-Clause، Mapbox)") names the wrong licence.
`node_modules/fontnik/LICENSE.txt` has three clauses, the third being "Neither the name of [project] nor the names of
its contributors may be used to endorse or promote products derived from this software", which is BSD-3-Clause. Still
commercial-compatible. Exact change: `BSD-2-Clause` → `BSD-3-Clause` on that line. The tiles README and request #4 are
already corrected.

## 6. M1 front-matter: own the M1 contract-request files (for the integrator) (blocking for the closure gate)

**Status: resolved upstream.** (02d00a1 lists each docs/contract-requests/M1-<builder>.md in the front-matter).

`docs/milestones/M1-map-search-place-card.md` gives no builder its `docs/contract-requests/M1-<builder>.md`, unlike
M0. `pnpm ownership:check --milestone M1` (run by `pnpm gate`) reports `outside every owner:
docs/contract-requests/M1-builder-tiles.md` (and the map-kit one) and fails, although CLAUDE.md prescribes that
channel. Exact change: add `"docs/contract-requests/M1-<builder>.md"` to each M1 builder's `owners` list (the
front-matter is the only source `tools/ownership` reads), e.g. under `builder-tiles:` add
`- "docs/contract-requests/M1-builder-tiles.md"`.
