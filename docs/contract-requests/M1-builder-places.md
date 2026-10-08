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

## 7. For information

- **Rate limit.** `/v1/search` and `/v1/places/nearby` share 300 requests a minute per client IP, in memory, and
  answer 429 `rate_limited`. `bench search` (200 queries by default) stays under it. A larger `--count` against one
  API within a minute would get 429s.
- **Area derivation** (M1-builder-geo-data §2, option a). This is done: at import, `area` is the nearest
  `kind: 'area'` record within 3 km, the same as `FakePlacesQueryPort`.
- **Duplicate test helper (optional).** `modules/places/src/places.test.ts` and `e2e/api/test/places.test.ts` each
  write a one-tile PMTiles archive. A shared `pmtilesFixture(tile)` in packages/testing would remove one of them.
  jscpd does not flag them.
