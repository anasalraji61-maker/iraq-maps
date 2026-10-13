# M2 builder-imagery — contract gap log

No contract gaps identified for M2.

## Contracts consumed (read-only)

- `packages/contracts/src/imagery.ts` — `SatelliteLayer`, `imageryContract`, `ImageryCliContracts`
  - The CLI produces `<city>-satellite.pmtiles` and `ATTRIBUTION.txt` matching `ImageryCliContracts.imageryBuild.outputs`.
  - `metadata.json` carries all fields required by `SatelliteLayer` (`url` is set by the API module when serving the file; the pipeline records `attribution`, `resolutionM`, `capturedAt`).

## Notes

- `pipeline.py` accepts `--output` (matching contract) and `--max-cloud` (default 20).
- The PMTiles file is named `<city>-satellite.pmtiles` as the contract specifies.
- S3 listing depth: MGRS grid → year → month → day → acquisition (four levels of `Delimiter='/'` pagination).  Earth Search STAC is not used.
