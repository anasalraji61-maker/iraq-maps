# @iraq-maps/geo-pipeline

Per-city OSM data pipeline. It is Python, not TypeScript; the pnpm scripts wrap a local venv
(`scripts/py.sh` creates `.venv` from `requirements.txt`) so turbo can run `test` and `lint`.

- `cities/<id>.yaml`: city config (names ar/ckb/en, bbox or polygon, default locales, categories).
  Validated by `quality/cities.py` (`python -m quality.cities validate cities/*.yaml`).
- `pipeline/extract.py`: the city extract (`CliContracts.pipelineExtract` in `packages/contracts`). It clips the
  extract with osmium, then writes `places.ndjson` (`PlaceImportRecord` lines: places, streets, areas) and
  `city.json` (`CityImportRecord`), each line checked against `packages/contracts/schemas/*.schema.json`.
  The rules (tag to category mapping, street merging, areas) are in the module docstring.
  ```
  pnpm --filter @iraq-maps/geo-pipeline extract --city baghdad --input /abs/iraq-latest.osm.pbf --output /abs/out
  ```
- `scripts/city-data.sh`: the `data-<city>-<date>` artifact of `.github/workflows/geo-data.yml` (ADR-0008): the
  extract, then tiles and glyphs from `geo-services/tiles` when implemented, then `ATTRIBUTION.txt`.
  `scripts/fetch-extract.sh` downloads and md5-checks a Geofabrik extract (CI only; Geofabrik is blocked for agents).
- `quality/`: OSM quality report for the first-city decision (task T01). `metrics.py` computes the
  MVP.md section 1 metrics for one clipped extract; `compare.py` applies the decision rule and renders
  the Markdown table. Definitions and how to fetch the CI report: `docs/reports/README.md`.
- `tests/`: pytest against hand-made CC0 fixtures with known values (`tests/fixtures/*.osm.xml`).

## Fixture data for other packages

`tests/fixtures/baghdad-mini.osm.xml` (CC0, Baghdad-like, spelling variants قلعة and أربيل) is extracted to
`tests/fixtures/baghdad-mini/places.ndjson` (15 places, 4 streets, 4 areas) and `city.json`. Both are committed for
the places and e2e tests, and `tests/test_extract.py` fails when they are stale. Regenerate from this directory:

```
sh scripts/py.sh -m pipeline.extract --city baghdad --input tests/fixtures/baghdad-mini.osm.xml --output tests/fixtures/baghdad-mini
```

This also writes the clipped `baghdad.osm.pbf` there (gitignored), usable as a pbf fixture.

Needs `python3` (with venv) and `osmium-tool`; `city-data.sh` also needs `jq`. No env vars, no ports.
Data is OSM (ODbL) from Geofabrik; outputs go to `data/` and `out/` (gitignored).
