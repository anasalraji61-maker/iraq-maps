# Testing Guide

This document covers the full testing stack: Vitest for backend packages, Jest + RNTL for mobile features,
and Maestro for end-to-end flows.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Backend Tests — Vitest](#2-backend-tests--vitest)
3. [Local PostGIS and Redis Setup](#3-local-postgis-and-redis-setup)
4. [Mobile Tests — Jest and RNTL](#4-mobile-tests--jest-and-rntl)
5. [E2E Tests — Maestro](#5-e2e-tests--maestro)
6. [Running Tests](#6-running-tests)
7. [Writing a New Test](#7-writing-a-new-test)
8. [Test Data and Seeds](#8-test-data-and-seeds)
9. [Mocks vs Real Services](#9-mocks-vs-real-services)
10. [CI](#10-ci)

---

## 1. Overview

| Layer      | Tool                | Where                          | Runs on          |
|------------|---------------------|--------------------------------|------------------|
| Unit/integration (backend) | Vitest | `modules/*/src/**/*.test.ts`, `packages/*/src/**/*.test.ts` | Local PostGIS + Redis |
| Unit/integration (mobile)  | Jest + RNTL | `mobile-features/*/src/**/*.test.tsx` | Node (JSDOM) |
| E2E (mobile) | Maestro | `mobile-features/*/maestro/*.yaml`, `e2e/` | Real or emulator device |
| E2E (API)  | Vitest (createApp)  | `e2e/api/**/*.test.ts`         | Local PostGIS + Redis |
| Contract conformance | Vitest | `packages/testing/src/**/*.conformance.ts` | Node |

The full gate (`pnpm gate`) runs everything except Maestro. Maestro runs separately.

---

## 2. Backend Tests — Vitest

Backend and shared-package tests use Vitest. Each package has its own `vitest.config.ts`.

### File conventions

- Test files live next to the source: `src/places.service.test.ts` alongside `src/places.service.ts`.
- Integration tests that need a database connection use `dbKit` helpers from `packages/db-kit`.
- Each module uses an isolated Postgres schema so tests in different modules do not interfere.

### Example — pure unit test

```typescript
// packages/geo/src/distance.test.ts
import { describe, it, expect } from 'vitest';
import { haversineDistanceM } from './distance';

describe('haversineDistanceM', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceM([44.40, 33.34], [44.40, 33.34])).toBe(0);
  });

  it('computes the Baghdad–Basra distance within 1%', () => {
    const d = haversineDistanceM([44.40, 33.34], [47.78, 30.51]);
    expect(d).toBeCloseTo(423_000, -4);
  });
});
```

### Example — database integration test

```typescript
// modules/places/src/places.service.test.ts
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { createTestDb } from '@iraq-maps/db-kit/testing';
import { PlacesService } from './places.service';

describe('PlacesService', () => {
  const db = createTestDb('places_test');  // isolated schema

  beforeAll(async () => {
    await db.migrate();  // runs this module's migrations
    await db.seed('baghdad-test-fixtures.sql');
  });

  afterAll(() => db.teardown());

  it('finds a restaurant by Arabic name', async () => {
    const svc = new PlacesService(db.client);
    const results = await svc.search({ q: 'زوراء', city: 'baghdad', lang: 'ar', limit: 5 });
    expect(results.items.length).toBeGreaterThan(0);
    expect(results.items[0].names.ar).toContain('زوراء');
  });
});
```

### Port conformance tests

Every port interface in `packages/contracts/src/ports.ts` has a conformance suite in
`packages/testing/src/`. The real implementation AND the fake must both pass it:

```typescript
// packages/testing/src/otp-sender.conformance.ts
import { describe, it, expect } from 'vitest';
import type { OtpSender } from '@iraq-maps/contracts';

export function describeOtpSenderConformance(factory: () => OtpSender) {
  describe('OtpSender conformance', () => {
    it('sends an OTP and returns an expiry', async () => {
      const sender = factory();
      const result = await sender.send('+9647501234567', '123456', 'ar');
      expect(result.expiresAt).toBeTruthy();
    });
  });
}
```

```typescript
// adapters/sms-provider/src/index.test.ts
import { describeOtpSenderConformance } from '@iraq-maps/testing';
import { SmsOtpSender } from './sms-otp-sender';

describeOtpSenderConformance(() => new SmsOtpSender({ apiKey: 'test' }));
```

---

## 3. Local PostGIS and Redis Setup

Tests run against local PostGIS and Redis — no Docker, no Testcontainers ([ADR-0004](./adr/0004-local-postgis-instead-of-testcontainers.md)).

### Prerequisites

- PostgreSQL 16 with PostGIS 3.x extension
- Redis 7.x

These must be running before running backend tests. Start them:

```bash
pnpm infra:local up
```

`infra:local` reads `infra/docker-compose.local.yml`. It starts only PostGIS and Redis — the NestJS API
server runs separately with `pnpm dev:api`.

### Test database

The `TEST_DATABASE_ADMIN_URL` env var points to an admin connection (DDL permissions). Each test file's
`createTestDb('my_schema')` call:

1. Creates a fresh Postgres schema `test_<hash>_my_schema`.
2. Runs the module's Drizzle migrations against it.
3. Returns a Drizzle client scoped to that schema.
4. `teardown()` drops the schema.

Multiple test files run in parallel; each gets its own schema, so there is no contention.

### Env vars for tests

Set in `.env` (or pass inline to `vitest`):

```bash
DATABASE_URL=postgresql://iraqmaps_app:secret@localhost:5432/iraqmaps_dev
TEST_DATABASE_ADMIN_URL=postgresql://iraqmaps_admin:secret@localhost:5432/iraqmaps_dev
REDIS_URL=redis://localhost:6379
```

---

## 4. Mobile Tests — Jest and RNTL

Mobile feature packages use `jest-expo` preset with React Native Testing Library.

### Setup

```javascript
// mobile-features/my-feature/jest.config.js
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFilesAfterFramework: [
    '@testing-library/jest-native/extend-expect',
    '../../packages/testing/src/rntl-setup.ts',
  ],
  moduleNameMapper: {
    '^@iraq-maps/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
    '^@iraq-maps/feature-(.*)$': '<rootDir>/../$1/src/index.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|expo|@expo|@maplibre)/)',
  ],
};
```

### Mocking the API client

In tests, replace the real API client with a jest mock:

```typescript
// src/__tests__/PlaceCard.test.tsx
import { render, screen } from '@testing-library/react-native';
import { PlaceCard } from '../components/PlaceCard';

jest.mock('@iraq-maps/mobile-kit', () => ({
  useSession: () => ({ isAuthenticated: false, user: null }),
  apiClient: {
    places: {
      get: jest.fn().mockResolvedValue({
        status: 200,
        body: {
          id: 'test-place',
          names: { ar: 'مطعم الاختبار' },
          kind: 'place',
          category: 'restaurant',
          location: [44.40, 33.34],
          distanceM: null,
          hoursRaw: null,
          osmContacts: {},
          source: 'osm',
          attribution: '© OpenStreetMap contributors',
        },
      }),
    },
  },
}));

it('renders the Arabic place name', async () => {
  render(<PlaceCard placeId="test-place" />);
  expect(await screen.findByText('مطعم الاختبار')).toBeTruthy();
});
```

### Testing RTL layouts

```typescript
import { render } from '@testing-library/react-native';
import { I18nProvider } from '@iraq-maps/i18n';

function withI18n(ui: React.ReactElement) {
  return render(<I18nProvider locale="ar">{ui}</I18nProvider>);
}

it('renders the search bar with RTL layout', () => {
  const { getByTestId } = withI18n(<SearchBar />);
  // RNTL does not simulate RTL visually but you can assert on style props
  expect(getByTestId('search-bar').props.style).toMatchObject({ flexDirection: 'row-reverse' });
});
```

---

## 5. E2E Tests — Maestro

Maestro tests run on a real Android device or emulator. They are not part of the gate (too slow for CI),
but must pass before a milestone closes.

### Prerequisites

1. Install Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`
2. Start the Android emulator or connect a device.
3. Build and install the dev client: `pnpm android:dev`
4. Set `EXPO_PUBLIC_API_URL` to point to your local API server.

### Running flows

```bash
# Run all flows in a feature
maestro test mobile-features/map/maestro/

# Run a single flow
maestro test mobile-features/map/maestro/search.yaml

# Run with a specific device
maestro test --device emulator-5554 mobile-features/map/maestro/search.yaml
```

### Writing a flow

```yaml
# mobile-features/messages/maestro/send-inquiry.yaml
appId: app.iraqmaps.dev
---
- launchApp
  env:
    MAESTRO_APP_ENV: e2e
    MAESTRO_FIXED_OTP: "999999"

# Log in
- tapOn: "رقم الهاتف"
- inputText: "+9647999999999"
- tapOn: "إرسال الرمز"
- tapOn: "أدخل الرمز"
- inputText: "999999"
- tapOn: "تأكيد"

# Search for a place
- tapOn: "ابحث..."
- inputText: "مطعم"
- assertVisible: "مطعم الاختبار"
- tapOn: "مطعم الاختبار"

# Open compose and send
- tapOn: "تواصل"
- tapOn:
    id: "compose-input"
- inputText: "هل متاح طاولة لـ 4 أشخاص؟"
- tapOn: "إرسال"
- assertVisible: "تم إرسال رسالتك"
```

### E2E environment

In `OTP_SENDER=fixed` mode the server always accepts `OTP_FIXED_CODE` (set to `999999` in `.env.e2e`).
This lets Maestro flows bypass real SMS.

---

## 6. Running Tests

### Run everything (the gate)

```bash
pnpm gate
```

This runs: lint, typecheck, tests, boundary check, secret scan, dead code, and duplication checks.

### Run one package's tests

```bash
pnpm turbo run test --filter=@iraq-maps/places
pnpm turbo run test --filter=@iraq-maps/feature-map
```

### Run only changed packages

```bash
pnpm turbo run lint typecheck test --filter=...[origin/main]
```

### Run a single test file

```bash
cd modules/places
pnpm vitest run src/places.service.test.ts
```

### Watch mode (during development)

```bash
cd modules/places
pnpm vitest
```

### Run mobile tests

```bash
pnpm turbo run test --filter=@iraq-maps/feature-map
# or
cd mobile-features/map
pnpm test
```

---

## 7. Writing a New Test

### Backend unit test checklist

- [ ] Test file is named `<module>.test.ts` and lives next to the source file.
- [ ] Uses `describe` + `it` blocks (not `test`).
- [ ] Each `it` block tests one behaviour.
- [ ] Does NOT import from `apps/*` or `modules/*` (test the module's own public API).
- [ ] Uses `FakeOtpSender`, `FakePushSender`, etc. from `packages/testing` — never the real adapters.

### Backend integration test checklist

- [ ] Calls `createTestDb` to get an isolated schema.
- [ ] Runs migrations in `beforeAll`.
- [ ] Seeds only the data the test needs (not a full city dump).
- [ ] Tears down in `afterAll` (or `afterEach` for mutation tests).

### Mobile unit test checklist

- [ ] Mocks `@iraq-maps/mobile-kit` (apiClient, useSession).
- [ ] Wraps with `I18nProvider` when testing translated text.
- [ ] Uses `findBy*` queries (async) for components that load data.
- [ ] Does NOT test implementation details (internal state, private functions).

### Maestro flow checklist

- [ ] Flow starts with `launchApp` and sets `MAESTRO_APP_ENV=e2e`.
- [ ] Uses `OTP_SENDER=fixed` + `MAESTRO_FIXED_OTP` to skip real SMS.
- [ ] Assertions use `assertVisible` on Arabic text (the app's UI language).
- [ ] Flow ends with an assertion that confirms the action succeeded.

---

## 8. Test Data and Seeds

### Backend seeds

Seed files live in `modules/<x>/fixtures/`. They are plain SQL files loaded by `db.seed()` in tests.

To create a seed:

```sql
-- modules/places/fixtures/baghdad-test-fixtures.sql
-- Insert a handful of places for testing search and nearby queries
INSERT INTO places.places (id, kind, names, location, city_id) VALUES
  ('osm/node/1', 'place', '{"ar":"مطعم الاختبار","en":"Test Restaurant"}', ST_MakePoint(44.40, 33.34), 'baghdad'),
  ('osm/node/2', 'place', '{"ar":"محل الكتب"}', ST_MakePoint(44.41, 33.35), 'baghdad');
```

Keep seeds small — only what each test needs. Avoid reusing a "big" seed across all tests; it makes tests
dependent on each other.

### Mobile test data

Mock API responses inline in the test file. Do not create shared fixture files for mobile tests — the
mocked data should be obvious from reading the test.

### City fixture for E2E

The e2e environment uses a minimal Baghdad fixture (`geo-services/pipeline/fixtures/baghdad-e2e.osm.pbf`)
with about 50 hand-picked places. This is imported once when the e2e database is set up:

```bash
pnpm e2e:db:setup
```

---

## 9. Mocks vs Real Services

The golden rule: **tests never call real external services.** Every external call goes through a port interface, and every port has a fake.

| External service | Port interface    | Fake class               | Env var to force fake |
|------------------|-------------------|--------------------------|-----------------------|
| SMS / OTP        | `OtpSender`       | `FakeOtpSender`          | `OTP_SENDER=fake`     |
| Claude API (LLM) | `LlmClient`       | `FakeLlmClient`          | (default in tests)    |
| WhatsApp Cloud   | `MessagingChannel`| `FakeMessagingChannel`   | (default in tests)    |
| FCM push         | `PushSender`      | `FakePushSender`         | `PUSH_PROVIDER=fake`  |
| S3/R2 storage    | `ObjectStorage`   | `FileObjectStorage` (dev)| `STORAGE_TYPE=file`   |
| Valhalla routing | `RoutingEngine`   | `FakeRoutingEngine`      | (default in tests)    |
| Photon geocoder  | `GeocoderClient`  | `FakeGeocoderClient`     | (default in tests)    |

Fakes live in `packages/testing/src/fakes/`. Every fake must pass the conformance suite for its port.

### When to use `FakeXxx` vs a jest mock

Use **`FakeXxx`** (from `packages/testing`) for:
- Integration tests that go through the full service layer.
- Conformance tests.

Use **jest mock** (`jest.fn()`) for:
- Unit tests of a single function or component.
- When you only care about whether a method was called, not what it does.

---

## 10. CI

GitHub Actions runs the full gate on every push to `main` and every pull request:

```yaml
# .github/workflows/gate.yml (simplified)
jobs:
  gate:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm gate
```

The Android build runs separately in `android.yml` — it only runs `pnpm android:precheck` (expo prebuild /
export without the Android SDK). A full APK build requires GitHub Secrets for the keystore.

### Secrets in CI

Secrets are stored as GitHub repository secrets. They are never printed in logs. The gate does not need
any real external API keys — all services run as fakes in the CI environment.
