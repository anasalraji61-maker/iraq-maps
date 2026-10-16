# Iraq Smart Maps — Mobile Architecture

> Version: 1.0 · Last updated: 2026-10-16
> Platform: Android (primary). iOS later. React Native + Expo SDK.

---

## Table of Contents

1. [Feature Package Structure](#1-feature-package-structure)
2. [Navigation Graph](#2-navigation-graph)
3. [State Management](#3-state-management)
4. [Offline Strategy](#4-offline-strategy)
5. [Real-Time Integration](#5-real-time-integration)
6. [Deep Linking Schema](#6-deep-linking-schema)
7. [Push Notification Flow](#7-push-notification-flow)
8. [Analytics Tracking](#8-analytics-tracking)
9. [i18n Strategy](#9-i18n-strategy)
10. [RTL Considerations](#10-rtl-considerations)

---

## 1. Feature Package Structure

The mobile app is split into two layers:

```
apps/mobile/           ← Expo shell (routing, tabs, auth gate, dev settings)
mobile-features/       ← Feature packages (each is an @iraq-maps/feature-<x> workspace)
packages/              ← Shared infrastructure (ui, map-kit, mobile-kit, api-client, i18n)
```

### Shell (apps/mobile)

```
apps/mobile/
├── app/                     ← Expo Router file-system routes (one-line re-exports)
│   ├── (tabs)/
│   │   ├── index.tsx        → re-export from mobile-features/map
│   │   ├── discover.tsx     → re-export from mobile-features/discover
│   │   ├── messages.tsx     → re-export from mobile-features/messages
│   │   ├── activity.tsx     → re-export from mobile-features/activity
│   │   └── account.tsx      → re-export from mobile-features/account
│   ├── auth/
│   │   ├── phone.tsx        → OTP phone entry
│   │   └── verify.tsx       → OTP code entry
│   ├── place/[id].tsx       → Place detail sheet
│   ├── provider/[id].tsx    → Provider profile
│   ├── post/[id].tsx        → Discover post detail
│   ├── navigation/index.tsx → Turn-by-turn navigation
│   └── assistant/index.tsx  → AI assistant chat
│
├── src/shell/
│   ├── AuthGate.tsx         ← Renders children only when authenticated
│   ├── TabBar.tsx           ← Custom Arabic tab bar (RTL order)
│   ├── RootLayout.tsx       ← QueryClientProvider, ThemeProvider, I18nProvider
│   └── DevSettings.tsx      ← API URL toggle, language switch (dev builds only)
│
└── test/                    ← Jest + RNTL shell-level tests
```

### Feature Packages

Each `mobile-features/<name>/` is an independent workspace package. Features never import each other.

| Package                          | Tab / Entry      | Provides                                           |
|----------------------------------|------------------|----------------------------------------------------|
| `@iraq-maps/feature-map`         | Home tab         | MapLibre map, place markers, search bar, place sheet |
| `@iraq-maps/feature-navigation`  | Pushed from map  | Turn-by-turn nav, route overlay, maneuver list     |
| `@iraq-maps/feature-discover`    | Discover tab     | Feed, compose post, like/comment, follow           |
| `@iraq-maps/feature-messages`    | Messages tab     | Inquiry list, inquiry detail, send/reply           |
| `@iraq-maps/feature-activity`    | Activity tab     | Activity feed, unread badge                        |
| `@iraq-maps/feature-account`     | Account tab      | Profile, settings, privacy, logout, delete account |
| `@iraq-maps/feature-assistant`   | Pushed from map  | AI chat UI, streaming messages, place cards        |
| `@iraq-maps/feature-provider`    | Account tab child| Provider registration, dashboard, inbox            |
| `@iraq-maps/feature-tour3d`      | Reserved         | 3D tour viewer (future)                            |

### Shared Packages (mobile-relevant)

| Package                    | Purpose                                                            |
|----------------------------|--------------------------------------------------------------------|
| `@iraq-maps/ui`            | Design system: colors, typography, spacing, shared components      |
| `@iraq-maps/map-kit`       | MapLibre wrapper, layer helpers, tile source config, Arabic glyphs |
| `@iraq-maps/mobile-kit`    | Hooks: useLocation, useImagePicker, useDeepLink, usePushToken      |
| `@iraq-maps/api-client`    | @tanstack/react-query wrappers for all ts-rest contract endpoints   |
| `@iraq-maps/i18n`          | Translations (ar/ckb/en), useTranslation hook, RTL utilities       |

---

## 2. Navigation Graph

Expo Router uses a file-system-based router. The structure below maps files to screens.

```
/                         → Redirect to /(tabs)
                          (AuthGate: if not authenticated → /auth/phone)

/(tabs)/                  ← Bottom tab navigator
│
├── index (Map)           ← Default tab
│   ├── Press marker → /place/[id]         (modal sheet)
│   ├── Press navigate → /navigation       (full screen)
│   ├── Press AI chat → /assistant         (modal)
│   └── Press search result → /place/[id]
│
├── discover              ← Discover feed
│   ├── Press post → /post/[id]            (push)
│   ├── Press place tag → /place/[id]      (modal)
│   └── Press + (FAB) → /discover/compose  (modal)
│
├── messages              ← Inquiry inbox (users)
│   └── Press inquiry → /messages/[id]     (push)
│
├── activity              ← Activity / notifications feed
│   ├── Press like notif → /post/[id]
│   ├── Press comment notif → /post/[id]#comment-[cid]
│   └── Press inquiry notif → /messages/[id]
│
└── account               ← User profile & settings
    ├── If provider role → /provider/dashboard
    ├── Press settings → /account/settings (push)
    ├── Press language → /account/language (push)
    ├── Press privacy → /account/privacy   (push)
    └── Press delete account (modal confirm)

/auth/
├── phone                 ← Phone number entry (unauthenticated)
└── verify                ← OTP code entry

/place/[id]               ← Place detail (MapLibre Bottom Sheet)
│   ├── Press "Send message" → /messages/compose?placeId=[id]
│   ├── Press "Navigate" → /navigation?destId=[id]
│   ├── Press "Ask AI" → /assistant?context=place:[id]
│   └── Press photos → /place/[id]/photos (lightbox)

/navigation               ← Turn-by-turn (full screen, status bar overlay)

/assistant                ← AI chat (modal, full screen on small phones)
│   └── Press place card in chat → /place/[id]

/post/[id]                ← Post detail
│   ├── Comments list
│   └── Press place tag → /place/[id]

/provider/
├── register              ← Multi-step provider registration
├── dashboard             ← Provider overview (stats, quick actions)
└── inbox/
    └── [inquiryId]       ← Provider inbox detail

/messages/
├── compose               ← New inquiry form
└── [inquiryId]           ← Inquiry thread detail
```

---

## 3. State Management

### Server State: @tanstack/react-query (via @iraq-maps/api-client)

All remote data is managed through React Query. The `api-client` package wraps every ts-rest
endpoint in a typed query/mutation hook.

```typescript
// Example from api-client
export const usePlaceSearch = (params: PlaceSearchParams) =>
  useQuery({
    queryKey: ['places', 'search', params],
    queryFn: () => apiClient.places.search(params),
    staleTime: 5 * 60 * 1000,          // 5 minutes
    gcTime: 30 * 60 * 1000,            // 30 minutes
    enabled: params.q.length >= 2,
  });

export const useSendInquiry = () =>
  useMutation({
    mutationFn: (body: SendInquiryBody) => apiClient.messaging.sendInquiry(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages'] }),
  });
```

### Cache invalidation strategy

- Place search: invalidated manually, stale-while-revalidate for UX smoothness
- Feed: invalidated on pull-to-refresh + after like/comment mutations
- Inbox: invalidated on push notification received (via background fetch)
- My profile: invalidated on PATCH /v1/me success

### Client / UI State: React useState + Context

- Auth state: `AuthContext` (token pair, user object, isAuthenticated)
- Map state: `MapContext` (viewport, selected place, active route)
- Compose state: local `useState` in PostCompose screen
- Navigation state: `NavigationContext` (active route, current step index)

No global client state manager (Redux/Zustand) is used. Feature-local state stays local.

### Persistent State: AsyncStorage

Used only for per-device conveniences, never for shared state:

| Key                      | Value                           | Purpose                          |
|--------------------------|---------------------------------|----------------------------------|
| `auth:tokens`            | `{ accessToken, refreshToken }` | Persist login across app restarts|
| `auth:user`              | `Me` object                     | Show cached profile on cold start|
| `map:lastViewport`       | `{ lat, lng, zoom }`            | Restore map position on reopen   |
| `app:language`           | `'ar' | 'ckb' | 'en'`          | Persist language selection        |
| `app:onboardingDone`     | `boolean`                       | Skip onboarding on re-open       |

---

## 4. Offline Strategy

Per ADR-0012, the app is designed for Iraqi network conditions: frequent drops, slow 3G, and
intermittent 4G. The strategy is "offline-tolerant" (not fully offline-first, which would require
a local DB like SQLite/WatermelonDB — deferred to a later phase).

### What works offline

| Feature             | Offline behaviour                                       |
|---------------------|---------------------------------------------------------|
| Map rendering       | MapLibre caches vector tiles in device storage (256 MB) |
| Last searched places| React Query cache persisted via AsyncStorage            |
| Last viewed routes  | Cached in React Query (staleTime 2 min, gcTime 10 min)  |
| User profile        | Shows cached Me object from AsyncStorage                |
| AI chat threads     | Shows cached thread history (no new messages)           |
| Discover feed       | Shows last loaded feed; no new posts until reconnect    |
| Pending actions     | None queued currently (future: offline queue for likes) |

### What requires connectivity

- Place search (live PostGIS query)
- Sending inquiries / replies
- New AI assistant messages
- Photo uploads
- New post creation
- OTP login

### Error handling

When an API call fails with a network error, React Query retries automatically (3×, exponential
backoff). After exhausting retries, the UI shows an Arabic error banner:
"تعذّر الاتصال بالخادم. يرجى التحقق من الاتصال."

---

## 5. Real-Time Integration

Current MVP uses polling + push notifications (WebSocket planned for post-MVP).

### Polling intervals

| Data                       | Interval               | Condition                     |
|----------------------------|------------------------|-------------------------------|
| Activity feed unread count | Every 30s              | App in foreground, authenticated|
| Provider inbox badge       | Every 60s              | User has provider role        |
| Active inquiry status      | On screen focus        | User has open inquiries       |

### Push notifications → state update

When a push notification arrives (FCM), the app:
1. Receives notification in background via `expo-notifications`
2. On tap: Expo Router deep links to the relevant screen
3. On foreground arrival: `queryClient.invalidateQueries` for the affected query

```typescript
// mobile-features/activity/src/usePushSync.ts
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const { type, refId } = response.notification.request.content.data;
    if (type === 'inquiry_reply') {
      queryClient.invalidateQueries({ queryKey: ['messages', refId] });
      router.push(`/messages/${refId}`);
    }
    if (type === 'post_liked') {
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    }
  });
  return () => sub.remove();
}, []);
```

---

## 6. Deep Linking Schema

App scheme: `iraqmaps://`
Web fallback: `https://iraqsmartmaps.app/` (defined by `APP_BASE_URL`)

| Deep link URL                      | Opens                           |
|------------------------------------|---------------------------------|
| `iraqmaps://place/<placeId>`       | Place detail sheet              |
| `iraqmaps://provider/<providerId>` | Provider profile page           |
| `iraqmaps://post/<postId>`         | Discover post detail            |
| `iraqmaps://messages/<inquiryId>`  | Inquiry thread                  |
| `iraqmaps://nav?dest=<lat>,<lng>`  | Navigation to coordinates       |
| `iraqmaps://assistant?q=<query>`   | AI assistant with pre-fill      |

Deep links are handled in `apps/mobile/src/shell/` via Expo Router's built-in deep link
support. Unauthenticated users who tap a deep link are shown the OTP login screen first;
the intended route is stored in navigation state and resumed after successful login.

---

## 7. Push Notification Flow

```
1. App starts → mobile-kit/usePushToken.ts
     ├─ Requests notification permissions (expo-notifications)
     ├─ Gets FCM device token
     └─ POST /v1/notifications/register { token, platform: 'android' }

2. Backend stores token in notifications.device_tokens

3. User receives a message reply (example):
     ├─ Provider submits reply → messaging.reply.received.v1 event
     ├─ NotificationsWorker picks up event from BullMQ
     ├─ Looks up device token for recipient user
     ├─ Calls PushSender.send(token, { title: "رد جديد", body, data })
     └─ FCM delivers to device

4. Device receives notification:
     ├─ If app backgrounded: system notification shown, tap → deep link
     └─ If app foregrounded: in-app banner, React Query invalidation

5. Token refresh:
     ├─ FCM may issue a new token (rotation)
     ├─ App detects via onTokenRefresh listener
     └─ Re-registers new token via PATCH /v1/notifications/register
```

Notification channels (Android):
- `messages`: High priority (heads-up), vibrate + sound
- `activity`: Default priority, no heads-up
- `system`: Low priority, silent

---

## 8. Analytics Tracking

Currently in-house only (no third-party analytics SDK in the app to avoid GDPR/data-residency
concerns). The admin metrics endpoint (`/v1/admin/metrics`) provides aggregate numbers.

Events tracked server-side (logged as structured JSON via Pino):
- Authentication events (login, register, logout)
- Place searches (query, city, result count — no user ID in prod logs)
- Route requests (distance bucket, mode)
- Assistant usage (message count, tool calls — no content)
- Inquiry sends (place count — no message content)
- Post creates, likes (count only)

No client-side event tracking SDK is installed. User-level analytics is deferred to a later phase.

---

## 9. i18n Strategy

Package: `packages/i18n`
React hook: `useTranslation()` from `@iraq-maps/i18n`

### Language priority

```
1. User preference (stored in AsyncStorage 'app:language' + PATCH /v1/me)
2. Device OS locale
3. Default: Arabic ('ar')
```

### Locale files

```
packages/i18n/src/locales/
├── ar.json      ← Primary (all keys must be present here)
├── ckb.json     ← Kurdish Sorani (subset; falls back to ar)
└── en.json      ← English (subset; falls back to ar)
```

### Arabic numeral formatting (ADR-0013)

Numbers displayed to users (distances, prices, ratings) use Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩)
when locale is `ar` or `ckb`. The `@iraq-maps/i18n` package exports a `formatNumber(n, locale)`
utility that handles this consistently. English locale uses Western digits.

### Translation keys

Keys are dot-separated namespaced strings. Namespace = feature name.

```json
{
  "map.searchPlaceholder": "ابحث عن مطعم، متجر...",
  "place.navigate": "ابدأ التنقل",
  "place.sendMessage": "راسل هذا المكان",
  "messages.noInquiries": "لا توجد رسائل بعد",
  "assistant.dailyLimitReached": "وصلت إلى الحد اليومي للرسائل"
}
```

### Pluralization

Using `intl-messageformat` for proper Arabic plural rules (Arabic has 6 plural forms):

```typescript
i18n.t('places.count', { count: 42 })
// → "٤٢ مكانًا" (Arabic Indic numerals + correct plural form)
```

---

## 10. RTL Considerations

Per ADR-0011 (RTL-first design), all UI is built for RTL by default. English/Kurdish Sorani fall
back to the same RTL layout.

### React Native RTL setup

```typescript
// apps/mobile/src/shell/RootLayout.tsx
import { I18nManager } from 'react-native';
I18nManager.forceRTL(true);  // Set once at startup; requires reload
```

### Layout rules

| Concern                    | Solution                                                     |
|----------------------------|--------------------------------------------------------------|
| Flex direction             | All rows use `flexDirection: 'row'`; RN flips for RTL        |
| Absolute positioning       | Use `start`/`end` (logical properties) not `left`/`right`    |
| Icons with direction       | Arrow icons mirrored via `scaleX: -1` transform for RTL      |
| Text alignment             | Default `textAlign: 'auto'` (follows locale)                 |
| Map UI overlay             | Search bar, FAB, attribution placed on RTL-aware edges       |
| Bottom tab bar             | Tab order reversed for RTL (Map ← Activity ← Messages ← Discover ← Account) |
| Navigation header          | Back arrow flipped; title on right in RTL                    |
| Swipe gestures             | Drawer opens from right; swipe-back works in RTL             |

### MapLibre RTL text

Arabic text labels on the map require `maplibre-gl-rtl-text` plugin. Loaded in `@iraq-maps/map-kit`:

```typescript
import MapLibreGL from '@maplibre/maplibre-react-native';
MapLibreGL.setRTLTextPlugin(
  'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.min.js',
  false
);
```

For offline / controlled builds, the RTL text plugin is bundled locally in `apps/mobile/assets/`.

### Component audit checklist (from ADR-0011)

- [ ] No hardcoded `left`/`right` in StyleSheet (use `start`/`end`)
- [ ] All icon buttons have `accessibilityLabel` in Arabic
- [ ] Input fields: `textAlign: 'right'` only for Arabic-only fields (phone, price)
- [ ] Number inputs use `keyboardType: 'number-pad'` not `'phone-pad'`
- [ ] Long press menus appear on the correct side
- [ ] Skeleton loaders animate in RTL direction

---

*End of Mobile Architecture. For the full navigation contract see `apps/mobile/app/`.
For deep link web fallback pages see `site/`.*
