# @iraq-maps/bench

Search latency benchmark for AC#8 of M1, implementing `CliContracts.benchSearch` (`packages/contracts`). The
`geo-data.yml` perf job runs it against the API it started on the real city data.

```sh
pnpm -s --filter @iraq-maps/bench search --api http://localhost:3000 --city baghdad \
  --input "$PWD/data/places.ndjson" [--count 200] [--budget-ms 800]
```

- Reads `--input` (each line a `PlaceImportRecord`, validated with the contract schema). Paths are resolved from
  `tools/bench`, so pass absolute ones.
- Sends `--count` queries to `GET /v1/search`, one at a time. The queries are sampled evenly from the records and are
  the same on every run. They cycle through three forms of a record's Arabic name (or `name`): the full name, the
  spelling people type (bare alef, ه for ة, ي for ى), and a typed-as-you-go prefix. Every other query also sends
  `near` at the record.
- Each query's time is the wall time from the request to the end of the body. The API runs in the same job, so this
  is the server time plus loopback. A 429 is waited out (`Retry-After`, default 1 s) and retried up to 5 times, and
  its time is not counted. A query fails when the request errors or the answer is not a 200 with a `SearchResult` body.
- Prints `{ city, count, errors, p50Ms, p95Ms, maxMs }` as one JSON line on stdout (nearest-rank percentiles, 0.1 ms).
  `pnpm -s` keeps pnpm's own banner off stdout.
- Appends a Markdown table to `$GITHUB_STEP_SUMMARY` when that is set.
- Exits 1 unless `errors` is 0 and p95 is under `--budget-ms` (AC#8: under 800 ms).

It provides and consumes no ports and reads no other env.
