# Iraq Smart Maps — Mobile Features Reference

> **Platform:** Android (primary), iOS (later)  
> **Framework:** React Native + Expo (Expo Router)  
> **Map engine:** MapLibre Native  
> **Architecture:** Feature packages in `mobile-features/`, never importing each other.  
> **Language:** Arabic first, Kurdish Sorani second, English third. All layouts RTL.

---

## Table of Contents

1. [Feature Packages Overview](#feature-packages-overview)
2. [Navigation Map (Screen Graph)](#navigation-map-screen-graph)
3. [Tab Structure](#tab-structure)
4. [Feature: Map](#feature-map)
5. [Feature: Navigation](#feature-navigation)
6. [Feature: Assistant](#feature-assistant)
7. [Feature: Messages](#feature-messages)
8. [Feature: Discover](#feature-discover)
9. [Feature: Account](#feature-account)
10. [Feature: Provider](#feature-provider)
11. [Feature: Activity](#feature-activity)
12. [Feature: Tour 3D (reserved)](#feature-tour-3d-reserved)
13. [Offline Support](#offline-support)
14. [RTL and Arabic Specifics](#rtl-and-arabic-specifics)
15. [Permissions Required](#permissions-required)
16. [Deep Link Scheme](#deep-link-scheme)
17. [Push Notifications](#push-notifications)

---

## Feature Packages Overview

Each feature lives in `mobile-features/<feature>/` as an isolated workspace package `@iraq-maps/feature-<name>`. Features never import each other — cross-feature navigation uses Expo Router params and events.

| Package | Tab | Status |
|---------|-----|--------|
| `@iraq-maps/feature-map` | Map (الخريطة) | Active |
| `@iraq-maps/feature-navigation` | — (within Map tab) | Active |
| `@iraq-maps/feature-assistant` | Assistant (المساعد) | Active |
| `@iraq-maps/feature-messages` | Messages (رسائل) | Active |
| `@iraq-maps/feature-discover` | Discover (اكتشف) | Active |
| `@iraq-maps/feature-account` | Account (حسابي) | Active |
| `@iraq-maps/feature-provider` | — (within Account tab) | Active |
| `@iraq-maps/feature-activity` | Activity (نشاطي) | Active |
| `@iraq-maps/feature-tour3d` | Tour 3D | Reserved — stub only |

---

## Navigation Map (Screen Graph)

```
Root (auth gate)
├── (tabs)
│   ├── / → MapScreen
│   │   ├── /place/[id] → PlaceCardScreen (bottom sheet)
│   │   │   ├── /place/[id]/reviews → PlaceReviewsScreen
│   │   │   └── /place/[id]/photos → PlacePhotosScreen
│   │   ├── /navigate/plan → RoutePlannerScreen
│   │   └── /navigate/active → ActiveNavigationScreen
│   │
│   ├── /assistant → AssistantScreen
│   │   └── /assistant/trip-plan → TripPlanScreen
│   │
│   ├── /messages → MessagesScreen
│   │   ├── /messages/[id] → InquiryDetailScreen
│   │   └── /messages/compose → ComposeScreen
│   │
│   ├── /discover → DiscoverFeedScreen
│   │   ├── /discover/post/[id] → PostDetailScreen
│   │   │   └── /discover/post/[id]/comments → CommentsScreen
│   │   ├── /discover/new → NewPostScreen
│   │   └── /discover/user/[id] → UserProfileScreen
│   │
│   └── /account → AccountScreen
│       ├── /account/edit → EditProfileScreen
│       ├── /account/settings → SettingsScreen
│       │   ├── /account/settings/notifications → NotificationPrefsScreen
│       │   ├── /account/settings/language → LanguageScreen
│       │   └── /account/settings/privacy → PrivacyScreen
│       ├── /account/bookmarks → BookmarksScreen
│       ├── /account/my-reviews → MyReviewsScreen
│       └── /provider → ProviderDashboardScreen (role: provider)
│           ├── /provider/register → ProviderRegistrationScreen
│           │   ├── /provider/register/details → RegistrationDetailsScreen
│           │   ├── /provider/register/photos → RegistrationPhotosScreen
│           │   ├── /provider/register/consents → RegistrationConsentsScreen
│           │   └── /provider/register/prices → RegistrationPricesScreen
│           ├── /provider/inbox → ProviderInboxScreen
│           │   └── /provider/inbox/[id] → InquiryDetailScreen (provider view)
│           └── /provider/listings → ProviderListingsScreen
│               ├── /provider/listings/new → NewListingScreen
│               └── /provider/listings/[id]/edit → EditListingScreen
│
├── /onboarding → OnboardingScreen (first launch, not authenticated)
├── /login → LoginScreen
│   └── /login/otp → OtpVerifyScreen
└── /activity → ActivityScreen
    ├── /activity/inquiries → ActivityInquiriesTab
    └── /activity/notifications → ActivityNotificationsTab
```

### Cross-Tab Navigation

Navigation between tabs is done with Expo Router params. The map tab listens for `focusPlaceIds` and `focusPlaceId` URL params set by other features:

```typescript
// From AssistantScreen after receiving focusPlaceIds:
router.navigate({ pathname: '/', params: { focusPlaceIds: ids.join(',') } });

// From ComposeScreen, pre-fill place picker:
router.navigate({ pathname: '/messages/compose', params: { placeIds: ids.join(',') } });
```

---

## Tab Structure

The main tab bar has 5 tabs. In RTL (Arabic/Kurdish), the tab bar order reverses:

| Position (LTR) | Position (RTL) | Route | Label AR | Label CKB | Label EN |
|----------------|----------------|-------|----------|-----------|----------|
| 1 (leftmost) | 5 (rightmost) | `/` | الخريطة | نەخشە | Map |
| 2 | 4 | `/discover` | اكتشف | دۆزینەوە | Discover |
| 3 (center) | 3 (center) | `/assistant` | المساعد | یارمەتیدەر | Assistant |
| 4 | 2 | `/messages` | رسائل | پەیام | Messages |
| 5 (rightmost) | 1 (leftmost) | `/account` | حسابي | هەژمارم | Account |

The Activity screen is accessible from the Account tab or via notification deep links, not from the main tab bar.

---

## Feature: Map

**Package:** `@iraq-maps/feature-map`  
**Route:** `/`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `MapScreen` | `/` | Full-screen interactive map |
| `PlaceCardScreen` | `/place/[id]` | Sliding bottom sheet with place details |
| `PlaceReviewsScreen` | `/place/[id]/reviews` | Full reviews list for a place |
| `PlacePhotosScreen` | `/place/[id]/photos` | Photo lightbox carousel |

### Key Components

| Component | Description |
|-----------|-------------|
| `MapCanvas` | MapLibre GL map with PMTiles base layer |
| `SearchBar` | Full-width search input with autocomplete dropdown |
| `PlaceMarker` | Category icon marker that pans camera on tap |
| `CategoryFilterBar` | Horizontal scroll of category chips |
| `NearbyFAB` | Floating action button — searches nearby |
| `SatelliteToggle` | Switch between vector and Sentinel-2 satellite |
| `IncidentLayer` | Traffic incident markers on the map |
| `PlaceCard` | Bottom sheet: place name, category, hours, contacts, provider section |
| `ProviderPhotoCarousel` | Horizontal photo strip inside the place card |
| `ContactRow` | Phone / WhatsApp / Instagram row with consent-gated display |
| `OpenNowBadge` | Evaluates `hoursRaw` string client-side |
| `PriceLevelBadge` | ١–٤ dots, Arabic-Indic numerals |
| `CrowdingBadge` | هادئ / مزدحم label with color indicator |
| `ReviewsPreview` | Star rating bar + 2 most-helpful reviews preview |
| `NavigateButton` | «انطلق» button that opens RoutePlannerScreen |
| `MessageButton` | «تواصل» button that opens ComposeScreen |
| `ReportIncidentFAB` | Opens the incident report sheet |

### Map Interactions

- **Tap a marker:** opens `PlaceCardScreen` as a bottom sheet at 40% height.
- **Long-press on map:** drops a pin; offers «تنقل إلى هنا» and «ابحث هنا».
- **Pinch zoom / drag:** standard MapLibre gestures.
- **Two-finger rotation:** rotates the map; a compass button appears to reset bearing.
- **Swipe up on place card:** expands to full height showing reviews and photos.

### URL Params (received from other features)

| Param | Type | Effect |
|-------|------|--------|
| `focusPlaceId` | PlaceId | Pan & zoom to this place, open its card |
| `focusPlaceIds` | comma-separated PlaceIds | Show all places with pins; fit camera to bounds |
| `startNav` | `"placeId,lng,lat"` | Immediately open RoutePlannerScreen with destination |

---

## Feature: Navigation

**Package:** `@iraq-maps/feature-navigation`  
**Routes:** `/navigate/plan`, `/navigate/active`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `RoutePlannerScreen` | `/navigate/plan` | Pick mode, view summary distance/time, start |
| `ActiveNavigationScreen` | `/navigate/active` | Live turn-by-turn guidance |

### Key Components

| Component | Description |
|-----------|-------------|
| `RouteLayer` | MapLibre line layer rendering the polyline6 route |
| `ManeuverPanel` | Sticky bottom: turn icon + street name + distance to next maneuver |
| `RouteSummaryCard` | Pre-navigation card: total distance, ETA, mode picker (car/walk) |
| `TurnIcon` | Directional arrow. Mirrors horizontally in RTL for left/right turns |
| `WaypointList` | Ordered waypoints with drag-to-reorder |
| `EtaBar` | Persistent top bar during active navigation: ETA + remaining distance |
| `RerouteButton` | Recalculates route when user leaves the planned path |

### Navigation Lifecycle

1. User taps «انطلق» on a place card → `RoutePlannerScreen` opens with destination pre-set.
2. User picks mode (car / walk) and optionally adds waypoints.
3. Taps «ابدأ» → `ActiveNavigationScreen` opens.
4. GPS location is tracked with `expo-location` at high accuracy.
5. Active maneuver advances when the user passes `beginShapeIndex`.
6. Arrival triggers a confirmation sheet.

### Maneuver Text (i18n)

Instruction text is built client-side from i18n templates. The API returns `ManeuverType` + `ManeuverModifier` + `streetNames[]`. Example template (Arabic):

```json
{
  "maneuver": {
    "turn_right": "انعطف يميناً في {{street}}",
    "turn_left":  "انعطف يساراً في {{street}}",
    "continue":   "استمر على {{street}}",
    "roundabout_enter": "ادخل الدوار وخذ المخرج {{exit}}",
    "arrive":     "وصلت إلى وجهتك"
  }
}
```

Distance numbers inside instruction strings use Western Arabic numerals (`123`) even in Arabic locale because they are directional/technical values.

### RTL Note

`TurnIcon` uses `scaleX(-1)` transform when the locale is `ar` or `ckb` and the maneuver modifier is `left` or `right`. `straight`, `slight_left/right`, and `sharp_left/right` follow the same logic. The `arrive` and `depart` icons are never mirrored.

---

## Feature: Assistant

**Package:** `@iraq-maps/feature-assistant`  
**Routes:** `/assistant`, `/assistant/trip-plan`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `AssistantScreen` | `/assistant` | Chat interface: send messages, view replies |
| `TripPlanScreen` | `/assistant/trip-plan` | Structured trip planner form and result |

### Key Components

| Component | Description |
|-----------|-------------|
| `ChatBubble` | Single message (user = blue/right, assistant = grey/left in LTR; reversed in RTL) |
| `PlaceChip` | Tappable chip — navigates to place on the map tab |
| `ComposeButton` | «تواصل» button — opens `ComposeScreen` with pre-filled params |
| `DailyLimitBanner` | Shown at limit; displays reset time |
| `TripPlanForm` | Destination, dates, interests (chips), budget, party size |
| `TripDayCard` | One day: theme header, activity list, estimated daily cost |
| `TypingIndicator` | Animated 3-dot pulse during API call |
| `MessageInput` | Text input + send button; auto-grows up to 5 lines |

### Chat Bubble Layout (RTL)

```
Arabic/Kurdish layout:
┌────────────────────────────────────────┐
│  [assistant bubble — right-aligned]    │
│                         user bubble    │
└────────────────────────────────────────┘
```

In RTL mode, user bubbles are on the left and assistant bubbles are on the right — the opposite of LTR chat conventions.

### Session Persistence

- `sessionId` is stored in `AsyncStorage` under key `assistant_session_id`.
- Clear history: calls `DELETE /v1/assistant/sessions/:sessionId`, resets `AsyncStorage`.
- `useAssistantSession()` hook exposes `messages`, `sessionId`, `loading`, `sendMessage`, `clearHistory`.

### Daily Limit

- `useAssistantLimit()` fetches `GET /v1/assistant/usage`.
- When `remaining === 0`, `MessageInput` is disabled and `DailyLimitBanner` shows.
- Banner text (Arabic): «لقد وصلت إلى الحد اليومي. يُجدَّد في {{time}}.»

### Map Integration

When the response includes `focusPlaceIds`, the screen pushes a navigation event to the map tab:

```typescript
router.navigate({ pathname: '/', params: { focusPlaceIds: ids.join(',') } });
```

When the response includes `composeParams`, a «تواصل» button appears below the assistant message.

---

## Feature: Messages

**Package:** `@iraq-maps/feature-messages`  
**Routes:** `/messages`, `/messages/[id]`, `/messages/compose`, `/provider/inbox`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `MessagesScreen` | `/messages` | List of sent inquiries |
| `InquiryDetailScreen` | `/messages/[id]` | One inquiry with per-target status |
| `ComposeScreen` | `/messages/compose` | Compose + place picker |
| `ProviderInboxScreen` | `/provider/inbox` | Provider view: received inquiries |

### Key Components

| Component | Description |
|-----------|-------------|
| `InquiryCard` | Preview text + status badge (most recent status across all targets) |
| `DeliveryTargetRow` | Per-place row: place name + status badge + handoff button |
| `HandoffLinkButton` | Opens WhatsApp / Instagram / phone URL; shows copyable Arabic text |
| `ComposeForm` | Textarea (1–500 chars) + live char counter + send button |
| `PlacePicker` | Multi-select: search places, add up to 5 |
| `ReplyForm` | Provider reply textarea (max 1000 chars) |
| `StatusBadge` | Colour-coded chip: queued=grey, sent=blue, delivered=teal, read=green, replied=gold, failed=red, handed_off=purple |

### Inquiry Status Flow

```
queued → sent → delivered → read → replied
                                  └→ handed_off
              └→ failed
```

### Handoff Link Types

| Type | URL format | Use case |
|------|-----------|----------|
| `wa_me` | `https://wa.me/<phone>?text=<encoded>` | Provider has WhatsApp, no Cloud API consent |
| `ig_me` | `https://ig.me/m/<username>` | Provider has Instagram |
| `tel` | `tel:<phone>` | Provider shows phone, no other channel |

### Idempotency

Every `POST /v1/inquiries` call must include `Idempotency-Key: <uuid>`. The UUID is generated client-side once per compose session and stored in component state. Retrying a failed request reuses the same key.

---

## Feature: Discover

**Package:** `@iraq-maps/feature-discover`  
**Routes:** `/discover`, `/discover/post/[id]`, `/discover/new`, `/discover/user/[id]`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `DiscoverFeedScreen` | `/discover` | Paginated feed with category filter |
| `PostDetailScreen` | `/discover/post/[id]` | Single post: full body, media, comments |
| `CommentsScreen` | `/discover/post/[id]/comments` | Paginated comments list |
| `NewPostScreen` | `/discover/new` | Create post: type, category, body, media, place |
| `UserProfileScreen` | `/discover/user/[id]` | User's public posts and stats |

### Key Components

| Component | Description |
|-----------|-------------|
| `PostCard` | Feed item: author row, media strip (max 4), body text, action bar |
| `CategoryFilterBar` | Horizontal chips: الكل / طعام / نقل / سياحة / تسوق / خدمات |
| `PostTypeChip` | Badge: صورة / نصيحة / فعالية / عرض |
| `ActionBar` | Like count + comment count + bookmark + share |
| `CommentCard` | Comment row with like button |
| `MediaGrid` | 1–4 photo grid within a post; tapping opens lightbox |
| `LightboxViewer` | Full-screen photo carousel with pinch-zoom |
| `ReportSheet` | Bottom sheet with report reason options |
| `MentionInput` | Text input that autocompletes `@username` as user types |
| `VerifiedBadge` | Blue checkmark shown next to verified provider author names |
| `PinnedPostBanner` | «مثبّت» label on the author's pinned post |

### Post Types

| Type (API) | Display AR | Display EN | Use case |
|------------|-----------|-----------|----------|
| `photo` | صورة | Photo | Share a photo of a place |
| `tip` | نصيحة | Tip | Text advice about a place |
| `event` | فعالية | Event | Announce an event at a place |
| `offer` | عرض | Offer | Provider discount or promotion |

### Category Filter Bar

The filter bar is horizontally scrollable and RTL-safe (scrolls right-to-left). «الكل» (All) chip is always first (rightmost in RTL). Selecting a category appends `?category=food` to the feed query.

---

## Feature: Account

**Package:** `@iraq-maps/feature-account`  
**Routes:** `/account`, `/account/edit`, `/account/settings/*`, `/account/bookmarks`, `/account/my-reviews`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `AccountScreen` | `/account` | Profile overview + action list |
| `EditProfileScreen` | `/account/edit` | Edit display name and username |
| `SettingsScreen` | `/account/settings` | App settings |
| `NotificationPrefsScreen` | `/account/settings/notifications` | Per-channel notification toggles |
| `LanguageScreen` | `/account/settings/language` | Pick AR / CKB / EN |
| `PrivacyScreen` | `/account/settings/privacy` | Account deletion |
| `BookmarksScreen` | `/account/bookmarks` | Saved/bookmarked posts |
| `MyReviewsScreen` | `/account/my-reviews` | User's own reviews with edit/delete |

### Key Components

| Component | Description |
|-----------|-------------|
| `ProfileHeader` | Avatar, display name, username, joined date |
| `SettingsRow` | Single row in a settings list with label, value, and chevron |
| `ToggleRow` | Boolean toggle row for notification prefs |
| `DangerZone` | Red-coloured section with destructive actions (delete account) |

---

## Feature: Provider

**Package:** `@iraq-maps/feature-provider`  
**Routes:** `/provider`, `/provider/register/*`, `/provider/inbox`, `/provider/inbox/[id]`, `/provider/listings/*`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `ProviderDashboardScreen` | `/provider` | Overview: status badge, stats, quick actions |
| `ProviderRegistrationScreen` | `/provider/register` | Multi-step registration wizard |
| `RegistrationDetailsScreen` | `/provider/register/details` | Phone, hours, social links |
| `RegistrationPhotosScreen` | `/provider/register/photos` | Upload up to 10 photos |
| `RegistrationConsentsScreen` | `/provider/register/consents` | Consent scope toggles |
| `RegistrationPricesScreen` | `/provider/register/prices` | Add price ranges |
| `ProviderInboxScreen` | `/provider/inbox` | Received inquiries list |
| `InquiryDetailScreen` | `/provider/inbox/[id]` | Inquiry detail + reply form |
| `ProviderListingsScreen` | `/provider/listings` | Manage listings |
| `NewListingScreen` | `/provider/listings/new` | Create listing |
| `EditListingScreen` | `/provider/listings/[id]/edit` | Edit listing |

### Registration Wizard Steps

```
Step 1: Details (phone, hours, social links)
Step 2: Photos (upload 1–10 photos)
Step 3: Consents (toggle each scope)
Step 4: Prices (add 0–10 price ranges)
Step 5: Review & Submit
```

Step progress is shown with dot indicators. Arabic: step dots are ordered right-to-left.

### Consent Scopes (displayed to provider)

| Scope (API) | Label AR | What it enables |
|-------------|----------|-----------------|
| `photos` | عرض الصور | Show photos on place card |
| `show_phone` | عرض رقم الهاتف | Display phone number |
| `social_links` | روابط التواصل الاجتماعي | Show Instagram, Facebook, etc. |
| `whatsapp_messages` | استقبال رسائل واتساب | Receive WhatsApp inquiries |
| `show_prices` | عرض الأسعار | Display price ranges |

### Provider Status Badge

| Status | Label AR | Color |
|--------|----------|-------|
| `draft` | مسودة | Grey |
| `pending` | قيد المراجعة | Yellow |
| `verified` | موثّق ✓ | Green |
| `suspended` | موقوف | Red |

---

## Feature: Activity

**Package:** `@iraq-maps/feature-activity`  
**Route:** `/activity`

### Screens

| Screen | Route | Description |
|--------|-------|-------------|
| `ActivityScreen` | `/activity` | Tabbed: Inquiries + Notifications |
| `ActivityInquiriesTab` | `/activity/inquiries` | All sent inquiries with status |
| `ActivityNotificationsTab` | `/activity/notifications` | All notifications, mark-read |

### Key Components

| Component | Description |
|-----------|-------------|
| `ActivityTabBar` | Two tabs: استفساراتي / الإشعارات |
| `InquiryStatusCard` | Compact inquiry with status row per target |
| `NotificationRow` | Notification item with unread dot and timestamp |
| `MarkAllReadButton` | Header button; calls `POST /v1/notifications/read-all` |

---

## Feature: Tour 3D (reserved)

**Package:** `@iraq-maps/feature-tour3d`  
**Status:** Contracts frozen, screens not yet implemented. Do not implement until the tour3d milestone.

**Planned screens:**

| Screen | Route | Description |
|--------|-------|-------------|
| `Tour3DListScreen` | `/tour3d` | Browse heritage scenes by city and category |
| `Tour3DSceneScreen` | `/tour3d/[id]` | Immersive scene viewer with annotations |

---

## Offline Support

Iraq has intermittent connectivity. The app is built offline-first.

### What Works Offline

| Feature | Offline capability |
|---------|-------------------|
| Map tiles | ✅ Tiles cached on first load via MapLibre's tile cache |
| Place cards | ✅ Recently viewed places cached in SQLite (`expo-sqlite`) |
| Search results | ⚠️ Cached for 10 minutes; stale results shown with «بيانات قديمة» banner |
| Route (cached) | ✅ Last calculated route displayed; cannot recalculate without network |
| Compose (draft) | ✅ Draft saved locally; sends when connection restores |
| Notifications | ❌ Requires network |
| Feed | ⚠️ Last page cached; pull-to-refresh requires network |
| Assistant | ❌ Requires network (Claude API is server-side) |

### Offline Queue

Outgoing actions queued offline:

1. `POST /v1/inquiries` — queued in `AsyncStorage` with idempotency key.
2. `POST /discover/posts` — queued with media pre-uploaded.
3. `POST /v1/incidents` — queued; expires if not sent within 2 hours.

The `useOfflineQueue()` hook monitors `NetInfo` and flushes the queue on reconnect, in FIFO order.

### Cache TTLs

| Data | TTL | Storage |
|------|-----|---------|
| Map tiles | Persistent (until cache cleared) | MapLibre native cache |
| Place details | 30 minutes | SQLite |
| Search results | 10 minutes | SQLite |
| City list | 24 hours | AsyncStorage |
| Provider profile | 15 minutes | SQLite |
| Feed page | 5 minutes | React Query cache (in-memory) |
| Notifications | 2 minutes | React Query cache (in-memory) |

### Conflict Resolution

If an offline action fails on flush (e.g., the place no longer exists):

- The user sees a dismissible error toast.
- The failed action is moved to a «failed queue» accessible from `ActivityScreen`.
- No silent data loss.

---

## RTL and Arabic Specifics

### Layout Principles

All layouts are RTL-first. Use logical properties everywhere:

```typescript
// ✅ Correct
{ paddingStart: 16, paddingEnd: 8, marginStart: 12 }
flexDirection: 'row' // reverses automatically with I18nManager.isRTL

// ❌ Wrong
{ paddingLeft: 16, paddingRight: 8, marginLeft: 12 }
```

React Native respects `I18nManager.isRTL` for `flexDirection: 'row'` and `Text` alignment. The app sets `I18nManager.forceRTL(true)` on Arabic and Kurdish Sorani locales.

### Text Direction

- All user-visible text uses `writingDirection: 'rtl'` on Arabic/Kurdish.
- Mixed-direction text (Arabic sentence containing a Western price): wrap numbers in a `<Text dir="ltr">` span.
- URLs are always LTR.

### Numerals

| Context | Numeral style | Example |
|---------|--------------|---------|
| Prices in IQD | Arabic-Indic | ١٥٬٠٠٠ دينار |
| Price ranges | Arabic-Indic | ٥٬٠٠٠–١٥٬٠٠٠ |
| Distance (navigation) | Western | 450 م |
| Coordinates | Western | 44.3661, 33.3152 |
| Date/time (system UI) | Western | 16/10/2026 |
| Rating stars count | Western | 4.3 |
| Map zoom level | Western | Zoom 15 |

Use `i18n.formatNumber(value, { style: 'arabic-indic' })` from `packages/i18n` for prices.

### RTL Animations

- Slide-in transitions slide from left-to-right (entering from the end side in RTL) — Expo Router handles this.
- Bottom sheets slide up from the bottom regardless of locale.
- Drawers (if any) open from the end side (`right` in LTR → `left` in RTL).
- Turn icons in navigation mirror horizontally for left/right maneuvers.
- The `TurnIcon` component: `style={{ transform: [{ scaleX: isRTL && isMirrorable ? -1 : 1 }] }}`

### Arabic Search

The search query is sent as typed. The server normalises:
- `ة` → `ه`
- `أ إ آ` → `ا`
- Remove `ال` prefix
- Strip tashkeel (diacritics)

The client does not normalise — the server owns normalisation (ADR: `packages/i18n/src/normalize`).

### Fonts

- Arabic: **Cairo** (Google Fonts, SIL Open Font License). Supports Arabic, Kurdish Sorani, and Latin.
- Map glyphs: served from `glyphsUrl` in the city descriptor.

---

## Permissions Required

| Permission | Android | iOS | Used by |
|-----------|---------|-----|---------|
| `ACCESS_FINE_LOCATION` | yes | `NSLocationWhenInUseUsageDescription` | Navigation GPS tracking |
| `ACCESS_COARSE_LOCATION` | yes | — | Nearby search, map «موقعي» button |
| `CAMERA` | yes | `NSCameraUsageDescription` | Photo upload for posts/provider |
| `READ_EXTERNAL_STORAGE` | yes (< Android 13) | `NSPhotoLibraryUsageDescription` | Photo picker |
| `READ_MEDIA_IMAGES` | yes (≥ Android 13) | — | Photo picker |
| `POST_NOTIFICATIONS` | yes (≥ Android 13) | — | Push notifications |
| `VIBRATE` | yes | — | Haptic feedback on turn alerts |
| `RECEIVE_BOOT_COMPLETED` | yes | — | Restart offline queue service |

All permission requests include Arabic explanatory strings. The rationale UI appears before the system dialog.

### Location Permission Flow

1. User taps «موقعي» button on the map.
2. If permission not granted: show in-app rationale sheet (Arabic).
3. User taps «السماح» → system permission dialog.
4. If denied: show a «يمكنك تفعيله من الإعدادات» message.
5. If granted: centre map on current location.

Navigation requires `ACCESS_FINE_LOCATION`. If the user has only coarse permission, a prompt to upgrade appears when they start navigation.

---

## Deep Link Scheme

**Scheme:** `iraqmaps://`  
**Universal Links domain:** `iraq-maps.app` (configured in `apps/mobile/app.json`)

| Deep Link | Opens |
|-----------|-------|
| `iraqmaps://place/<placeId>` | MapScreen → PlaceCardScreen for the place |
| `iraqmaps://navigate?dest=<lng>,<lat>` | RoutePlannerScreen with destination |
| `iraqmaps://messages/<inquiryId>` | InquiryDetailScreen |
| `iraqmaps://discover/<postId>` | PostDetailScreen |
| `iraqmaps://user/<userId>` | UserProfileScreen |
| `iraqmaps://assistant?q=<text>` | AssistantScreen with pre-filled query |
| `iraqmaps://provider/inbox` | ProviderInboxScreen (if user is a provider) |
| `iraqmaps://notifications` | ActivityScreen → Notifications tab |

### Universal Links

The same paths under `https://iraq-maps.app/` trigger the app if installed. Fallback: a mobile web page with a «فتح التطبيق» button.

---

## Push Notifications

The app uses Firebase Cloud Messaging (FCM) on Android and APNs on iOS, via `expo-notifications`.

### Notification Channels (Android)

| Channel ID | Name AR | Importance | Vibration |
|-----------|---------|-----------|-----------|
| `messages` | رسائل | HIGH | yes |
| `replies` | ردود | HIGH | yes |
| `discover` | اكتشف | DEFAULT | no |
| `system` | تحديثات النظام | LOW | no |

### Notification → Screen Mapping

| Notification `data.screen` | Opens |
|----------------------------|-------|
| `messages/detail` | `/messages/[data.inquiryId]` |
| `provider/inbox/detail` | `/provider/inbox/[data.inquiryId]` |
| `discover/post` | `/discover/post/[data.postId]` |
| `provider/verified` | `/provider` |
| `notifications` | `/activity` (notifications tab) |

### Badge Count

The app badge count equals `unreadCount` from `GET /v1/notifications`. It is updated on every app foreground event and via WebSocket `notifications.new.v1` events.
