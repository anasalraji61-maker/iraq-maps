# CLAUDE.md — instructions for every agent working in this repo

Iraq Smart Maps: an OpenStreetMap-based map app for Iraq (Android first, iOS later), with an AI travel and business assistant, a messaging engine that contacts businesses, provider (business) registration, and a social "Discover" feed. The MVP covers one city (see `docs/MVP.md`).

Read these before you change anything:
- `docs/ARCHITECTURE.md`: stack, module boundaries, contracts. It is binding.
- `docs/TASKS.md`: which task owns which paths, plus the reviewer agents.
- `docs/MVP.md`: what is in and out of scope.

The product language is Arabic. User-facing text is Arabic first, then Kurdish Sorani (`ckb`), then English. Code, identifiers, commit messages and code comments are in English.

---

## 1. Hard rules (never break)

1. **No secrets in the repo. It is PUBLIC.**
   - Never write an API key, token, password, private URL with credentials, keystore, or service-account JSON into any tracked file. That includes tests, fixtures, docs, examples and commit messages.
   - Read secrets only from environment variables, through `packages/config`. Add a new variable to `.env.example` with **an empty value** and a comment.
   - Anything prefixed `EXPO_PUBLIC_` ships inside the app binary, so it is public. Never put a secret there. The mobile app must reach paid or keyed services through our backend.
   - If you find a leaked secret, stop. Report it so the key gets rotated. Deleting the commit does not help in a public repo.
2. **Stay inside your task's owned paths** (`docs/TASKS.md` §0 and §3). If you need a change in a shared path (`packages/contracts`, `apps/api/src`, the mobile shell, root configs), write a request in `docs/contract-requests/<task-id>.md`. Do not edit those paths yourself.
3. **Module boundaries:** `modules/X` may import only from `packages/*`, never from `modules/Y`. Cross-module calls go through ports in `packages/contracts`. Each module owns its own Postgres schema, and joins across schemas are not allowed. `apps/mobile` never imports from `modules/*`.
4. **Data licensing:** use only sources listed in `docs/DATA_SOURCES.md` with a commercial-compatible license. Never use `tile.openstreetmap.org`, Esri, Google, Bing or Mapbox imagery or tiles. Keep provider-owned data in separate tables from OSM-derived data (ODbL). Show OSM attribution at all times.
5. **No invented data:** prices and crowding always carry `source`, `observedAt` and `confidence` (`Estimate<T>`). The AI assistant may only mention places, prices or crowding that came from a tool result.
6. **Consent first:** never show, message, or link a provider's phone, photos or social pages unless the matching consent scope is active. Never send a message on the user's behalf without explicit confirmation.

## 2. Stack (summary)

TypeScript everywhere · pnpm workspaces + Turborepo · React Native + Expo (Expo Router) + MapLibre Native · NestJS (Fastify) · zod + ts-rest contracts · PostgreSQL + PostGIS + pg_trgm via Drizzle · Redis + BullMQ with transactional outbox · Valhalla (routing) · Photon (geocoding) · Planetiler → PMTiles · S3-compatible storage · Claude API (server-side only, model from `ASSISTANT_MODEL`) · Vitest, Testcontainers, Jest/RNTL, Maestro · ESLint, dependency-cruiser, gitleaks.

## 3. Layout

```
apps/mobile      Expo app. Routes in app/, features in src/features/<name>/, shell in src/shell/
apps/api         NestJS composition root. It only wires modules together.
apps/admin       moderation/verification web panel
modules/*        backend domain modules (identity, providers, places, routing, geocoding,
                 insights, assistant, messaging, discover, media, activity, notifications, tour3d*)
packages/*       contracts, config, db-kit, i18n, geo, ui, api-client, tooling
geo-services/*   OSM pipeline, tiles, routing, geocoder, imagery (data, not app code)
infra/           docker-compose for local dev; deployment later
docs/            architecture, ADRs, tasks, MVP, data sources
```
`*` marks a module that is reserved for a later phase. It holds contracts only.

## 4. Commands
These become available once task T00 has scaffolded the repo.
```
pnpm install
pnpm dev                                   # api + mobile (needs infra up)
docker compose -f infra/docker-compose.yml up -d
pnpm turbo run lint typecheck test         # everything
pnpm turbo run test --filter=@iraq-maps/places   # one package
pnpm turbo run lint typecheck test --filter=...[origin/main]   # only what changed
pnpm gitleaks                              # secret scan
pnpm depcruise                             # boundary check
```

## 5. Conventions
- Package names are `@iraq-maps/<name>`. Each package exports only from `src/index.ts`.
- Validate every external input with zod schemas from `packages/contracts`.
- Every port you consume needs an in-memory fake for tests. Do not mock what you do not own.
- Database migrations live per module in `modules/<x>/migrations/` and touch only that module's schema.
- Events are versioned (`<module>.<entity>.<verb>.v1`) and published through the outbox, never inline.
- All UI strings go through `packages/i18n`. No hardcoded text. Layouts must work in RTL.
- Arabic search goes through the shared normalizer in `packages/i18n/src/normalize`.
- External services sit behind interfaces (`OtpSender`, `MessagingChannel`, `LlmClient`, `ObjectStorage`, `PushSender`, `RoutingEngine`, `GeocoderClient`, `ImageryCatalog`).
- Architectural changes need an ADR in `docs/adr/NNNN-title.md`.
- Commits use Conventional Commits (`feat(places): ...`). Use one branch per task, `agent/<task-id>-<slug>`, and one PR per task.

## 6. Before you open a PR
- [ ] Only your owned paths changed (`git diff --name-only origin/main`).
- [ ] Lint, typecheck and tests pass for the affected packages.
- [ ] No secrets. `.env.example` has names only.
- [ ] Any new data source, font or icon set is added to `docs/DATA_SOURCES.md` with its license.
- [ ] The package README is updated: what the package provides, which ports it provides or consumes, and which env vars it needs.
