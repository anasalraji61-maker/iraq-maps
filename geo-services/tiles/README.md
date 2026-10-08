# @iraq-maps/geo-tiles

Vector tiles and glyphs for one city (ADR-0008). Java 21 + Maven for the Planetiler profile, Node for the glyphs. The
pnpm scripts wrap both so turbo can run `test`, and geo-data.yml calls the CLI.

- **Tiles:** a PMTiles v3 archive of MVT tiles built from OSM only (no Natural Earth, no ocean polygons). Layers,
  geometry types, classes, fields and zooms come from `TileSchema`, read at runtime from
  `packages/contracts/schemas/tile-schema.json`. poi classes come from the shared OSM tag to `PlaceCategory` rules in
  `packages/contracts/schemas/osm-categories.json`, which the pipeline extract reads too. `CityProfile` holds only the
  tag mapping of the other layers, and refuses to start unless the classes equal the schema's, layer by layer. Each feature has `class` plus whichever of `name`,
  `name:ar`, `name:ckb`, `name:en` the element has. Tiles are gzip-compressed (Planetiler's default). Feature ids are
  Planetiler's: OSM id × 10 + 1 (node), 2 (way) or 3 (relation).
- **Glyphs:** fontnik renders every 256-codepoint range of the BMP (about 1.9 MB) from the registered
  `NotoSansArabic_400Regular.ttf`. The fontstack and the required ranges come from
  `packages/contracts/schemas/glyphs.json`: the directory is `Glyphs.fontstack` (`Noto Sans Arabic Regular`; the script
  fails if the font's own name differs) and covers `Glyphs.requiredRanges`, including the Arabic presentation forms
  (the script fails if a required range is not a 256-codepoint block). It also holds the font's licence as `OFL.txt`
  (see below).

## CLI (`CliContracts.tilesBuild` and `glyphsBuild`)

```
pnpm --filter @iraq-maps/geo-tiles tiles build --input <clipped.osm.pbf> --output <city.pmtiles> --bbox w,s,e,n
pnpm --filter @iraq-maps/geo-tiles tiles glyphs --output <dir>     # writes <dir>/Noto Sans Arabic Regular/<start>-<end>.pbf and OFL.txt
```

`scripts/tiles.sh` runs from the package directory, so pass absolute paths. `build` fetches `planetiler.jar`
(`scripts/planetiler.sh`, SHA-256 pinned), compiles with `mvn -q -B compile`, then runs `TilesCli`. Bad arguments,
including an `--output` that is a directory, print the problem and the usage and exit 2. The archive is built into a
hidden temporary file beside `--output` and moved over it only on success, so a failed build exits non-zero and leaves
any previous archive at `--output` as it was.

## Tag mapping (`CityProfile.RULES` and `osm-categories.json`)

Per layer the first matching rule wins, so one element can land in several layers (a park is landuse and a poi).
`key=*` matches any value but `no`. Areas in the point layers become a point inside the area. A rule can keep to one
geometry: `waterway=river` and `waterway=canal` are always lines, even when the way is closed (a ring canal), so water
polygons come only from the area rules.

| layer | class (min zoom) ← OSM tags |
|---|---|
| place | city (4), town (8), village (10), suburb (11), quarter (12), neighbourhood (13) ← `place=<class>` |
| transportation | motorway (5), trunk (6), primary (8), secondary (9), tertiary (10) ← `highway=<class>` or `<class>_link`; minor (12) ← `highway=residential,unclassified,living_street,road`; service (13) ← `highway=service`; path (13) ← `highway=footway,path,pedestrian,cycleway,steps,track` |
| poi (max zoom, 14) | the `PlaceCategory` that `packages/contracts/schemas/osm-categories.json` gives the element's own tags: rules in order, the first that yields a category wins, an exact value beats `*`, and `no`/`vacant` never match. Anything else is dropped. |
| building (13) | building ← `building=*` |
| water | river ← `waterway=river` line (8), `waterway=riverbank` or `natural=water` + `water=river` (4); canal ← `waterway=canal` line (11), `natural=water` + `water=canal` (4); lake ← other `natural=water` (4) |
| landuse (10) | residential, industrial ← `landuse=<class>`; commercial ← `landuse=commercial,retail`; park ← `leisure=park,garden`; grass ← `landuse=grass,meadow,village_green`; cemetery ← `landuse=cemetery`, `amenity=grave_yard`; farmland ← `landuse=farmland,orchard` |
| boundary | country (0), province (4), district (8) ← ways of `type=boundary` + `boundary=administrative` relations with the lowest `admin_level` 2, 3–4 or 5–6. Such a way carries only `class`, never its own road or river names, unless it is tagged as that boundary itself. |

The tiles show every category the shared table yields; a city config that lists fewer categories filters only the
pipeline's places.ndjson (search and cards).

## Test (acceptance #2 of M1)

`pnpm --filter @iraq-maps/geo-tiles test` fetches the jar, then `mvn -q -B test` runs `TilesTest`. It converts the
CC0 fixture `src/test/fixtures/city.osm` to `target/city.osm.pbf` with osmium, builds `target/city.pmtiles`
through `TilesCli`, reads the PMTiles header and decodes every tile, and asserts that:

- the header zooms equal `minZoom`/`maxZoom` and the bounds equal `--bbox`;
- every feature's layer, geometry type, `class` and attribute keys are in `TileSchema`, and the fixture yields every
  layer and every field;
- named features carry `name`, `name:ar`, `name:ckb` and `name:en` as tagged, `name:fr` and `amenity=bench` are
  dropped, and POIs start at z14;
- every POI's class is the category `osm-categories.json` gives its fixture element, and exactly the elements with a
  category become POIs;
- a closed `waterway=canal` stays a line, and the river that is also a district boundary gives that boundary no names;
- bad CLI arguments (including a directory as `--output`) are rejected, and a failed build keeps the previous archive;
- `tiles glyphs` writes every `Glyphs.requiredRanges` file with glyphs in it, plus `OFL.txt`.

## Requirements

Java 21, Maven 3.9, Node 22, `osmium-tool` (test fixture only), and network access once to github.com for
`planetiler.jar` (cached in `.cache/`, as CI does) and to Maven Central for the Maven plugins and JUnit. No env vars,
no ports.

## Licences and attribution

- Planetiler 0.10.2 (Apache-2.0) bundles GeoTools (LGPL-2.1) and other libraries; all are build tools that never ship
  in the app. fontnik 0.7.7 is BSD-3-Clause (its `LICENSE.txt`; the package.json has no licence field).
- The glyph PBFs are rendered from Noto Sans Arabic (SIL OFL 1.1, © The Noto Project Authors). They are a Modified
  Version of the font, which the OFL requires to travel with the copyright notice and the licence, so `tiles glyphs`
  copies the package's `LICENSE_FONT` into the fontstack directory as `OFL.txt`. Copy that directory whole.
- The tiles are derived from OpenStreetMap (ODbL 1.0). The archive metadata carries Planetiler's
  `© OpenStreetMap contributors` link. Per ADR-0008, every data artifact ships an `ATTRIBUTION.txt` with the ODbL
  attribution for OSM and the OFL notice for the glyphs, and the map shows `OSM_ATTRIBUTION` at all times.
