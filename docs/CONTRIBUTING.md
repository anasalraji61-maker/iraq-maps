# Contributing to Iraq Smart Maps

Iraq Smart Maps is built on a strict milestone model with autonomous builder agents and independent auditors. This guide covers everything you need to contribute — from setting up your local environment to the PR process and the hard rules that protect the codebase.

Read `CLAUDE.md` first. It is binding. This guide expands on the practical how-to.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Environment Setup](#local-environment-setup)
3. [Project Layout](#project-layout)
4. [Running the Stack](#running-the-stack)
5. [Running Tests](#running-tests)
6. [Code Style](#code-style)
7. [TypeScript Rules](#typescript-rules)
8. [Zod Validation Requirements](#zod-validation-requirements)
9. [i18n Requirements (all 3 languages)](#i18n-requirements)
10. [RTL Requirements](#rtl-requirements)
11. [Module Boundary Rules](#module-boundary-rules)
12. [How to Add a New Backend Module](#how-to-add-a-new-backend-module)
13. [How to Add a New Mobile Feature](#how-to-add-a-new-mobile-feature)
14. [Database Migration Rules](#database-migration-rules)
15. [Event System](#event-system)
16. [Secrets Policy](#secrets-policy)
17. [PR Process](#pr-process)
18. [Closure Gate](#closure-gate)

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20 LTS | Use `.nvmrc` if present |
| pnpm | 9.x | `npm i -g pnpm` |
| Docker | 24+ | For local PostGIS + Redis via docker-compose |
| Android Studio | Latest | Only for running the Android emulator |
| Java | 17 (JDK) | Required by Expo prebuild |
| git | 2.40+ | |

Optional but recommended:
- `gitleaks` — secret scanning (`brew install gitleaks` / `apt install gitleaks`)
- `jq` — JSON inspection of API responses
- VSCode with the ESLint and Prettier extensions

---

## Local Environment Setup

```bash
# 1. Clone
git clone https://github.com/iraq-maps/iraq-maps.git
cd iraq-maps

# 2. Install dependencies (all workspaces)
pnpm install

# 3. Copy environment file
cp .env.example .env
# Edit .env — set real values for the variables your work needs.
# Never commit .env.

# 4. Start local services (PostgreSQL 16 + PostGIS + Redis)
pnpm infra:local up
# This reads infra/docker-compose.yml. The Postgres DB is `iraq_maps_dev`.

# 5. Run database migrations
pnpm db:migrate

# 6. Seed test data (optional, for development)
pnpm db:seed

# 7. Verify the setup
pnpm gate   # should pass on a clean checkout
```

### Checking Your Setup

```bash
# Type-check all packages
pnpm turbo run typecheck

# Lint all packages
pnpm turbo run lint

# Run all tests
pnpm turbo run test

# Run the API in dev mode
pnpm --filter @iraq-maps/api dev

# Check module boundaries
pnpm depcruise

# Scan for secrets
pnpm gitleaks

# Check ownership (only your paths changed)
pnpm ownership:check
```

---

## Project Layout

```
apps/
  api/          NestJS composition root — wires modules together only
  mobile/       Expo app shell — route re-exports and layout
  admin/        Moderation/verification web panel

mobile-features/
  map/          @iraq-maps/feature-map
  navigation/   @iraq-maps/feature-navigation
  assistant/    @iraq-maps/feature-assistant
  messages/     @iraq-maps/feature-messages
  discover/     @iraq-maps/feature-discover
  account/      @iraq-maps/feature-account
  provider/     @iraq-maps/feature-provider
  activity/     @iraq-maps/feature-activity
  tour3d/       @iraq-maps/feature-tour3d (reserved)

adapters/
  llm-anthropic/    @iraq-maps/adapter-llm-anthropic
  whatsapp-cloud/   @iraq-maps/adapter-whatsapp-cloud

modules/
  identity/     Auth: OTP, JWT, sessions
  places/       Places, search, tiles, cities
  routing/      Valhalla wrapper, route calculation
  geocoding/    Photon wrapper
  providers/    Provider registration, consents, verification
  media/        Asset upload/storage
  messaging/    Inquiry creation, delivery, status
  notifications/ Push notifications, device registry
  assistant/    Claude API wrapper, session management
  insights/     Crowding and price estimates
  discover/     Social feed, posts, comments
  reviews/      Place reviews and ratings
  incidents/    Traffic incident reporting
  payments/     Wallet, payment intents
  listings/     Marketplace listings
  reputation/   Provider reputation scores
  activity/     User activity aggregation
  tour3d/       3D scenes (stub — reserved)

packages/
  contracts/    Zod schemas + ts-rest contracts (frozen per milestone)
  config/       Environment variable access (the ONLY place to read env vars)
  db-kit/       Drizzle ORM helpers, migrations runner
  observability/ OpenTelemetry traces + metrics
  testing/      Port fakes, conformance suites, test helpers
  i18n/         Translation loader, Arabic normaliser, numeral formatter
  geo/           Coordinate utilities, bbox helpers
  ui/            Shared RN component library
  mobile-kit/   RN-specific hooks: offline queue, push, storage
  map-kit/      MapLibre Native helpers: MapCanvas, useMapRef
  api-client/   ts-rest fetch client for mobile
  tooling/      ESLint config, tsconfig bases

geo-services/
  tiles/        OSM → Planetiler → PMTiles pipeline
  routing/      Valhalla docker setup
  geocoder/     Photon docker setup

infra/
  docker-compose.yml   Local dev: PostGIS, Redis, Photon, Valhalla

docs/           Architecture, ADRs, milestones, task tracking
tools/          ownership checker, gate scripts
e2e/            API e2e (createApp) + Maestro mobile flows
```

---

## Running the Stack

### API only

```bash
pnpm --filter @iraq-maps/api dev
# Listens on http://localhost:3000
```

### Mobile only (Metro bundler)

```bash
pnpm --filter @iraq-maps/mobile start
# Then press A for Android emulator, I for iOS simulator
```

### Full stack

```bash
pnpm infra:local up    # services
pnpm turbo run dev     # API + mobile in parallel
```

### Android build check (no Android SDK needed)

```bash
pnpm android:precheck
# Runs expo prebuild + expo export --platform android
# Used in CI to catch build errors without the full Android SDK
```

---

## Running Tests

```bash
# All packages
pnpm turbo run test

# One package
pnpm turbo run test --filter=@iraq-maps/places

# Only changed packages (compared to origin/main)
pnpm turbo run lint typecheck test --filter=...[origin/main]

# Watch mode for one package
cd modules/places && pnpm test --watch
```

### Test Requirements

- **Backend tests** use Vitest with local PostGIS (no Testcontainers). Run `pnpm infra:local up` first.
- **Mobile tests** use Jest + React Native Testing Library (RNTL).
- **Mobile E2E** use Maestro (`maestro test <flow>.yaml`).
- **Conformance tests** for every port fake live in `packages/testing`. Both the real implementation and the in-memory fake must pass the conformance suite.

Every port must have an in-memory fake:

```typescript
// packages/testing/src/fakes/FakeOtpSender.ts
export class FakeOtpSender implements OtpSender {
  sent: Array<{ phone: string; code: string }> = [];
  async send(phone: string, code: string) {
    this.sent.push({ phone, code });
  }
}
```

---

## Code Style

The project uses ESLint (flat config) and TypeScript strict mode. Prettier is not used — ESLint handles formatting rules that matter.

Run lint before committing:

```bash
pnpm turbo run lint --filter=...[origin/main]
```

### Key Rules

- **No `any`**: use `unknown` and narrow with zod or type guards.
- **No `!` (non-null assertion)**: prove non-nullness with a guard or throw.
- **No inline `console.log`**: use the logger from `packages/observability`.
- **No hardcoded strings in UI**: all user-facing text goes through `packages/i18n`.
- **No `left`/`right` in styles**: use `start`/`end` or logical properties.
- **No secret in code**: see [Secrets Policy](#secrets-policy).
- **Conventional Commits** for all commit messages: `feat(places): add nearby search`.

### File Naming

| Context | Convention | Example |
|---------|-----------|---------|
| TypeScript source | camelCase | `placeSearch.service.ts` |
| React components | PascalCase | `PlaceCard.tsx` |
| Test files | same as source + `.test.ts` | `placeSearch.service.test.ts` |
| i18n files | `<locale>.json` | `ar.json`, `ckb.json`, `en.json` |
| Migration files | `NNNN_description.sql` | `0001_create_places.sql` |

### Import Order (enforced by ESLint)

1. Node built-ins
2. External packages
3. Internal workspace packages (`@iraq-maps/*`)
4. Relative imports

---

## TypeScript Rules

The project uses `"strict": true` plus these additional flags in all `tsconfig.json` files:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true
}
```

### Branded Types

All IDs are branded to prevent accidental substitution:

```typescript
export const UserId = z.string().uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserId>;

// ✅ Correct: pass a UserId where UserId is expected
const userId: UserId = UserId.parse(rawString);

// ❌ Wrong: TypeScript catches this
const userId: UserId = someOtherUuidString;
```

Never construct a branded ID directly — always parse it through the zod schema:

```typescript
// ✅ Parse from external input
const id = UserId.parse(req.params.userId);

// ✅ Cast only when you know the source is trusted (e.g., from the DB row)
const id = row.userId as UserId;

// ❌ Never cast from a free string
const id = "some-string" as UserId;
```

### Generic Utilities

Use `paginated<T>()` and `estimate<T>()` from `packages/contracts`:

```typescript
// paginated
const UserList = paginated(User);
type UserList = z.infer<typeof UserList>;
// → { items: User[]; nextCursor: string | null }

// estimate (crowding, price level)
const CrowdingEstimate = estimate(CrowdingLevel);
// → { value: CrowdingLevel; source: EstimateSource; observedAt: string; confidence: number }
```

---

## Zod Validation Requirements

**Every external input must be validated with a zod schema from `packages/contracts` before use.**

This includes:
- HTTP request bodies and query params (ts-rest handles this automatically)
- WebSocket messages
- Database rows that transit module boundaries
- Environment variables (via `packages/config`)
- Event payloads from the outbox

```typescript
// ✅ Correct: validate request body via ts-rest contract
// ts-rest validates automatically when you use the contract router

// ✅ Correct: validate a database row
const place = PlaceSummary.parse(dbRow);

// ❌ Wrong: cast without validation
const place = dbRow as PlaceSummary;
```

### Adding a New Zod Schema

1. Add the schema to the appropriate file in `packages/contracts/src/`.
2. Export from `packages/contracts/src/index.ts`.
3. Write at least one test for the schema in `*.test.ts` (valid input, invalid input, edge cases).
4. Document the type with a JSDoc comment and the milestone that introduced it.

```typescript
/** The thing a user can do with a place.
 * @public frozen contract (M99) */
export const PlaceAction = z.object({
  placeId: PlaceId,
  action: z.enum(['like', 'save', 'share']),
  at: z.string().datetime(),
});
export type PlaceAction = z.infer<typeof PlaceAction>;
```

---

## i18n Requirements

**All user-facing text goes through `packages/i18n`. No hardcoded strings.**

### Adding Translations

Every new string needs entries in all three locale files:

```
packages/i18n/src/locales/ar.json    (Arabic — required)
packages/i18n/src/locales/ckb.json   (Kurdish Sorani — required)
packages/i18n/src/locales/en.json    (English — required)
```

Feature packages have their own namespaced locale files:

```
mobile-features/navigation/src/i18n/ar.json
mobile-features/navigation/src/i18n/ckb.json
mobile-features/navigation/src/i18n/en.json
```

Namespace is the package name without the `@iraq-maps/feature-` prefix: e.g., `feature-navigation`.

### Usage in React Native

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('feature-navigation');
  return <Text>{t('maneuver.turn_right', { street: 'شارع فلسطين' })}</Text>;
}
```

### Key Naming Convention

```
<section>.<sub-section>.<key>
```

Examples:
- `maneuver.turn_right` — navigation turn instruction
- `compose.placeholder` — message compose input placeholder
- `error.no_route` — navigation error message
- `provider.status.verified` — provider status label
- `discover.post_type.photo` — post type label

### Pluralisation

Use i18next plural forms:

```json
{
  "review_count": "{{count}} تقييم",
  "review_count_plural": "{{count}} تقييمات"
}
```

### Missing Keys

A missing translation key falls back: `ckb` → `ar` → `en`. Never let the English key itself appear in Arabic UI. If a Kurdish translation is not yet available, provide the Arabic text as the `ckb` value temporarily and file a task.

---

## RTL Requirements

All layouts must work correctly in RTL (Arabic, Kurdish Sorani) and LTR (English).

### Use Logical Properties

```typescript
// ✅ Correct — works in both RTL and LTR
const styles = StyleSheet.create({
  container: {
    paddingStart: 16,
    paddingEnd: 8,
    borderStartWidth: 2,
  },
});

// ❌ Wrong — breaks in RTL
const styles = StyleSheet.create({
  container: {
    paddingLeft: 16,
    paddingRight: 8,
    borderLeftWidth: 2,
  },
});
```

### Text Alignment

```typescript
// ✅ Correct
{ textAlign: 'right' }    // for RTL locales (Arabic/Kurdish)
{ textAlign: 'left' }     // for LTR locales (English)

// ✅ Better: use the locale-aware helper
import { useTextAlign } from '@iraq-maps/i18n';
const { align } = useTextAlign();  // returns 'right' in RTL, 'left' in LTR
```

### Mixed-Direction Content

When embedding numbers or URLs in Arabic text, wrap them in a `<Text>` with explicit direction:

```tsx
<Text>
  {t('price', { price: <Text style={{ writingDirection: 'ltr' }}>١٥٬٠٠٠</Text> })}
</Text>
```

### Animation Direction

- Screen transitions (push/pop): Expo Router handles RTL reversal automatically.
- Custom slide animations: use `translateX` with a sign flip based on `I18nManager.isRTL`.
- Bottom sheets: always slide from bottom; direction is irrelevant.

### Icon Mirroring

Icons that convey direction (arrows, chevrons, back button) must be mirrored in RTL:

```typescript
const isRTL = I18nManager.isRTL;
<ArrowIcon style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
```

Icons that do not convey direction (star, heart, camera) must not be mirrored.

### Testing RTL

```bash
# Run the app in Arabic locale to test RTL
EXPO_PUBLIC_DEFAULT_LOCALE=ar pnpm --filter @iraq-maps/mobile start
```

Check every new screen in RTL before submitting.

---

## Module Boundary Rules

Enforced by `dependency-cruiser`. Violations fail `pnpm gate`.

### Backend

```
modules/X → packages/*       ✅ Allowed
modules/X → modules/Y        ❌ Forbidden — use a port in packages/contracts
modules/X → apps/api         ❌ Forbidden
apps/api  → modules/*        ✅ Allowed (wiring only)
apps/api  → packages/*       ✅ Allowed
packages/* → packages/*      ✅ Allowed (no circular dependencies)
```

### Mobile

```
mobile-features/X → packages/*       ✅ Allowed
mobile-features/X → mobile-features/Y ❌ Forbidden — use Expo Router params
mobile-features/X → modules/*         ❌ Forbidden — server-side code
mobile-features/X → adapters/*        ❌ Forbidden
apps/mobile → mobile-features/*       ✅ Allowed (imports screens for routing)
apps/mobile → modules/*               ❌ Forbidden
```

### Database Schemas

Each module owns a separate PostgreSQL schema (e.g., `places.`, `messaging.`). Cross-schema joins in SQL are forbidden — query within your schema only and compose data at the application layer through ports.

---

## How to Add a New Backend Module

1. **Check the milestone file** — ensure this module is within your owned paths.

2. **Create the package:**

```bash
mkdir -p modules/my-module/src modules/my-module/migrations
cat > modules/my-module/package.json << 'EOF'
{
  "name": "@iraq-maps/my-module",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  }
}
EOF
```

3. **Define a NestJS module** in `src/my-module.module.ts`.

4. **Add ports in `packages/contracts/src/`** if the module exposes cross-module interfaces. File a `docs/contract-requests/` if a contract owned by another module needs changing.

5. **Create the DB schema** in `modules/my-module/migrations/0001_init.sql`:

```sql
CREATE SCHEMA IF NOT EXISTS my_module;

CREATE TABLE my_module.things (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

6. **Create an in-memory fake** in `packages/testing/src/fakes/` for every port interface the module exposes, plus the conformance suite in `packages/testing/src/conformance/`.

7. **Wire the module** in `apps/api/src/app.module.ts`. This is the only place that imports from modules directly.

8. **Write tests** covering all happy paths and error cases.

9. **Update `docs/ARCHITECTURE.md`** with the new module's ports and responsibilities.

10. **Update the module's `README.md`** — what it provides, which ports it exposes, which env vars it needs.

---

## How to Add a New Mobile Feature

1. **Check the milestone file** — ensure this feature is within your owned paths.

2. **Create the package:**

```bash
mkdir -p mobile-features/my-feature/src mobile-features/my-feature/test
cat > mobile-features/my-feature/package.json << 'EOF'
{
  "name": "@iraq-maps/feature-my-feature",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "test": "jest",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  }
}
EOF
```

3. **Create i18n files:**

```bash
mkdir -p mobile-features/my-feature/src/i18n
touch mobile-features/my-feature/src/i18n/ar.json
touch mobile-features/my-feature/src/i18n/ckb.json
touch mobile-features/my-feature/src/i18n/en.json
```

4. **Export screens from `src/index.ts`:**

```typescript
export { MyFeatureScreen } from './screens/MyFeatureScreen';
export { MyDetailScreen } from './screens/MyDetailScreen';
```

5. **Add routes in `apps/mobile/app/`** as thin one-line re-exports:

```typescript
// apps/mobile/app/my-feature/index.tsx
export { MyFeatureScreen as default } from '@iraq-maps/feature-my-feature';
```

6. **Add the tab** (if this is a new tab) to `apps/mobile/src/shell/TabBar.tsx` and to `apps/mobile/app/(tabs)/_layout.tsx`.

7. **Register i18n namespace** in `packages/i18n/src/config.ts`.

8. **Write tests** with RNTL and optionally a Maestro E2E flow.

9. **Write a `README.md`** covering: what the feature does, screens list, ports consumed, env vars.

---

## Database Migration Rules

- Migrations live in `modules/<x>/migrations/` and must only touch that module's schema.
- Name files with a 4-digit prefix: `0001_init.sql`, `0002_add_index.sql`.
- Migrations are append-only. Never edit a committed migration — add a new one.
- Backward-compatible changes only during a milestone (drop columns / rename in a later migration after the code is deployed).
- Every migration must be reversible: provide a corresponding `down` script or document how to revert manually.
- Run migrations: `pnpm db:migrate`.
- Test migrations: `pnpm db:migrate && pnpm turbo run test --filter=@iraq-maps/<module>`.

---

## Event System

Events cross module boundaries through the transactional outbox — never via direct function calls.

### Event Naming

```
<module>.<entity>.<verb>.v<version>
```

Examples:
- `messaging.inquiry.status_changed.v1`
- `providers.provider.verified.v1`
- `discover.post.created.v1`
- `notifications.notification.sent.v1`

### Publishing an Event

```typescript
import { OutboxPort } from '@iraq-maps/contracts';

// In a service method, within the same DB transaction as the state change:
await this.outbox.publish({
  event: 'messaging.inquiry.status_changed.v1',
  payload: {
    inquiryId,
    placeId,
    status: 'delivered',
    at: new Date().toISOString(),
  },
});
```

### Subscribing to an Event

```typescript
// In a NestJS module, register via the EventBus port
@OnEvent('messaging.inquiry.status_changed.v1')
async handleStatusChanged(payload: InquiryStatusChangedPayload) {
  // ...
}
```

### Versioning

When an event shape changes in a breaking way:
1. Publish the new version alongside the old: `*.v2`.
2. Keep publishing `*.v1` until all consumers migrate.
3. Remove `*.v1` in a later milestone.

---

## Secrets Policy

**The repo is public.** A leaked secret is a production incident. Do not commit secrets under any circumstances.

### Rules

- All secrets live in environment variables, accessed through `packages/config` only.
- Add every new variable to `.env.example` with an empty value and a comment.
- Never put a secret in `EXPO_PUBLIC_*` vars — these ship in the app binary and are public.
- The mobile app must reach paid/keyed services through the API backend.
- Scan before pushing: `pnpm gitleaks`.

### If You Find a Leaked Secret

1. **Stop immediately.** Do not commit, push, or share.
2. Report to the lead so the key can be rotated before any push.
3. Deleting the commit does not help if it was ever pushed to GitHub.

### Environment Variable Template

```bash
# .env.example — commit this, never commit .env

# Database
DATABASE_URL=

# Redis
REDIS_URL=

# Object storage
S3_ENDPOINT=
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Claude API (server-side only)
ANTHROPIC_API_KEY=
ASSISTANT_MODEL=

# WhatsApp Cloud API
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# FCM
FCM_SERVICE_ACCOUNT_JSON=

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
```

---

## PR Process

### Branch Naming

```
feat/<milestone>-<slug>     e.g. feat/m5-assistant-chat
fix/<issue>-<slug>          e.g. fix/m4-idempotency-key-409
chore/<slug>                e.g. chore/update-deps
```

All work is pushed to the session's designated branch per the milestone execution model. Builders and auditors do not open PRs directly — the integrator/lead does.

### Before Opening a PR

Run the full gate locally:

```bash
pnpm gate
```

This runs: lint, typecheck, tests, boundary check (`depcruise`), secret scan (`gitleaks`), dead code (`knip`), duplication (`jscpd`), and ownership check.

If any step fails, fix it before pushing.

### PR Description Template

```markdown
## Summary

What this PR does in 2–3 sentences.

## Milestone

Closes M<N> (or part of M<N>).

## Testing

- [ ] Unit tests added/updated for affected packages
- [ ] Integration tests pass (`pnpm gate`)
- [ ] RTL layout verified in Arabic locale
- [ ] No hardcoded strings (all text uses i18n)
- [ ] No secrets in code (`pnpm gitleaks` passes)
- [ ] Ownership check passes (`pnpm ownership:check`)

## Breaking Changes

None / list them.
```

### Review Process

1. Auditor (not the builder) reviews the code and runs `pnpm gate` independently.
2. Finding → builder fixes → re-audited. Maximum 3 rounds.
3. After 3 rounds, the lead decides.
4. All auditors approve → integrator commits and pushes.

### Commit Message Format

```
feat(places): add nearby search endpoint

Add POST /v1/places/nearby with radiusM and category filters.
Uses PostGIS ST_DWithin for spatial filtering.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

---

## Closure Gate

A milestone closes only when **all** of the following pass on the **same commit**:

```bash
pnpm gate                    # lint + typecheck + test + boundaries + secrets + dead code + duplication
pnpm android:precheck        # expo prebuild + export (CI equivalent)
pnpm ownership:check         # diff stays within owned globs
```

And:
- Approval from every assigned auditor.
- The Android build passes in GitHub Actions (`android.yml`).

After closure:
1. Record the closing commit SHA in `docs/milestones/M<N>-*.md`.
2. Update `docs/milestones/README.md` with the milestone status.
3. Tag the commit: `git tag m<N>-close`.
