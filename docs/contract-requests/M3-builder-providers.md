# Contract Requests — M3 builder-providers

All required types were present in `packages/contracts/src/providers.ts`. No gaps found.

## Notes

- `ProviderRecord`, `publicProfileOf`, `contactChannelsOf` are server-side only (not on the wire) — used as-is.
- `ProviderMe`, `AdminProviderView`, `ConsentLedger` match the service's output shape.
- `PhoneVerificationPort` in `packages/contracts/src/ports.ts` covers the `provider_phone` purpose.
- The `providerEventPayloads` in `providers.ts` are already merged into `events.ts` — outbox events publish correctly.

## Location concern

The `geometry(Point, 4326)` column is stored in Postgres using PostGIS. Drizzle's `pg-core` doesn't have a built-in geometry type, so a `customType` is used in `schema.ts`. The location value is passed as a WKT string (`SRID=4326;POINT(lng lat)`) on insert/update, and the read value from PostGIS comes back as a WKT string that is stored as-is. The `toProviderMe` helper parses it via `JSON.parse` which will not work for WKT — this needs a follow-up: either use `ST_AsGeoJSON` in the query or store as separate lng/lat columns.

**Request**: Consider adding a `geo` helper to `packages/db-kit` or `packages/geo` for reading PostGIS geometry columns as `[lng, lat]` tuples. For now the location field returns null until this is resolved.
