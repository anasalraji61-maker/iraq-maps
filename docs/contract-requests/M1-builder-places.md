# M1 contract requests from builder-places

## 1. Wire places into apps/api (integrator, blocking for AC#4)

`apps/api/src/app.ts`:

```ts
import { placesMigrationsDir, placesModule } from '@iraq-maps/places';

export const moduleMigrations = [
  { schema: 'identity', migrationsDir: identityMigrationsDir },
  { schema: 'places', migrationsDir: placesMigrationsDir }, // no dependency on identity; order is free
];
// in createApp:
imports: [identity, placesModule({ db, env: opts.env })],
```

- `apps/api/package.json` needs `"@iraq-maps/places": "workspace:*"`.
- `placesModule` reads `TILES_SOURCE` and `GLYPHS_SOURCE` (both optional) and `APP_ENV` through
  `defineModuleConfig('places', …)`. A set value must be an absolute path or an http(s) URL, or boot fails naming the
  variable. `.env.example` already lists both. Suggested comment change: "local path" becomes "absolute local path".
- e2e/api `places.test.ts` turns itself on when `moduleMigrations` includes `places`.

## 2. Public routes in `IdentityAuthGuard` (integrator, owner of modules/identity in M1; blocking)

The guard in `modules/identity/src/http.ts` lets through only `/health` and `/v1/auth/*`. Every places route is public
and must be added. The guard matches the registered route pattern (`req.routeOptions.url`), so list the exact patterns.
A prefix such as `/v1/places/` would also expose future routes, like a saved-places endpoint:

```ts
const PUBLIC_ROUTE =
  /^\/(health|v1\/auth\/.+|v1\/search|v1\/places\/(nearby|:id)|v1\/cities(\/:id\/(tiles\/:z\/:x\/:y|glyphs\/:fontstack\/:range))?)$/;
```

The six places patterns are `/v1/search`, `/v1/places/nearby`, `/v1/places/:id`, `/v1/cities`,
`/v1/cities/:id/tiles/:z/:x/:y` and `/v1/cities/:id/glyphs/:fontstack/:range`. Please add a guard test that each one
answers without a token and that `/v1/me` still needs one. The identity README sentence "Every route except `/health`
and `/v1/auth/*`" needs the same update.

## 3. `CliContracts.placesImport.command` (integrator; same as M1-builder-geo-data §1)

Use `pnpm --filter @iraq-maps/places run import`, because `pnpm import` is a built-in command. The package script is
`import` (`tsx src/import-cli.ts`). It applies the `places` migrations, then imports, and prints `{"place":n,"street":n,"area":n}`.

## 4. knip (integrator)

Remove the `modules/places` `ignoreDependencies` block from `packages/tooling/knip.json`. Every declared dependency is
used: with the block removed, `knip` exits 0. Checked with a temporary copy of the config.

## 5. Precise coordinates in request logs (integrator, security lens, non-blocking)

With `logger: true`, Fastify logs `req.url` for each request, including `?near=<lng>,<lat>` at full precision. The
observability reviver only rounds numeric `lat`/`lng` keys. Proposal: give the Fastify logger a `req` serializer that
logs `routeOptions.url` (the pattern) or the path without its query string. places itself never logs coordinates,
paths or env values. Its only log is a warning with the city id and an error code when a tile source is unreadable.

## 6. db-kit: no `'error'` listener on the pg Pool (integrator, non-blocking but real)

`createDb` creates a `pg.Pool` without `pool.on('error', …)`. An error on an idle client is then an unhandled
`'error'` event:
- In production, a database restart or failover crashes the API process.
- In tests, in 1 of 5 runs here, `TestDatabase.drop()` reports 57P01 `terminating connection due to administrator
  command`. `pool.end()` resolves before its clients have disconnected, and `DROP DATABASE … WITH (FORCE)` then kills
  them. Vitest shows "Errors 3" although every test passed.

Proposal: `pool.on('error', (err) => log.warn({ code: err.code }, 'idle pg client error'))` in `createDb`.

## 7. `429: Problem` on the tile and glyph routes (integrator, additive contract change, non-blocking)

The security audit (S1, minor #1) put tiles and glyphs behind their own rate limit: 1200 a minute per client network.
`citiesContract.tile` and `citiesContract.glyphs` declare no 429, and `strictStatusCodes` is on. So places throws
`HttpException(<Problem rate_limited>, 429)`, and ProblemFilter returns the Problem body unchanged. Please add
`429: Problem` to both routes' `responses`. The handlers can then return the 429 the same way search does. The client
behaviour does not change: MapLibre retries a 429 later.

## 8. One shared client-network helper (integrator, non-blocking)

identity (`ipBucket` in `src/otp.ts`) and places (`ipBucket` in `src/http.ts`) both reduce `req.ip` to a client
network: an IPv4 address, or an IPv6 /64. Modules cannot import each other, so places has its own copy, written
differently (it uses the normalized-string prefix and also handles unparsable addresses). jscpd reports 0 clones. If
the integrator wants a single definition, it could go in a shared package (for example
`clientNetwork(ip)` with `ipaddr.js`) for both modules.

## 9. For information

- **Rate limits.** `/v1/search` and `/v1/places/nearby` share 300 requests a minute per client network (IPv4, or
  IPv6 /64). They answer 429 `rate_limited`. `bench search` (200 queries by default) stays under it; a larger `--count`
  against one API within a minute would get 429s. Tiles and glyphs have their own 1200 a minute (§7). Carrier CGNAT
  puts many users behind one IPv4, so these numbers may need tuning in production.
- **Lockfile.** `modules/places` now depends on `ipaddr.js ^2.5.0`, which identity already uses. The only
  `pnpm-lock.yaml` change is 3 lines in the places importer.
- **Area derivation** (M1-builder-geo-data §2, option a). This is done: at import, `area` is the nearest
  `kind: 'area'` record within 3 km, the same as `FakePlacesQueryPort`.
- **Duplicate test helper (optional).** `modules/places/src/places.test.ts` and `e2e/api/test/places.test.ts` each
  write a one-tile PMTiles archive. A shared `pmtilesFixture(tile)` in packages/testing would remove one of them.
  jscpd does not flag them.
