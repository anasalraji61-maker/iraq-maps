# @iraq-maps/geo-pipeline

Per-city OSM data pipeline. It is Python, not TypeScript; the pnpm scripts wrap a local venv
(`scripts/py.sh` creates `.venv` from `requirements.txt`) so turbo can run `test` and `lint`.

- `cities/<id>.yaml`: city config (names ar/ckb/en, bbox or polygon, default locales, categories).
  Validated by `quality/cities.py` (`python -m quality.cities validate cities/*.yaml`).
- `quality/`: OSM quality report for the first-city decision (task T01). `metrics.py` computes the
  MVP.md section 1 metrics for one clipped extract; `compare.py` applies the decision rule and renders
  the Markdown table. Definitions and how to fetch the CI report: `docs/reports/README.md`.
- `tests/`: pytest against a hand-made fixture with known values (`tests/fixtures/mini-city.osm.xml`).

Needs `python3` (with venv) and, for clipping, `osmium-tool`. No env vars, no ports.
Data is OSM (ODbL) from Geofabrik; outputs go to `data/` and `out/` (gitignored).
