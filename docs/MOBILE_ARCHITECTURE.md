# Mobile App Architecture

> Stack: React Native + Expo (Expo Router) + MapLibre Native  
> Package: `apps/mobile` + `mobile-features/*`

---

## Table of Contents

1. [Package Structure](#1-package-structure)
2. [Feature Package Pattern](#2-feature-package-pattern)
3. [Navigation Structure (Expo Router)](#3-navigation-structure-expo-router)
4. [State Management](#4-state-management)
5. [API Client Usage](#5-api-client-usage)
6. [Internationalisation and RTL](#6-internationalisation-and-rtl)
7. [Testing Approach](#7-testing-approach)
8. [Adding a New Feature — Step-by-step Guide](#8-adding-a-new-feature--step-by-step-guide)
9. [Map Integration](#9-map-integration)
10. [Offline and Low-connectivity Handling](#10-offline-and-low-connectivity-handling)

---

## 1. Package Structure

```
apps/mobile/                      ← Expo composition root (owns nothing but wiring)
  app/                            ← Expo Router route files (one-liners)
    (tabs)/
      index.tsx                   ← re-exports MapScreen from feature-map
      discover.tsx                ← re-exports DiscoverScreen
      messages.tsx                ← re-exports MessagesScreen
      activity.tsx                ← re-exports ActivityScreen
      account.tsx                 ← re-exports AccountScreen
    place/
      [id].tsx                    ← re-exports PlaceScreen from feature-map
    assistant.tsx                 ← re-exports AssistantScreen
    provider/
      register.tsx
      dashboard.tsx
  src/
    shell/                        ← owned exclusively by the mobile-shell agent
      _layout.tsx                 ← root layout: i18n provider, auth gate, tab bar
      tabs.tsx                    ← tab bar configuration (icons, labels)
      AuthGate.tsx                ← redirects unauthenticated users to /auth
      DevSettings.tsx             ← dev-only overlay (API URL, mock toggles)
      providers.tsx               ← React context providers (query client, theme)
  app.json / app.config.ts
  metro.config.js

mobile-features/                  ← one package per user-facing feature
  map/                            ← @iraq-maps/feature-map
  navigation/                     ← @iraq-maps/feature-navigation
  account/                        ← @iraq-maps/feature-account
  provider/                       ← @iraq-maps/feature-provider
  messages/                       ← @iraq-maps/feature-messages
  assistant/                      ← @iraq-maps/feature-assistant
  discover/                       ← @iraq-maps/feature-discover
  activity/                       ← @iraq-maps/feature-activity
  tour3d/                         ← @iraq-maps/feature-tour3d (later phase)

packages/
  mobile-kit/                     ← session hooks, API client, typed route links
  map-kit/                        ← MapLibre wrapper, style, attribution
  ui/                             ← design system (RTL, Arabic fonts, colours)
  i18n/                           ← translations ar/ckb/en + Arabic normalizer
  contracts/                      ← shared zod schemas and ts-rest contract
  api-client/                     ← typed fetch client generated from contracts
```

### Ownership Rules

- `apps/mobile/app/**` — one-line re-exports only. The agent that owns the route's feature writes the screen component; `mobile-shell` writes the route file.
- `apps/mobile/src/shell/**` — owned by `mobile-shell`. No feature package imports from `shell`.
- `mobile-features/X/**` — owned by the agent assigned to feature X. A feature never imports from another feature.
- `packages/*` — shared; changes go through a contract request (`docs/contract-requests/`).

---

## 2. Feature Package Pattern

Every feature in `mobile-features/` follows the same structure:

```
mobile-features/my-feature/
  src/
    index.ts              ← public surface: exports screens, hooks, and types only
    screens/
      MyScreen.tsx        ← the main screen component
    components/
      MyCard.tsx          ← private components (not exported from index)
    hooks/
      useMyData.ts        ← data-fetching and business logic hooks
    i18n/
      ar.json             ← Arabic strings (always required)
      ckb.json            ← Kurdish Sorani strings
      en.json             ← English strings
    __tests__/
      MyScreen.test.tsx
  package.json            ← "name": "@iraq-maps/feature-my-feature"
  tsconfig.json           ← extends packages/tooling/tsconfig.base.json
  jest.config.js
  README.md
```

### The Index Rule

`src/index.ts` is the **only** export point. `apps/mobile/app/**` imports from the package name:

```typescript
// apps/mobile/app/(tabs)/my-tab.tsx
export { MyScreen as default } from '@iraq-maps/feature-my-feature';
```

Internal components (`components/`, `hooks/`) are never imported by anything outside the package.

### Package.json

```json
{
  "name": "@iraq-maps/feature-my-feature",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "@iraq-maps/contracts": "*",
    "@iraq-maps/mobile-kit": "*",
    "@iraq-maps/ui": "*",
    "@iraq-maps/i18n": "*"
  }
}
```

Dependencies a feature package **must not** have:
- Another `@iraq-maps/feature-*` package (cross-feature coupling is forbidden)
- `apps/mobile` or `apps/api` (circular)
- `modules/*` (backend-only)

---

## 3. Navigation Structure (Expo Router)

The app uses **Expo Router v3** (file-based routing). The file tree maps directly to URLs:

```
/                          → (tabs)/index.tsx         → MapScreen
/discover                  → (tabs)/discover.tsx       → DiscoverScreen
/messages                  → (tabs)/messages.tsx       → MessagesScreen
/activity                  → (tabs)/activity.tsx       → ActivityScreen
/account                   → (tabs)/account.tsx        → AccountScreen
/place/[id]                → place/[id].tsx            → PlaceScreen
/assistant                 → assistant.tsx             → AssistantScreen
/provider/register         → provider/register.tsx     → ProviderRegisterScreen
/provider/dashboard        → provider/dashboard.tsx    → ProviderDashboardScreen
/auth                      → auth.tsx                  → AuthScreen (OTP flow)
```

### Tab Bar

The five tabs are defined in `apps/mobile/src/shell/tabs.tsx`:

| Tab       | Icon         | Arabic label | Route        |
|-----------|--------------|--------------|--------------|
| Map       | map-outline  | الخريطة      | `/`          |
| Discover  | compass      | اكتشف        | `/discover`  |
| Messages  | chat-bubble  | رسائل        | `/messages`  |
| Activity  | clock        | النشاط       | `/activity`  |
| Account   | person       | حسابي        | `/account`   |

### Navigation from a Feature Package

Features use typed route links from `packages/mobile-kit`:

```typescript
import { useRouter } from 'expo-router';

// In a component
const router = useRouter();
router.push(`/place/${placeId}`);
router.push('/assistant');
```

For deep links that pass data, use Expo Router's `params`:

```typescript
// Navigating to PlaceScreen with a pre-focused place
router.push({ pathname: '/place/[id]', params: { id: placeId } });
```

### Auth Gate

`src/shell/AuthGate.tsx` wraps the tab layout. It reads the session from `useSession()` (mobile-kit). If
there is no valid access token, it renders the auth flow at `/auth` instead of the tabs.

---

## 4. State Management

The app uses **hooks only** — no Redux, no Zustand, no global state library. Each feature manages its own
state locally.

### Data Fetching

Use the typed API client from `packages/api-client` wrapped in a custom hook. The client is built on `fetch`
with automatic token attachment and refresh.

```typescript
// mobile-features/places/src/hooks/usePlaceDetails.ts
import { apiClient } from '@iraq-maps/mobile-kit';

export function usePlaceDetails(placeId: string) {
  const [data, setData] = useState<PlaceDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiClient.places.get({ params: { id: placeId } })
      .then(res => {
        if (cancelled) return;
        if (res.status === 200) setData(res.body);
        else setError(res.body.code ?? 'unknown_error');
      })
      .catch(() => { if (!cancelled) setError('network_error'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [placeId]);

  return { data, loading, error };
}
```

### Session

`packages/mobile-kit` exports `useSession()`:

```typescript
type Session = {
  user: Me | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (tokens: TokenPair, user: Me) => void;
  logout: () => void;
};

const { user, isAuthenticated, logout } = useSession();
```

Tokens are stored in `expo-secure-store` (encrypted). The access token is kept in memory only; the refresh
token is persisted.

### Form State

Local `useState` for forms. No controlled-input abstractions — keep it simple. Example:

```typescript
const [phone, setPhone] = useState('');
const [submitting, setSubmitting] = useState(false);

async function handleSubmit() {
  setSubmitting(true);
  try {
    const res = await apiClient.auth.requestOtp({ body: { phone, locale: 'ar' } });
    if (res.status === 202) router.push('/auth/verify');
  } finally {
    setSubmitting(false);
  }
}
```

### Pagination

Use the cursor pattern with an accumulating array:

```typescript
const [items, setItems] = useState<Inquiry[]>([]);
const [cursor, setCursor] = useState<string | undefined>();
const [loadingMore, setLoadingMore] = useState(false);

async function loadMore() {
  setLoadingMore(true);
  const res = await apiClient.messaging.listInquiries({ query: { cursor } });
  if (res.status === 200) {
    setItems(prev => [...prev, ...res.body.items]);
    setCursor(res.body.nextCursor ?? undefined);
  }
  setLoadingMore(false);
}
```

---

## 5. API Client Usage

The typed client is in `packages/api-client` and is generated from the `@iraq-maps/contracts` ts-rest
router. It is the **only** way to call the backend from a feature package.

### Initialisation

The client is initialised in `packages/mobile-kit/src/client.ts` with the base URL from
`EXPO_PUBLIC_API_URL`. Do not instantiate it again in a feature package.

```typescript
import { apiClient } from '@iraq-maps/mobile-kit';
```

### Making a Request

```typescript
const res = await apiClient.places.search({
  query: {
    q: 'مطعم',
    city: 'baghdad',
    near: '44.40,33.34',
    lang: 'ar',
    limit: 20,
  },
});

if (res.status === 200) {
  console.log(res.body.items);
}
```

### Error Handling

The client uses ts-rest's discriminated union on `status`:

```typescript
const res = await apiClient.auth.verifyOtp({
  body: { phone, code },
});

switch (res.status) {
  case 200:
    login(res.body, res.body.user);
    break;
  case 401:
    setError(t(`error.${res.body.code}`));
    break;
  case 429:
    setError(t('error.rate_limited'));
    break;
}
```

### Token Refresh

Token refresh is handled automatically inside `packages/mobile-kit/src/client.ts`. When a 401 is received
it:

1. Tries `POST /v1/auth/refresh` with the stored refresh token.
2. If successful, stores the new tokens and retries the original request once.
3. If the refresh fails, calls `session.logout()` and the auth gate redirects to `/auth`.

---

## 6. Internationalisation and RTL

### Adding a String

1. Add the Arabic string to `src/i18n/ar.json` in the feature package.
2. Add the same key with an English translation to `src/i18n/en.json`.
3. Add Kurdish Sorani to `ckb.json` if available (can be the Arabic value initially).

```json
// ar.json
{
  "search": {
    "placeholder": "ابحث عن مطعم أو مكان...",
    "noResults": "لا توجد نتائج لـ «{{query}}»"
  }
}
```

4. Use `useTranslation` from `@iraq-maps/i18n` to read the string:

```typescript
import { useTranslation } from '@iraq-maps/i18n';

export function SearchBar() {
  const { t } = useTranslation('feature-map'); // namespace = package name
  return <TextInput placeholder={t('search.placeholder')} />;
}
```

5. Register the namespace in the feature's `src/i18n/index.ts`:

```typescript
import ar from './ar.json';
import ckb from './ckb.json';
import en from './en.json';

export const ns = 'feature-map' as const;
export const resources = { ar, ckb, en };
```

6. The shell's i18n initialiser picks this up automatically from the feature's package metadata.

### RTL Layout

The app defaults to **RTL** because the primary language is Arabic. `@iraq-maps/ui` provides RTL-aware
layout primitives:

```typescript
import { Row, Stack, Spacer } from '@iraq-maps/ui';

// Row reverses children order in RTL automatically
<Row>
  <Icon name="search" />
  <TextInput />
</Row>
```

Rules:
- Use `Row` and `Stack` from `@iraq-maps/ui`, not `View` with `flexDirection`.
- Never hardcode `paddingLeft` / `paddingRight` — use `paddingStart` / `paddingEnd` (or `ps`/`pe` shorthand from the design system).
- Icons that carry directional meaning (arrows, chevrons) must be mirrored in RTL. Use the `Flippable` wrapper:

```typescript
import { Flippable } from '@iraq-maps/ui';
<Flippable><ChevronRight /></Flippable>
```

### Arabic Text Normalization

Arabic text from user input (search, compose) must be normalized before sending to the API:

```typescript
import { normalizeArabic } from '@iraq-maps/i18n';

const normalized = normalizeArabic(rawInput);
// handles hamza, alef maddah, teh marbuta, tatweel, etc.
```

This normalizer is also applied server-side in `packages/i18n/src/normalize`, so search is consistent.

---

## 7. Testing Approach

### Unit Tests (Jest + RNTL)

Every feature package runs Jest with React Native Testing Library. Config lives in
`mobile-features/X/jest.config.js`:

```javascript
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['<rootDir>/../../packages/testing/src/rntl-setup.ts'],
  moduleNameMapper: {
    '^@iraq-maps/(.*)$': '<rootDir>/../../packages/$1/src/index.ts',
  },
};
```

Write tests alongside the component:

```typescript
// src/__tests__/SearchBar.test.tsx
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SearchBar } from '../components/SearchBar';

it('debounces search and calls onSearch after 300ms', async () => {
  jest.useFakeTimers();
  const onSearch = jest.fn();
  const { getByPlaceholderText } = render(<SearchBar onSearch={onSearch} />);

  fireEvent.changeText(getByPlaceholderText('ابحث...'), 'مطعم');
  expect(onSearch).not.toHaveBeenCalled();

  jest.advanceTimersByTime(300);
  await waitFor(() => expect(onSearch).toHaveBeenCalledWith('مطعم'));
});
```

### API Mocking

Use the fake implementations from `packages/testing`:

```typescript
import { FakeApiClient } from '@iraq-maps/testing';

const client = FakeApiClient.create({
  places: { search: jest.fn().mockResolvedValue({ status: 200, body: { items: [] } }) }
});
```

### E2E Tests (Maestro)

Maestro flows live in `mobile-features/X/maestro/`. Run them with the Maestro CLI against a dev build:

```bash
maestro test mobile-features/map/maestro/search.yaml
```

Example flow:

```yaml
# mobile-features/map/maestro/search.yaml
appId: app.iraqmaps.dev
---
- launchApp
- tapOn: "ابحث..."
- inputText: "مطعم"
- assertVisible: "مطعم الزوراء"
- tapOn: "مطعم الزوراء"
- assertVisible: "الكرادة"
```

---

## 8. Adding a New Feature — Step-by-step Guide

Follow these steps whenever you need a new tab or screen.

### Step 1: Create the package

```bash
mkdir -p mobile-features/my-feature/src/{screens,components,hooks,i18n,__tests__}
```

Create `package.json`:

```json
{
  "name": "@iraq-maps/feature-my-feature",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "dependencies": {
    "@iraq-maps/contracts": "*",
    "@iraq-maps/mobile-kit": "*",
    "@iraq-maps/ui": "*",
    "@iraq-maps/i18n": "*"
  }
}
```

Create `tsconfig.json`:

```json
{
  "extends": "../../packages/tooling/tsconfig.base.json",
  "compilerOptions": { "baseUrl": "." },
  "include": ["src"]
}
```

### Step 2: Define the contracts

If your feature needs new API endpoints, create a contract in `packages/contracts/src/my-feature.ts` and
export it from `packages/contracts/src/index.ts`. Then add the router to the ts-rest `apiContract` in
`packages/contracts/src/http.ts` via a contract request if you do not own that file.

### Step 3: Write the screen component

```typescript
// src/screens/MyScreen.tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from '@iraq-maps/i18n';

export function MyScreen() {
  const { t } = useTranslation('feature-my-feature');
  return (
    <View>
      <Text>{t('title')}</Text>
    </View>
  );
}
```

### Step 4: Export from index

```typescript
// src/index.ts
export { MyScreen } from './screens/MyScreen';
export type { MyScreenProps } from './screens/MyScreen';
```

### Step 5: Add the route file

In `apps/mobile/app/` (submit a request to `mobile-shell` if you do not own that path):

```typescript
// apps/mobile/app/(tabs)/my-tab.tsx
export { MyScreen as default } from '@iraq-maps/feature-my-feature';
```

### Step 6: Register the tab (if it is a new tab)

In `apps/mobile/src/shell/tabs.tsx`, add the tab configuration object.

### Step 7: Add i18n strings

Create `src/i18n/ar.json`, `ckb.json`, and `en.json`. Register the namespace in `src/i18n/index.ts`.

### Step 8: Write tests

Add at least one test per screen and one per non-trivial hook. Run `pnpm turbo run test --filter=@iraq-maps/feature-my-feature` to verify.

### Step 9: Write the README

Create `mobile-features/my-feature/README.md` documenting the screens, hooks, ports consumed, and i18n
namespaces.

---

## 9. Map Integration

The map component lives in `packages/map-kit`. Feature packages use it through `@iraq-maps/map-kit`:

```typescript
import { MapCanvas, useMapRef } from '@iraq-maps/map-kit';

export function MapScreen() {
  const mapRef = useMapRef();

  return (
    <MapCanvas
      ref={mapRef}
      cityDescriptor={city}
      onCameraChanged={(camera) => {
        // center is [lng, lat]
        setMapCenter(camera.center);
      }}
      onPlacePress={(placeId) => {
        router.push(`/place/${placeId}`);
      }}
    />
  );
}
```

### Attribution

`MapCanvas` always renders the OSM attribution overlay. You must never hide or obscure it. This is a
hard rule from CLAUDE.md (data licensing). The attribution text is sourced from the `CityDescriptor.attribution`
field.

### Adding a Layer

To add a custom overlay (e.g. incidents pins):

```typescript
import { MapCanvas, SymbolLayer, GeoJsonSource } from '@iraq-maps/map-kit';

<MapCanvas ...>
  <GeoJsonSource id="incidents" data={incidentsGeoJson}>
    <SymbolLayer id="incident-pins" sourceId="incidents" style={incidentStyle} />
  </GeoJsonSource>
</MapCanvas>
```

---

## 10. Offline and Low-connectivity Handling

Iraq has intermittent connectivity. The app must degrade gracefully.

### Network Error Handling

All hooks that call the API must handle `network_error` state and show an offline banner:

```typescript
import { useNetworkStatus } from '@iraq-maps/mobile-kit';

const { isOnline } = useNetworkStatus();

if (!isOnline) return <OfflineBanner />;
```

### Map Tiles

PMTiles are served from CDN. The MapLibre SDK caches tiles on disk automatically. Users in good coverage
areas will have the city cached after their first session. Do not ship tile data in the app bundle.

### Partial Results

When the API is slow, show stale cached data with a timestamp: "آخر تحديث قبل 5 دقائق". Never show an empty
screen when cached data exists.

### Request Cancellation

Always cancel in-flight requests when the component unmounts or the query changes:

```typescript
useEffect(() => {
  const controller = new AbortController();
  apiClient.places.search({ query: params, fetchOptions: { signal: controller.signal } })
    .then(res => { if (res.status === 200) setResults(res.body.items); });
  return () => controller.abort();
}, [params]);
```
