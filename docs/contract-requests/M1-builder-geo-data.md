# M1 contract requests from builder-geo-data

## 1. `CliContracts.placesImport.command` runs pnpm's own `import` command (blocking for anyone using it verbatim)

`pnpm --filter @iraq-maps/places import --city … --input …` does not run the package script. `import` is a built-in
pnpm command, so pnpm 10.28.0 answers `ERROR Unknown options: 'city', 'recursive'` and exits 1.

A related trap: `pnpm --filter <pkg> <script>` exits **0** when the package does not exist ("No projects matched the
filters") or has no such script ("None of the selected packages has a … script"). Both were verified here with
`@iraq-maps/bench search` and `@iraq-maps/geo-pipeline search`.

- **Proposed fix:** set the command to `pnpm --filter @iraq-maps/places run import`, or rename the script (for example
  `import-city`).
- **Note for every CLI contract:** callers that must fail on a missing CLI run `pnpm run <script>` from the package
  directory (`ERR_PNPM_NO_SCRIPT`, exit 1).
- **What geo-data.yml does now:** the `perf` job does exactly this, with `cd modules/places && pnpm run import …` and
  `pnpm run search` in `tools/bench`.

## 2. `PlaceImportRecord` cannot carry the area name that `PlaceDetails.area` needs (non-blocking)

`PlaceDetails.area` is `PlaceNames | null`. The import record schema has `additionalProperties: false` and no area
field, so the pipeline cannot pass on `addr:suburb` or a point-in-area result. Two options:

- **(a) M1, no contract change:** places derives `area` at import time from the city's own `kind: 'area'` records,
  for example the nearest area point within about 2 km. Everything stays in schema `places`.
- **(b) Later, additive:** add `area: PlaceNames.optional()` to `PlaceImportRecord`. The pipeline would fill it from
  `addr:suburb`, or from a point-in-polygon test against the suburb, quarter, neighbourhood and admin polygons it
  already assembles.

## 3. `CityImportRecord` has no attribution (informational)

`city.json` follows the frozen schema `{id, names, bbox, center}`. `CityDescriptor.attribution` can come from
`OSM_ATTRIBUTION` in places. The full attribution text (ODbL, plus OFL for the glyphs) ships as `ATTRIBUTION.txt` in
the `data-<city>-<date>` artifact. No change is needed unless a city ever needs its own attribution.

## 4. `pipelineExtract --city` also accepts a path (informational, superset)

`--city baghdad` resolves to `geo-services/pipeline/cities/baghdad.yaml`, as frozen. A value that ends in `.yaml` is
read as a path to a city config.
