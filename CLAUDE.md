# CLAUDE.md — instructions for every agent working in this repo

Iraq Smart Maps: an OpenStreetMap-based map app for Iraq (Android first, iOS later), with an AI travel and business assistant, a messaging engine that contacts businesses, provider (business) registration, and a social "Discover" feed. The MVP covers one city (see `docs/MVP.md`).

Read these before you change anything:
- `docs/ARCHITECTURE.md`: stack, module boundaries, contracts. It is binding.
- `docs/milestones/README.md`: the execution rulebook and the milestone index. Your current milestone file (`docs/milestones/Mx-*.md`) says which paths you own.
- `docs/MVP.md`: what is in and out of scope.
- `docs/milestones/MOCKS.md`: which external services are currently mocked.

The product language is Arabic. User-facing text is Arabic first, then Kurdish Sorani (`ckb`), then English. Code, identifiers, commit messages and code comments are in English.

---

## 1. Hard rules (never break)

1. **No secrets in the repo. It is PUBLIC.**
   - Never write an API key, token, password, private URL with credentials, keystore, or service-account JSON into any tracked file. That includes tests, fixtures, docs, examples and commit messages.
   - Read secrets only from environment variables, through `packages/config`. Add a new variable to `.env.example` with **an empty value** and a comment.
   - Anything prefixed `EXPO_PUBLIC_` ships inside the app binary, so it is public. Never put a secret there. The mobile app must reach paid or keyed services through our backend.
   - If you find a leaked secret, stop. Report it so the key gets rotated. Deleting the commit does not help in a public repo.
2. **Stay inside your owned paths**, as listed in the current milestone file and `tools/ownership/milestones/Mx.json`. If you need a change in a shared path (`packages/contracts`, `apps/api/src`, the mobile shell, root configs), write a request in `docs/contract-requests/<task-id>.md`. Do not edit those paths yourself.
3. **Module boundaries:** `modules/X` may import only from `packages/*`, never from `modules/Y`. Cross-module calls go through ports in `packages/contracts`. Each module owns its own Postgres schema, and joins across schemas are not allowed. `apps/mobile` never imports from `modules/*`.
4. **Data licensing:** use only sources listed in `docs/DATA_SOURCES.md` with a commercial-compatible license. Never use `tile.openstreetmap.org`, Esri, Google, Bing or Mapbox imagery or tiles. Keep provider-owned data in separate tables from OSM-derived data (ODbL). Show OSM attribution at all times.
5. **No invented data:** prices and crowding always carry `source`, `observedAt` and `confidence` (`Estimate<T>`). The AI assistant may only mention places, prices or crowding that came from a tool result.
6. **Consent first:** never show, message, or link a provider's phone, photos or social pages unless the matching consent scope is active. Never send a message on the user's behalf without explicit confirmation.

## 2. Execution model (binding)

1. **Milestones, not scattered tasks.** The work is split into milestones M0–M7 (`docs/milestones/`). Each milestone ships complete, working, user-visible features end to end, in about 2–4 hours of continuous work.
2. **Line count is never a target.** Deliver complete features with the least clean code possible. No padding, no duplication, no speculative abstractions. knip and jscpd run in the gate.
3. **Parallel builders on disjoint packages.** Each milestone runs several builder agents in parallel. Each builder owns a separate workspace package or path set that nobody else touches, and follows the interfaces in `packages/contracts`.
   - Contracts are frozen by the integrator at milestone start.
   - Builders never edit contracts. They file a gap in `docs/contract-requests/`.
4. **Independent auditors.** Auditors did not write the milestone's code. They review, run the tests and try the build. A finding goes back to the builder that owns the file, who fixes it in place, and then it is re-audited. After at most 3 rounds, the lead decides.
5. **Closure gate.** A milestone closes only when all of these pass on the same commit:
   - `pnpm gate` (all tests, lint, typecheck, boundaries, secrets, dead code, duplication)
   - the Android build in GitHub Actions (`android.yml`)
   - approval from every assigned auditor
   Then commit and push, record the SHA in the milestone file, and move to the next milestone.
6. **One file per milestone.** `docs/milestones/Mx-<slug>.md` records the features, acceptance criteria, agent allocation and what was completed.

