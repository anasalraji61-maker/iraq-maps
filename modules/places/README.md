# @iraq-maps/places

OSM places, streets and areas of each city, Arabic search over them (PostGIS + pg_trgm, ADR-0005), the city registry,
and the fallback tile and glyph server (ADR-0008). Owns the Postgres schema `places`. Photon is deferred (ADR-0005).

## API

```ts
import { importCity, importFiles, placesMigrationsDir, placesModule } from '@iraq-maps/places';

runModuleMigrations({ url, schema: 'places', migrationsDir: placesMigrationsDir });
@Module({ imports: [placesModule({ db, env? })] })
```

`placesModule` is a global Nest module. It serves `placesContract` and `citiesContract` and provides
`PortTokens.PlacesQueryPort` (`PgPlaces`). It consumes nothing.

| Route | Behaviour |
|---|---|
| `GET /v1/search?q&city&near&lang&limit` | Ranked places, streets and areas of one city. 429 `rate_limited` |
| `GET /v1/places/nearby?city&near&radiusM&category&limit` | Kind `place` within `radiusM`, nearest first. 429 `rate_limited` |
| `GET /v1/places/:id` | `PlaceDetails`, `source: 'osm'` and `OSM_ATTRIBUTION`. 404 Problem `place_not_found` |
| `GET /v1/cities` | `CityDescriptor[]` from `places.cities` (see "Tiles and glyphs" for the URLs) |
| `GET /v1/cities/:id/tiles/:z/:x/:y` | The tile as stored in the PMTiles archive, `application/vnd.mapbox-vector-tile`, with `content-encoding: gzip` when the archive is gzipped (Planetiler's default; HTTP clients decode it). 204 for an empty address; 404 `not_found` without an archive |
| `GET /v1/cities/:id/glyphs/:fontstack/:range` | `<GLYPHS_SOURCE>/<font>/<range>`, `application/x-protobuf`, from the first font of a comma-separated stack that has it. 404 `not_found` otherwise |

All routes are public (no token). 400s come from the contract's zod schemas; the API's ProblemFilter turns them into
Problems. Search and nearby share a limit of 300 requests a minute per client IP (`req.ip`, so behind a proxy set
`TRUST_PROXY`). The limiter is in memory: the MVP runs one API instance.

## Import (CliContracts.placesImport)

```sh
APP_ENV=development DATABASE_URL=postgres://... pnpm --filter @iraq-maps/places run import --city /abs/city.json --input /abs/places.ndjson
```

`run` is required: `pnpm import` is pnpm's own command. The CLI applies the `places` migrations, validates every line
with `PlaceImportRecord` (and the city with `CityImportRecord`), and prints `{"place":n,"street":n,"area":n}`. A bad
line fails the whole import with its line number. `importFiles(db, { city, input })` and `importCity(db, city,
records)` do the same from code (the e2e harness, the tests).

An import replaces one city in a single transaction: it upserts the city, deletes the city's old rows and any row with an
incoming id, then inserts the records. Re-running it changes nothing. It then sets each place's and street's `area` to
the nearest area record within 3 km, and runs `VACUUM ANALYZE` so the trigram index is used at once.

Local fixture: `geo-services/pipeline/tests/fixtures/baghdad-mini/{city.json,places.ndjson}`.

## Search

- Index and query go through `normalizeArabic` (packages/i18n), so أربيل, إربيل and اربيل, or قلعة and قلعه, are the
  same. `search_text` holds every name (`name`, `ar`, `ckb`, `en`) plus a variant without the article ال, so كرخ
  finds الكرخ. A change to the normalizer needs a re-import.
- Candidates come from the GIN index: `q <% search_text` (pg_trgm word similarity at least 0.6).
- Rank = word similarity (0..1), plus up to 0.3 for proximity to `near` (0.3 at 0 m, 0.11 at 3 km, about 0 beyond
  10 km), plus 0.04 for a place or 0.02 for a street. Ties go by id.
- Every value reaches SQL as a bind parameter.
- `src/places.test.ts` checks that the index is used and that p95 stays under 300 ms on 20k rows (about 50 ms here).
  The real budget (p95 under 800 ms on Baghdad) is measured by `geo-data.yml`.

## Tables (schema `places`)

- `cities`: the city registry from `city.json`. That is hand-written city config, not OSM data.
- `osm_features`: places, streets and areas. **OSM-derived columns only (ODbL)**: id (OSM type letter + id, also the
  PlaceId), city, kind, category, names, normalized search text, location (geography point, GiST), nearest area's
  names, and the raw `opening_hours`, `phone` and `website` tags. Provider data (M3) must go in separate tables. The
  test "places.osm_* tables hold only OSM-derived columns" pins the column list.

## Tiles and glyphs (ADR-0008)

| Variable | Value |
|---|---|
| `TILES_SOURCE` | Absolute path or http(s) URL of the city's PMTiles, with `{city}` for the city id, e.g. `/data/{city}.pmtiles` |
| `GLYPHS_SOURCE` | Absolute directory or http(s) URL holding `<fontstack>/<range>.pbf` (`{city}` allowed) |
| `APP_ENV` | Required by `defineModuleConfig` |

Both are optional. Values are never logged.

- `CityDescriptor.tilesUrl` is `pmtiles://<url>` when `TILES_SOURCE` is a URL, else the relative fallback template
  `/v1/cities/<id>/tiles/{z}/{x}/{y}`. `glyphsUrl` is `<url>/{fontstack}/{range}.pbf` for a URL source, else the
  fallback route. A URL source is handed to every client, so it must be public: no credentials or signed queries.
- The archive is read with the `pmtiles` library, one ranged read per request. Its header and directories are cached
  per process, so restart the API after replacing a local file.
- Path traversal: `:id`, `:fontstack` and `:range` must match strict contract regexes (no `.` or `/` in a city or a
  font). Then the resolved path must stay inside the directory that holds the source's first placeholder (`fillSource`).

## Tests

`pnpm --filter @iraq-maps/places test` needs `pnpm infra:local up`. It covers:

- the `placesQueryConformance` suite from packages/testing on PostGIS, seeded through `importCity`;
- the import CLI on the pipeline fixture;
- idempotent re-import;
- the OSM-only columns;
- the HTTP routes, including 400, 404 and 429;
- tiles (200 gzip, 204, 404), glyphs and traversal attempts;
- search performance on 20k synthetic rows.
