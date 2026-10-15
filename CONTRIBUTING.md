# Contributing to Iraq Smart Maps

Thank you for contributing. This document is the authoritative guide for the codebase conventions. Read `CLAUDE.md` first — it contains hard rules that override anything here.

---

## Table of contents

1. [Repository structure](#repository-structure)
2. [Milestone model](#milestone-model)
3. [Branch and commit conventions](#branch-and-commit-conventions)
4. [Code conventions](#code-conventions)
5. [Testing](#testing)
6. [Module boundaries](#module-boundaries)
7. [Secrets and security](#secrets-and-security)
8. [Internationalisation (i18n)](#internationalisation-i18n)
9. [Data sourcing](#data-sourcing)
10. [Pull requests and review](#pull-requests-and-review)
11. [Closure gate](#closure-gate)

---

## Repository structure

```
apps/mobile      Expo shell — tabs, auth gate, dev settings
apps/api         NestJS composition root — wires modules
apps/admin       Admin panel — moderation and ops
mobile-features/ @iraq-maps/feature-<x> — one package per mobile feature
modules/         Backend domain modules (NestJS modules)
packages/        Shared libraries (contracts, config, ui, i18n, …)
adapters/        External service adapters (@iraq-maps/adapter-<x>)
geo-services/    OSM pipeline, tile generation, routing, geocoding
e2e/             API e2e and Maestro mobile harness
infra/           Docker Compose for local dev
docs/            Architecture, ADRs, milestones, MVP, data sources
tools/           Build and ownership tooling
```

Each `mobile-features/` package exports from `src/index.ts` only. Features never import each other.

---

## Milestone model

Work is organised into milestones (`docs/milestones/Mx-*.md`). Each milestone:

- Delivers complete, working, user-visible features end to end.
- Runs parallel builder agents on disjoint paths.
- Closes only when `pnpm gate` and the Android build pass on the same commit.

Before touching a file, check its owning milestone's front-matter (`owned_paths` YAML). Run `pnpm ownership:check` before pushing.

If you need to change a shared path (`packages/contracts`, `apps/api/src`, root configs), file a request in `docs/contract-requests/Mx-<your-slug>.md`. Do not edit shared paths yourself.

---

## Branch and commit conventions

### Branches

All work goes to the session's designated branch. Branch names follow:

```
<type>/<scope>-<short-description>
```

Examples: `feat/discover-polls`, `fix/otp-rate-limit`.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <imperative short description>

<optional body — why, not what>
```

Types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`, `perf`, `ci`.

Scope matches the affected package name without the `@iraq-maps/` prefix, e.g. `places`, `feature-discover`, `contracts`.

**Attribution lines** (required for agent commits):

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_<id>
```

### No force-push to `main`

`main` is protected. All changes go through a PR.

---

## Code conventions

### TypeScript

- `strict: true` everywhere. No `any` without a comment explaining why.
- Validate all external input (API request bodies, env vars, event payloads) with **zod schemas** from `packages/contracts`.
- Export only from `src/index.ts`. Do not export internal implementation details.
- No barrel re-exports that defeat tree-shaking.

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | `kebab-case.ts` | `otp-sender.ts` |
| Classes / types / interfaces | `PascalCase` | `OtpSender` |
| Variables / functions | `camelCase` | `sendOtp` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_OTP_ATTEMPTS` |
| React components | `PascalCase` | `PlaceCard` |
| Route files | Expo Router convention | `app/(tabs)/map.tsx` |

### React Native

- All UI strings go through `@iraq-maps/i18n`. No hardcoded Arabic, Kurdish, or English text.
- Use `@iraq-maps/ui` primitives. Do not create one-off styled components for things the design system covers.
- Layouts must work in RTL. Test with the device language set to Arabic.
- Prefer `FlatList` / `FlashList` over `ScrollView` for lists with more than ~10 items.
- Skeleton loaders are required for any screen that fetches data before rendering.

### NestJS (backend)

- Each module (`modules/<x>`) owns its own Postgres schema. No joins across schemas.
- Inter-module communication goes through ports defined in `packages/contracts`.
- Events are versioned (`<module>.<entity>.<verb>.v1`) and published via the transactional outbox.
- Controllers validate request bodies with the zod schemas from `packages/contracts` via ts-rest.

---

## Testing

### Unit tests (Vitest / jest-expo)

- Every new function or hook needs a test.
- Tests for backend modules run against local PostGIS and Redis — no Testcontainers.
- The `packages/testing` package provides in-memory fakes for all ports. Use the fakes in unit tests; the real adapters are exercised in e2e tests.
- Run: `pnpm turbo run test --filter=@iraq-maps/<package>`

### Conformance suites

Every port has a conformance suite in `packages/testing`. When you add a new port implementation (real or fake), add it to the conformance suite's test matrix.

### E2e tests

- API e2e tests live in `e2e/` and use `createApp` to spin up the full NestJS app.
- Mobile e2e tests are Maestro flows in `mobile-features/<x>/maestro/`.

### Coverage

The gate does not enforce a coverage percentage, but a PR that removes tests without a good reason will be rejected.

---

## Module boundaries

`dependency-cruiser` enforces these rules. `pnpm depcruise` must pass.

| Rule | Enforcement |
|------|------------|
| `modules/X` may not import from `modules/Y` | hard error |
| `apps/mobile` may not import from `modules/*` | hard error |
| `mobile-features/X` may not import from `mobile-features/Y` | hard error |
| Cross-module calls go through `packages/contracts` ports | hard error |
| Each module touches only its own DB schema | convention + code review |

When you need something from another module, define a port in `packages/contracts` and implement it in the source module. File a contract-request if the interface does not exist yet.

---

## Secrets and security

**This repository is public. A leaked secret must be rotated immediately.**

- Never put a key, token, password, keystore, or service-account JSON into any tracked file.
- Read secrets from environment variables only, through `packages/config`.
- Add new variables to `.env.example` with an empty value and a one-line comment.
- `EXPO_PUBLIC_*` variables are embedded in the app binary and are public. Never put a secret there.
- `pnpm gitleaks` runs in the gate. Fix any finding before pushing.

---

## Internationalisation (i18n)

- The product language is **Arabic first** (`ar`), then Kurdish Sorani (`ckb`), then English (`en`).
- Every user-facing string lives in `src/i18n/{ar,ckb,en}.json` inside its feature package, namespaced to that feature.
- Use `t('key')` from `@iraq-maps/i18n`. The `strings.test.ts` in each feature package checks that all three locales have the same keys and placeholders. That test must pass.
- Arabic text normalisation (removing tashkeel, normalising alef variants) is handled by the shared normaliser in `packages/i18n/src/normalize`. Do not reimplement it.
- Do not hard-code date, number, or currency formats. Use `formatDate`, `formatNumber`, `formatCurrency` from `@iraq-maps/i18n`.

---

## Data sourcing

- Use only sources listed in `docs/DATA_SOURCES.md` with a commercially compatible licence.
- Never use `tile.openstreetmap.org`, Esri, Google, Bing, or Mapbox tiles or imagery.
- Keep provider-owned data in separate tables from OSM-derived data (ODbL requirement).
- OSM attribution must be visible on every map view at all times.
- When adding a new data source, add it to `docs/DATA_SOURCES.md` (name, URL, licence, what it provides) before writing any code that uses it.

---

## Pull requests and review

1. **One milestone or one focused fix per PR.** Do not bundle unrelated changes.
2. Fill in the PR template: summary, test plan, screenshots (for UI changes), milestone reference.
3. Run `pnpm ownership:check` locally; the CI gate will reject a diff that touches paths outside the milestone's `owned_paths`.
4. At least one review approval is required before merging.
5. Resolve all comments before merging — don't mark as resolved unilaterally.

---

## Closure gate

A milestone closes only when all of the following pass on the same commit:

```bash
pnpm gate          # lint + typecheck + test + boundary + secrets + dead code + duplication
```

and the Android build succeeds in GitHub Actions (`android.yml`).

`pnpm gate` runs these checks in order:

| Step | Tool |
|------|------|
| Lint | ESLint |
| Type check | `tsc --noEmit` |
| Unit tests | Vitest + jest-expo |
| Module boundaries | dependency-cruiser |
| Secret scan | gitleaks |
| Dead code | knip |
| Duplication | jscpd |
| Ownership | `tools/ownership` |

Fix every failure before asking for review. Do not open a PR that fails the gate.