Branch and secrets policy:
- All work is pushed only to the session's designated branch. There are no extra branches, tags or releases.
- Builders and auditors do not commit; the integrator/lead commits.
- Anything that needs an external key or account gets a fake or mock driver, recorded in `docs/milestones/MOCKS.md`. The real adapter is enabled only by env vars.

## 3. Stack (summary)

TypeScript everywhere · pnpm workspaces + Turborepo · React Native + Expo (Expo Router) + MapLibre Native · NestJS (Fastify) · zod + ts-rest contracts · PostgreSQL + PostGIS + pg_trgm via Drizzle · Redis + BullMQ with transactional outbox · Valhalla (routing) · Photon (geocoding) · Planetiler → PMTiles · S3-compatible storage · Claude API (server-side only, model from `ASSISTANT_MODEL`) · Vitest, Testcontainers, Jest/RNTL, Maestro · ESLint, dependency-cruiser, gitleaks.

## 4. Layout

```
apps/mobile      Expo app shell. app/** holds one-line route re-exports; src/shell/ holds layout, tabs, auth gate, dev settings
mobile-features/ one workspace package per feature (@iraq-maps/feature-<x>): map, navigation, account, provider,
                 messages, assistant, discover, activity, tour3d*. Features never import each other.
adapters/        one package per external service (@iraq-maps/adapter-<x>), e.g. llm-anthropic, whatsapp-cloud
apps/api         NestJS composition root. It only wires modules together.
apps/admin       moderation/verification web panel
modules/*        backend domain modules (identity, providers, places, routing, geocoding,
                 insights, assistant, messaging, discover, media, activity, notifications, tour3d*)
packages/*       contracts, config, db-kit, observability, testing, i18n, geo, ui, mobile-kit, map-kit,
                 api-client, tooling
tools/ownership  checks that a diff stays inside its owner's globs (tools/ownership/milestones/Mx.json)
e2e/             API e2e (createApp) and mobile Maestro harness
geo-services/*   OSM pipeline, tiles, routing, geocoder, imagery (data, not app code)
infra/           docker-compose for local dev; deployment later
docs/            architecture, ADRs, tasks, MVP, data sources
```
`*` marks a module that is reserved for a later phase. It holds contracts only.

## 5. Commands
```
pnpm install
pnpm infra:local up                        # local PostgreSQL 16 + PostGIS and Redis (no Docker here)
pnpm gate                                  # the full closure gate
pnpm android:precheck                      # expo prebuild/export without the Android SDK
pnpm ownership:check                       # diff stays within owned globs
pnpm turbo run lint typecheck test         # everything
pnpm turbo run test --filter=@iraq-maps/places   # one package
pnpm turbo run lint typecheck test --filter=...[origin/main]   # only what changed
pnpm gitleaks                              # secret scan
pnpm depcruise                             # boundary check
```

## 6. Conventions
- Package names are `@iraq-maps/<name>`. Each package exports only from `src/index.ts`.
- Validate every external input with zod schemas from `packages/contracts`.
- Every port has an in-memory fake and a conformance suite in `packages/testing`. The real implementation and the fake must both pass it.
- Database migrations live per module in `modules/<x>/migrations/` and touch only that module's schema. Tests run on local PostGIS (no Testcontainers).
- Events are versioned (`<module>.<entity>.<verb>.v1`) and published through the outbox, never inline.
- All UI strings go through `packages/i18n`. No hardcoded text. Layouts must work in RTL.
- Arabic search goes through the shared normalizer in `packages/i18n/src/normalize`.
- External services sit behind interfaces (`OtpSender`, `MessagingChannel`, `LlmClient`, `ObjectStorage`, `PushSender`, `RoutingEngine`, `GeocoderClient`, `ImageryCatalog`).
- Architectural changes need an ADR in `docs/adr/NNNN-title.md`.
- Commits use Conventional Commits (`feat(places): ...`).

## 7. Before you hand off work
- [ ] Only your owned paths changed (`pnpm ownership:check`).
- [ ] Lint, typecheck and tests pass for the affected packages.
- [ ] No secrets. `.env.example` has names only.
- [ ] Any new data source, font or icon set is added to `docs/DATA_SOURCES.md` with its license.
- [ ] The package README is updated: what the package provides, which ports it provides or consumes, and which env vars it needs.
