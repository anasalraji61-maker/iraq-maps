# Iraq Smart Maps — Mobile Development Guide

> **Stack**: React Native · Expo (SDK 51+) · Expo Router v3 · MapLibre Native
>
> Android is the primary target. iOS support comes later. The guide assumes you have completed
> the root-level setup in `docs/CONTRIBUTING.md` and can run `pnpm install` cleanly.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables](#2-environment-variables)
3. [Running the App](#3-running-the-app)
4. [Project Layout](#4-project-layout)
5. [Adding a New Feature Screen](#5-adding-a-new-feature-screen)
6. [Map Development](#6-map-development)
7. [Arabic Text and RTL Layout](#7-arabic-text-and-rtl-layout)
8. [i18n — Internationalisation](#8-i18n--internationalisation)
9. [Styling and Theming](#9-styling-and-theming)
10. [API Client Usage](#10-api-client-usage)
11. [Debugging](#11-debugging)
12. [Performance](#12-performance)
13. [Testing](#13-testing)
14. [Maestro E2E Tests](#14-maestro-e2e-tests)
15. [Common Pitfalls](#15-common-pitfalls)

---

## 1. Prerequisites

### Required tools

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 20 LTS | Turborepo build |
| pnpm | 9.x | Workspace manager |
| Java | 17 (LTS) | Android Gradle build |
| Android Studio | 2024.1+ | Emulator + SDK |
| Watchman | Latest | Metro file watcher |

### Android SDK components

Open Android Studio → SDK Manager and install:

- **SDK Platform**: Android 14 (API 34) — minimum compile target
- **SDK Tools**: Android SDK Build-Tools 34, Android Emulator, Android SDK Platform-Tools,
  Intel x86 Emulator Accelerator (HAXM) or Google APIs system image for ARM Macs

### Environment check

```bash
pnpm turbo run android:precheck --filter=apps/mobile
```

This runs `expo prebuild --platform android --clean` (dry-run) and catches any config issues
before you try to open Android Studio.

---

## 2. Environment Variables

Copy `.env.example` to `.env` in the repo root and fill in local values.

```bash
cp .env.example .env
```

All env vars are loaded through `packages/config`. The mobile app reads them at build time
(for `EXPO_PUBLIC_*` values) or at request time via the backend.

### Key variables for mobile development

| Variable | Required | Notes |
|----------|----------|-------|
| `EXPO_PUBLIC_API_BASE_URL` | Yes | Local: `http://10.0.2.2:3000` for Android emulator, `http://localhost:3000` for iOS sim |
| `EXPO_PUBLIC_APP_ENV` | Yes | `development`, `staging`, or `production` |
| `EXPO_PUBLIC_TILES_BASE_URL` | Yes | URL to PMTiles file or local tile server |
| `EXPO_PUBLIC_SENTRY_DSN` | No | Leave empty for local dev |

> **Important**: `EXPO_PUBLIC_` variables ship inside the app binary and are visible to anyone
> who decompiles the APK. Never put API keys, tokens, or secrets in `EXPO_PUBLIC_` vars.
> The app reaches all keyed services through the backend.

### Android Emulator vs Physical Device

| Target | `EXPO_PUBLIC_API_BASE_URL` |
|--------|---------------------------|
| Android Emulator | `http://10.0.2.2:3000` |
| Physical device (same network) | `http://<your-machine-ip>:3000` |
| iOS Simulator | `http://localhost:3000` |

---

## 3. Running the App

### Start local services

```bash
pnpm infra:local up    # starts PostgreSQL 16+PostGIS and Redis
```

### Start the backend

```bash
pnpm turbo run dev --filter=apps/api
```

### Start Metro and open the app

```bash
cd apps/mobile
pnpm expo start
```

Then press `a` to open on the Android emulator, or scan the QR code with Expo Go on a physical device.

### Pre-built development client

For features that use native modules (MapLibre, camera, push notifications), Expo Go is not
enough. Build a local dev client:

```bash
pnpm expo run:android          # builds the app and installs on connected device/emulator
```

This generates `android/` (gitignored) and installs the dev client. Subsequent Metro changes
load without a full rebuild.

### Turborepo shortcut

From the repo root:

```bash
pnpm turbo run dev --filter=apps/mobile   # starts Metro only (backend must be running separately)
```

---

## 4. Project Layout

```
apps/mobile/
  app/                      Expo Router file-system routes (one-line re-exports only)
    (tabs)/                 Bottom tab navigator
      index.tsx             → re-exports from mobile-features/map
      discover.tsx
      assistant.tsx
      provider.tsx
      account.tsx
    place/[id].tsx          Dynamic place detail route
    auth/
      start.tsx
      verify.tsx
    _layout.tsx             Root layout — wraps with providers
  src/
    shell/
      layout/               Root layout component, tab bar, theme provider
      auth/                 Auth gate (redirect if not logged in)
      dev-settings/         Debug menu (dev builds only)
    providers/              React context providers (auth, i18n, theme)
    hooks/                  Shell-level hooks (useAuth, useTheme, etc.)

mobile-features/
  map/           @iraq-maps/feature-map     Map screen, place search, nearby POIs
  navigation/    @iraq-maps/feature-nav     Turn-by-turn routing
  account/       @iraq-maps/feature-account Profile, badges, check-ins
  provider/      @iraq-maps/feature-provider Business registration, management
  messages/      @iraq-maps/feature-messages Inquiry inbox, compose
  assistant/     @iraq-maps/feature-assistant AI chat screen
  discover/      @iraq-maps/feature-discover Feed, posts, stories
  activity/      @iraq-maps/feature-activity Notifications, history

packages/
  ui/            @iraq-maps/ui              Shared UI primitives
  map-kit/       @iraq-maps/map-kit         MapLibre wrapper, layer components
  mobile-kit/    @iraq-maps/mobile-kit      Navigation helpers, device utils
  i18n/          @iraq-maps/i18n            Translation hook, RTL utils
  api-client/    @iraq-maps/api-client      ts-rest typed client
  contracts/     @iraq-maps/contracts       Shared zod schemas
```

### Module boundary rule (critical)

`mobile-features/X` must never import from `mobile-features/Y`.
Cross-feature navigation goes through route parameters or deep links.
Cross-feature data is fetched independently by each feature from the API.

`apps/mobile` may only import from `mobile-features/*` and `packages/*`.

Boundary violations are caught by `pnpm depcruise` in the CI gate.

---

## 5. Adding a New Feature Screen

### Step 1: Create the feature package (if new)

```bash
mkdir mobile-features/my-feature
cd mobile-features/my-feature
```

Create `package.json`:

```json
{
  "name": "@iraq-maps/feature-my-feature",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@iraq-maps/ui": "workspace:*",
    "@iraq-maps/i18n": "workspace:*",
    "@iraq-maps/api-client": "workspace:*",
    "@iraq-maps/contracts": "workspace:*"
  }
}
```

Create `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### Step 2: Create the screen component

`mobile-features/my-feature/src/screens/MyFeatureScreen.tsx`:

```tsx
import React from 'react';
import { View, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from '@iraq-maps/i18n';
import { Text, Button } from '@iraq-maps/ui';
import { styles } from '../styles';

export function MyFeatureScreen() {
  const { t } = useTranslation();

  return (
    <>
      {/* Stack.Screen sets the header title without a separate file */}
      <Stack.Screen options={{ title: t('my_feature.title') }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="heading">{t('my_feature.heading')}</Text>
      </ScrollView>
    </>
  );
}
```

### Step 3: Export from the feature package

`mobile-features/my-feature/src/index.ts`:

```ts
export { MyFeatureScreen } from './screens/MyFeatureScreen';
```

### Step 4: Add the route in apps/mobile

`apps/mobile/app/my-feature/index.tsx`:

```tsx
export { MyFeatureScreen as default } from '@iraq-maps/feature-my-feature';
```

That one-liner is the only thing in every route file. All logic lives in the feature package.

### Step 5: Add i18n strings

`packages/i18n/src/locales/ar/my_feature.json`:

```json
{
  "title": "ميزتي",
  "heading": "مرحباً في الميزة الجديدة"
}
```

`packages/i18n/src/locales/en/my_feature.json`:

```json
{
  "title": "My Feature",
  "heading": "Welcome to the new feature"
}
```

The CI gate enforces that Arabic (ar) is present for every key.

---

## 6. Map Development

The map is built on **MapLibre Native** wrapped by `@iraq-maps/map-kit`.
Tile source: **PMTiles** hosted on S3-compatible storage. Never use tile.openstreetmap.org,
Google, Bing, Mapbox, or Esri tiles — this is a hard rule (data licensing).

### Basic map setup

```tsx
import { IraqMap, PlaceMarker, useMapRef } from '@iraq-maps/map-kit';

export function MapScreen() {
  const mapRef = useMapRef();

  return (
    <IraqMap
      ref={mapRef}
      initialCamera={{
        centerCoordinate: [44.3661, 33.3152], // Baghdad
        zoomLevel: 12,
      }}
      onMapReady={() => console.log('Map loaded')}
    >
      <PlaceMarker
        id="place-1"
        coordinate={[44.3920, 33.3295]}
        category="restaurant"
        onPress={(id) => router.push(`/place/${id}`)}
      />
    </IraqMap>
  );
}
```

### Camera control

```tsx
// Fly to a coordinate
mapRef.current?.flyTo([44.3920, 33.3295], { zoomLevel: 15 });

// Fit bounds with padding
mapRef.current?.fitBounds(
  [44.1, 33.1],   // SW corner
  [44.7, 33.7],   // NE corner
  { padding: { top: 80, bottom: 200, left: 20, right: 20 } }
);
```

### Adding a custom layer

```tsx
import { ShapeSource, FillLayer } from '@iraq-maps/map-kit';

// GeoJSON polygon layer
<ShapeSource id="highlight" shape={geojsonFeature}>
  <FillLayer
    id="highlight-fill"
    style={{
      fillColor: '#FF6B35',
      fillOpacity: 0.3,
    }}
  />
</ShapeSource>
```

### Route polyline

```tsx
import { RoutePolyline } from '@iraq-maps/map-kit';

// polyline6 is the encoded polyline from the routing API
<RoutePolyline
  id="active-route"
  encodedPolyline={routeResult.polyline6}
  color="#1A73E8"
  width={5}
/>
```

### OSM Attribution

MapLibre renders the attribution automatically from the tile source. The `IraqMap` component
also overlays a fixed attribution badge in the bottom-right corner using the string from the
`CityDescriptor.attribution` field. Never remove or obscure this badge — it is required
by the ODbL license.

### Map styles

Map styles (Mapbox GL style JSON) live in `packages/map-kit/src/styles/`. The style references
glyphs from `/v1/cities/:id/glyphs/` and sprites from the CDN. The Arabic font stack
(`Noto Sans Arabic Regular`) is listed before the Latin fallback in every text layer.

---

## 7. Arabic Text and RTL Layout

Arabic is the primary product language. Every screen must work correctly in RTL layout.

### Forcing RTL in the app

The root layout calls `I18nManager.forceRTL(true)` for Arabic and Kurdish Sorani locales.
This flips the layout direction for all `flexDirection: 'row'` containers automatically.

```tsx
// packages/i18n/src/rtl.ts
import { I18nManager } from 'react-native';

export function applyLocaleRTL(locale: string) {
  const isRTL = locale === 'ar' || locale === 'ckb';
  I18nManager.forceRTL(isRTL);
}
```

> Changing `forceRTL` requires an app restart to take effect. The dev settings menu provides
> a "Restart for RTL" button during development.

### RTL-aware styles

Do not use `marginLeft`/`paddingLeft`/`left` for logical spacing. Use the RTL-aware helpers:

```tsx
import { useRTL } from '@iraq-maps/i18n';

function MyComponent() {
  const { isRTL, start, end } = useRTL();

  return (
    <View style={{ paddingHorizontal: 16, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
      {/* start = left in LTR, right in RTL */}
      <Icon style={{ [start]: 8 }} />
      <Text style={{ textAlign: isRTL ? 'right' : 'left' }}>
        نص عربي
      </Text>
    </View>
  );
}
```

For StyleSheet, use the `rs` (RTL-safe) helper from `@iraq-maps/ui`:

```tsx
import { rs } from '@iraq-maps/ui';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    ...rs.paddingStart(16),   // paddingLeft in LTR, paddingRight in RTL
    ...rs.marginEnd(8),       // marginRight in LTR, marginLeft in RTL
  },
});
```

### Arabic numerals

IDs, phone numbers, and coordinates are displayed as Western Arabic numerals (`0–9`).
Amounts in IQD use Western Arabic numerals followed by the Arabic word for dinar:
`250,000 دينار` (not `٢٥٠,٠٠٠`).

### Text input for Arabic

```tsx
<TextInput
  textAlign="right"       // align text to the right for Arabic
  keyboardType="default"  // do NOT use numeric for Arabic text search
  autoCorrect={false}     // Arabic autocorrect is often wrong
  style={{ fontFamily: 'NotoSansArabic-Regular', fontSize: 16, lineHeight: 28 }}
/>
```

### Font loading

Fonts are loaded in `apps/mobile/src/shell/layout/FontLoader.tsx`:

```tsx
const [fontsLoaded] = useFonts({
  'NotoSansArabic-Regular': require('../../../assets/fonts/NotoSansArabic-Regular.ttf'),
  'NotoSansArabic-Bold':    require('../../../assets/fonts/NotoSansArabic-Bold.ttf'),
  'NotoSansArabic-Light':   require('../../../assets/fonts/NotoSansArabic-Light.ttf'),
});
```

Do not add custom fonts without adding them to `docs/DATA_SOURCES.md` with the license.

### RTL testing checklist

Before submitting any PR that touches UI:

- [ ] Text flows right-to-left
- [ ] Back button is on the right side of the header
- [ ] Lists with icons: icon is on the right, text on the left
- [ ] Modals and drawers open from the left edge (for RTL: left = logical start)
- [ ] No text is cut off in Arabic (longer words than English)
- [ ] Numbers (prices, distances, counts) display correctly

---

## 8. i18n — Internationalisation

The i18n system lives in `packages/i18n`. It wraps `i18next` with a typed interface.

### Translation hook

```tsx
import { useTranslation } from '@iraq-maps/i18n';

function PlaceCard({ place }: { place: PlaceSummary }) {
  const { t, locale } = useTranslation();

  // localised place name — Arabic first, fall back to English
  const name = place.names[locale] ?? place.names.ar ?? place.names.en ?? '';

  return <Text>{name}</Text>;
}
```

### Translation keys

Namespace files live in `packages/i18n/src/locales/<locale>/<namespace>.json`.

```
packages/i18n/src/locales/
  ar/
    common.json
    places.json
    navigation.json
    assistant.json
    ...
  ckb/
    common.json
    ...
  en/
    common.json
    ...
```

**Rule**: Arabic (`ar`) is mandatory for every key. Kurdish (`ckb`) and English (`en`) are
optional fallbacks. The CI gate fails if an `ar` key is missing.

### Formatting numbers and dates

```tsx
import { useFormatters } from '@iraq-maps/i18n';

function PriceDisplay({ amount }: { amount: number }) {
  const { formatCurrency, formatDistance, formatDuration } = useFormatters();

  return (
    <>
      <Text>{formatCurrency(amount, 'IQD')}</Text>  {/* → 25,000 دينار */}
      <Text>{formatDistance(1423)}</Text>           {/* → 1.4 كم */}
      <Text>{formatDuration(3600)}</Text>            {/* → ساعة واحدة */}
    </>
  );
}
```

### Pluralisation

```json
// ar/places.json
{
  "review_count": "{{count}} تقييم",
  "review_count_plural": "{{count}} تقييمات"
}
```

```tsx
t('places.review_count', { count: 47 }) // → "47 تقييماً"
```

Arabic has 6 grammatical number forms. The i18n package includes a custom Arabic plural
resolver. Use `count` as the key and the resolver handles the rest.

---

## 9. Styling and Theming

Shared design tokens live in `packages/ui/src/tokens.ts`. All colours, spacing, and typography
come from there — no magic numbers in component files.

### Theme

```tsx
import { useTheme } from '@iraq-maps/ui';

function Card() {
  const theme = useTheme();

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.md }}>
      <Text style={{ color: theme.colors.onSurface, ...theme.typography.body }}>
        محتوى البطاقة
      </Text>
    </View>
  );
}
```

### Colour tokens (semantic)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `colors.primary` | `#FF6B35` | `#FF8C5A` | Buttons, active states |
| `colors.surface` | `#FFFFFF` | `#1E1E1E` | Cards, sheets |
| `colors.background` | `#F5F5F5` | `#121212` | Screen background |
| `colors.onSurface` | `#1A1A1A` | `#E8E8E8` | Primary text |
| `colors.muted` | `#8A8A8A` | `#6A6A6A` | Secondary text, placeholders |
| `colors.error` | `#D32F2F` | `#EF5350` | Error states |
| `colors.success` | `#388E3C` | `#66BB6A` | Confirmed, verified |

### Shared UI components

`@iraq-maps/ui` exports these primitives. Use them instead of rolling your own:

| Component | Usage |
|-----------|-------|
| `<Text variant="...">` | Heading, subheading, body, caption, label |
| `<Button variant="...">` | Primary, secondary, ghost, danger |
| `<Card>` | Surface container with elevation |
| `<Badge>` | Status chips (verified, new, offer) |
| `<Skeleton>` | Loading placeholder |
| `<Avatar>` | User/place avatar with fallback initials |
| `<BottomSheet>` | Modal bottom sheet |
| `<Divider>` | Horizontal separator |
| `<Icon name="...">` | Icon from the project icon set |

---

## 10. API Client Usage

`@iraq-maps/api-client` wraps the ts-rest client with auth token injection.

### Setup

The client is initialised once in `packages/api-client/src/client.ts` and exported as a
singleton. Feature packages import it directly:

```tsx
import { apiClient } from '@iraq-maps/api-client';
```

### Making a request

```tsx
import { apiClient } from '@iraq-maps/api-client';
import { useState, useEffect } from 'react';

function PlaceDetail({ placeId }: { placeId: string }) {
  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.places.getPlace({ params: { id: placeId } })
      .then(res => {
        if (res.status === 200) setPlace(res.body);
        else setError(res.body.code ?? 'unknown_error');
      })
      .catch(() => setError('network_error'))
      .finally(() => setLoading(false));
  }, [placeId]);

  if (loading) return <Skeleton />;
  if (error) return <ErrorState code={error} />;
  return <PlaceCard place={place} />;
}
```

### React Query integration

Features should use React Query for caching. The `@iraq-maps/api-client` package re-exports
query-key factories:

```tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient, placeKeys } from '@iraq-maps/api-client';

function usePlaceDetail(id: string) {
  return useQuery({
    queryKey: placeKeys.detail(id),
    queryFn: () => apiClient.places.getPlace({ params: { id } })
      .then(res => {
        if (res.status !== 200) throw new Error(res.body.code);
        return res.body;
      }),
    staleTime: 5 * 60_000, // 5 minutes
  });
}
```

### Handling errors

The API returns RFC 9457 Problem Details for all errors. The `useApiError` hook translates
`code` fields into localised error messages:

```tsx
import { useApiError } from '@iraq-maps/api-client';

const { handleError } = useApiError();

apiClient.messaging.createInquiry(...)
  .then(res => {
    if (res.status !== 201) handleError(res.body); // shows toast with Arabic message
  });
```

---

## 11. Debugging

### Metro bundler logs

Metro logs appear in the terminal where you ran `expo start`. Add `--verbose` for full output.

### React Native DevTools

In a dev build, shake the device or press `Ctrl+M` (emulator) to open the dev menu.
Select "Open DevTools" to open the React Native DevTools in Chrome.

### Flipper (optional)

Flipper integration is not included by default. If you need network inspection, use
Android Studio's built-in network profiler or the React Native DevTools network tab.

### Debug menu (dev builds only)

`apps/mobile/src/shell/dev-settings/` contains a debug overlay accessible from the dev menu.
It shows:

- Current env (`EXPO_PUBLIC_APP_ENV`)
- API base URL
- Auth token info (expiry only — never the full token)
- Feature flags
- RTL toggle (requires restart)
- Cache clear button

### Logging

Use the `logger` from `packages/observability`:

```tsx
import { logger } from '@iraq-maps/observability';

logger.debug('place loaded', { placeId, duration: Date.now() - start });
logger.error('api error', { code, status });
```

Do not use `console.log` in committed code. The linter rejects it.

### Network requests

To inspect API calls during development:

1. Enable "Network Inspector" in the dev menu
2. Or run `adb reverse tcp:3000 tcp:3000` (for physical device) before starting Metro

### Common error: Metro bundler can't find module

```bash
# Clear Metro cache
pnpm expo start --clear

# If that doesn't work, clean node_modules
pnpm clean && pnpm install
```

### Common error: App can't reach local API

```bash
# Check adb tunnel for physical device
adb reverse tcp:3000 tcp:3000

# Verify emulator networking (10.0.2.2 should be host)
adb shell ping 10.0.2.2
```

---

## 12. Performance

### Image loading

Use the `<OptimizedImage>` component from `@iraq-maps/ui` instead of bare `<Image>`.
It requests the right size variant from the media API and uses progressive loading:

```tsx
import { OptimizedImage } from '@iraq-maps/ui';

<OptimizedImage
  assetId={place.provider?.photos[0]?.assetId}
  size="medium"   // thumbnail | medium | full
  style={{ width: 320, height: 200 }}
  resizeMode="cover"
/>
```

### FlatList optimisation

```tsx
<FlatList
  data={places}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <PlaceCard place={item} />}
  // Essential for long lists:
  getItemLayout={(_, index) => ({ length: CARD_HEIGHT, offset: CARD_HEIGHT * index, index })}
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
  initialNumToRender={8}
/>
```

### Map performance

- Cluster markers above zoom level 12 using the `<MarkerCluster>` component from `@iraq-maps/map-kit`
- Avoid re-rendering the map component on every state change — use `useMapRef` and imperative methods
- Limit GeoJSON sources to < 10,000 features; use vector tile layers for larger datasets

### Bundle size

Check bundle size after adding a new dependency:

```bash
pnpm expo export --platform android
npx source-map-explorer dist/bundles/index.android.bundle
```

New dependencies over 50 kB gzipped need a comment explaining why they were added.

### Memo and callbacks

```tsx
// Prevent PlaceCard from re-rendering when unrelated state changes
const MemoPlaceCard = React.memo(PlaceCard, (prev, next) => prev.place.id === next.place.id);

// Stabilise callbacks passed to map markers
const handleMarkerPress = useCallback((id: string) => {
  router.push(`/place/${id}`);
}, [router]);
```

---

## 13. Testing

Tests live in `__tests__/` inside each feature package, or beside the file as `*.test.tsx`.

### Unit tests (Vitest + RNTL)

```bash
# Run tests for one feature package
pnpm turbo run test --filter=@iraq-maps/feature-map

# Run all tests
pnpm turbo run test

# Watch mode
cd mobile-features/map
pnpm vitest --watch
```

### Writing a component test

```tsx
// mobile-features/map/src/__tests__/PlaceCard.test.tsx
import { render, screen } from '@testing-library/react-native';
import { PlaceCard } from '../components/PlaceCard';
import { TestProviders } from '@iraq-maps/testing';

const mockPlace = {
  id: 'way-123456789',
  kind: 'place',
  names: { ar: 'مطعم الشرق', en: 'Al-Sharq Restaurant' },
  category: 'restaurant',
  area: { ar: 'الكرادة' },
  location: [44.392, 33.3295],
  distanceM: 342,
};

it('renders the Arabic name', () => {
  render(
    <TestProviders locale="ar">
      <PlaceCard place={mockPlace} />
    </TestProviders>
  );

  expect(screen.getByText('مطعم الشرق')).toBeTruthy();
});

it('shows distance from near point', () => {
  render(
    <TestProviders locale="ar">
      <PlaceCard place={mockPlace} />
    </TestProviders>
  );

  expect(screen.getByText(/342/)).toBeTruthy();
});
```

### Test providers

`@iraq-maps/testing` exports `<TestProviders>` which wraps components with:
- i18n provider
- Theme provider
- React Query client (with no-retry, no cache config)
- Mock API client

Never instantiate real HTTP clients or database connections in tests.

### Mocking the API client

```tsx
import { mockApiClient } from '@iraq-maps/testing';

beforeEach(() => {
  mockApiClient.places.getPlace.mockResolvedValue({
    status: 200,
    body: mockPlace,
  });
});
```

### Snapshot tests

Snapshot tests are discouraged for complex components. Use targeted assertions instead.
If you add a snapshot, keep it small (a single UI primitive, not a full screen).

---

## 14. Maestro E2E Tests

Maestro YAML flows live in `e2e/maestro/`. They run on a real Android emulator or device.

### Prerequisites

```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify
maestro --version
```

### Run a flow

```bash
# Start a dev build first, then:
maestro test e2e/maestro/flows/search_place.yaml

# Run all flows
maestro test e2e/maestro/
```

### Example flow: search for a place

```yaml
# e2e/maestro/flows/search_place.yaml
appId: app.iraqmaps.dev
---
- launchApp
- waitForAnimationToEnd
- tapOn:
    id: "search-bar"
- inputText: "مطعم"
- waitForAnimationToEnd
- assertVisible:
    text: "مطعم الشرق"
- tapOn:
    text: "مطعم الشرق"
- assertVisible:
    id: "place-detail-screen"
```

### Example flow: check-in

```yaml
# e2e/maestro/flows/checkin.yaml
appId: app.iraqmaps.dev
---
- launchApp
- tapOn:
    id: "tab-map"
- tapOn:
    id: "place-marker-way-123456789"
- tapOn:
    id: "checkin-button"
- assertVisible:
    text: "تم تسجيل الزيارة"
```

### Writing new flows

Rules:
- Use `id` attributes (set with `testID` prop in React Native) — never rely on coordinates
- Add `waitForAnimationToEnd` after navigation and heavy data loads
- Keep flows independent — no flow should depend on the state left by a previous flow
- Arabic text in `inputText` and `assertVisible` works with Maestro

### Testability — adding testID attributes

Every interactive element and screen title must have a `testID`:

```tsx
<Button
  testID="checkin-button"
  onPress={handleCheckIn}
>
  {t('places.check_in')}
</Button>

<View testID="place-detail-screen">
  ...
</View>
```

Format: `kebab-case`, descriptive, unique within the screen.

---

## 15. Common Pitfalls

### Metro can't resolve workspace packages

**Symptom**: `Unable to resolve module @iraq-maps/ui`

**Fix**: Run `pnpm install` from the repo root, then restart Metro with `--clear`.
Make sure the package is listed in `apps/mobile/package.json` dependencies.

### Text is truncated in Arabic

Arabic words are typically longer than English. Always:
- Test with the longest Arabic string in the UI
- Use `numberOfLines={2}` instead of `numberOfLines={1}` for place names
- Use `adjustsFontSizeToFit` only as a last resort

### RTL icons look mirrored

Icons that indicate direction (arrows, chevrons, back buttons) should be mirrored in RTL.
Use the `<Icon>` component from `@iraq-maps/ui` which handles this automatically.
Icons with no directional meaning (stars, hearts, maps) should NOT be flipped.

### Date/time timezone issues

All timestamps from the API are UTC. Display times in **Baghdad time (UTC+3)** using the
`formatDateTime` helper from `@iraq-maps/i18n`:

```tsx
import { useFormatters } from '@iraq-maps/i18n';

const { formatDateTime } = useFormatters();
formatDateTime('2026-10-16T12:00:00.000Z') // → "الجمعة، 16 أكتوبر 2026، 3:00 م"
```

### Map tiles not loading

1. Check `EXPO_PUBLIC_TILES_BASE_URL` in `.env`
2. For Android emulator, tiles from `localhost` won't work — use `10.0.2.2`
3. Verify the PMTiles file exists and is accessible from the device
4. Check that the style JSON glyph/sprite URLs are reachable

### Push notifications not working in emulator

Push notifications (Expo Push) only work on physical devices or in specific emulator configurations.
Use the notification test endpoint in the dev settings menu to trigger a local notification
without a push token.

### Keyboard covering input fields

Wrap screens that have text inputs in `<KeyboardAvoidingView>`:

```tsx
import { KeyboardAvoidingView, Platform } from 'react-native';

<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  style={{ flex: 1 }}
>
  <ScrollView>
    <TextInput ... />
  </ScrollView>
</KeyboardAvoidingView>
```

### App crashes on Android (release build only)

Enable ProGuard source map uploads in CI to get readable stack traces.
Check `android/app/proguard-rules.pro` for keep rules if a library is stripped.

---

*Last updated: 2026-10-16*
