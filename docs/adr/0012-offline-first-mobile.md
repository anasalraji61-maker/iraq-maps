# ADR-0012: Offline-First Mobile Architecture

**Status:** Accepted  
**Date:** 2026-10-16  
**Author:** Mobile platform team  
**Milestone:** M0 (foundational)

---

## Context

### Connectivity Reality in Iraq

Iraq has significant internet infrastructure challenges:

- **Mobile data:** 3G/4G coverage is concentrated in Baghdad and major cities. Rural areas and many suburban neighbourhoods have intermittent or no coverage.
- **Electricity:** Power outages are frequent (8–16 hours/day in summer in some areas). When power returns, many users rush to open their phones simultaneously, causing cell tower congestion.
- **Fixed broadband:** Widely used through ISP satellite links that have variable latency (100–500ms) and occasional packet loss.
- **Café/public Wi-Fi:** Unreliable and sometimes filtered.

A map application that requires continuous internet access fails its users at the moments they need it most — navigating an unfamiliar neighbourhood, finding a pharmacy at night, or looking up a business when the 4G signal drops.

### Existing Approach (before this decision)

The initial prototype made synchronous API calls for every interaction. This produced:

- Blank screens on any network interruption.
- Lost work when a user typed a message and their connection dropped before sending.
- Navigation stopping mid-route when the routing API call failed during position updates.
- Cascading failures — a slow tiles response caused the entire UI to freeze.

### Requirements

The app must:

1. Show useful content even without a network connection.
2. Not lose user work (composed messages, written reviews) on a connection drop.
3. Give the user clear feedback about data freshness.
4. Sync queued actions automatically when connectivity returns.
5. Support navigation (turn-by-turn) across a route even if the connection drops after the route is loaded.

---

## Decision

**The mobile app uses an offline-first architecture with explicit TTL caching, an outgoing action queue, and a sync manager.**

### Components

#### 1. Tile Cache (MapLibre)

Map tiles are cached natively by MapLibre's tile cache on first load. The cache is persistent across app restarts and is never cleared automatically.

- **Cache location:** MapLibre's internal SQLite tile cache.
- **Eviction:** LRU, managed by MapLibre. Cache size limit: 512 MB.
- **When offline:** The map renders from cached tiles for previously viewed areas. Uncached tiles show a grey placeholder.
- **No manual management needed:** MapLibre handles this transparently.

#### 2. SQLite Data Cache (`expo-sqlite`)

Recently viewed place details, search results, and city descriptor are cached in a local SQLite database.

```typescript
// packages/mobile-kit/src/cache/SqliteCache.ts

interface CacheEntry<T> {
  key: string;
  value: T;
  cachedAt: number;   // unix ms
  ttlMs: number;
}
```

**TTL table:**

| Data type | Cache key prefix | TTL | Notes |
|-----------|-----------------|-----|-------|
| Place details | `place:<id>` | 30 min | Extended to 6h when offline |
| Search results | `search:<q>:<city>` | 10 min | Shown with stale banner after TTL |
| Nearby results | `nearby:<lat>:<lng>:<r>` | 10 min | |
| City descriptor | `city:<id>` | 24h | Tiles URL, glyph URL |
| Provider profile | `provider:<id>` | 15 min | |
| Route | `route:<hash>` | 2h | Hash of origin+destination+mode |

When a cached entry is stale (past TTL) but a fresh fetch fails (offline):
- The stale entry is shown with a «بيانات قديمة — آخر تحديث: {{time}}» banner.
- The banner is dismissible.

#### 3. React Query Cache (In-Memory)

Dynamic feed data (discover feed, notifications, inquiry list) is managed by React Query with short TTLs. On offline, React Query returns the last successful response.

| Data | staleTime | gcTime |
|------|-----------|--------|
| Discover feed page | 5 min | 30 min |
| Notifications | 2 min | 10 min |
| Inquiry list | 3 min | 15 min |
| Provider inbox | 3 min | 15 min |

#### 4. Outgoing Action Queue

Actions that require network are queued locally and flushed on reconnect. The queue uses `AsyncStorage` for persistence across app restarts.

```typescript
// packages/mobile-kit/src/queue/OutgoingQueue.ts

interface QueuedAction {
  id: string;           // UUID — also the idempotency key for HTTP requests
  type: ActionType;
  payload: unknown;
  createdAt: number;    // unix ms
  expiresAt: number;    // unix ms — action is discarded if not sent by this time
  attempts: number;     // retry counter
  lastAttemptAt: number | null;
}

type ActionType =
  | 'send_inquiry'
  | 'create_post'
  | 'report_incident'
  | 'like_post'
  | 'bookmark_post';
```

**Expiry by action type:**

| Action | Expiry | Rationale |
|--------|--------|-----------|
| `send_inquiry` | 7 days | User intent; should survive days of offline |
| `create_post` | 24 hours | Posts are time-sensitive |
| `report_incident` | 2 hours | Incidents expire; stale reports are not useful |
| `like_post` | 24 hours | Social; can be retried |
| `bookmark_post` | 7 days | Saved for later; important to persist |

#### 5. Sync Manager

`useSyncManager()` hook:

1. Subscribes to `NetInfo` events.
2. On connection restored: flushes the queue in FIFO order.
3. On flush failure (server error, expired action): moves action to the `failedQueue`.
4. Exposes `pendingCount`, `failedCount`, `isSyncing`.

```typescript
const { pendingCount, failedCount, isSyncing, retryFailed } = useSyncManager();
```

The `failedQueue` is surfaced in `ActivityScreen` as a dismissible list of failed actions with a «أعد المحاولة» button.

#### 6. Offline Navigation

Turn-by-turn navigation works offline after the route is loaded:

- The route (`RouteResult` including the polyline6 and all maneuvers) is cached in SQLite on first load.
- The device GPS provides position updates — no network needed.
- Active maneuver advancement is purely local (match position against `beginShapeIndex`).
- **Re-route (if user goes off route) requires network.** A «إعادة الحساب مطلوبة — لا يوجد اتصال» notice is shown.

#### 7. Draft Persistence

Long-form inputs (inquiry compose, new post body, review text) are auto-saved to `AsyncStorage` as drafts:

```typescript
// Auto-save on every keystroke, debounced 2s
useAutosave(draftKey, value, { debounceMs: 2000 });

// Restore on screen mount
const draft = useRestoreDraft(draftKey);
```

Drafts are cleared on successful submission. They survive app kills, crashes, and phone restarts.

---

## Conflict Resolution

### Optimistic Updates

Like/bookmark actions use optimistic updates in React Query. If the server call fails:

1. React Query reverts the optimistic update.
2. The action is added to the outgoing queue.
3. The UI shows the original state until the queued action is flushed.

### Inquiry Idempotency

Every `POST /v1/inquiries` uses a stable idempotency key (the queue action UUID). Flushing the same inquiry multiple times after a network failure is safe — the server deduplicates by key.

### Incident Expiry

Reported incidents have a server-side TTL (`ttlHours`, default 2). If the outgoing queue holds an incident report for longer than its TTL, the queue entry is silently dropped rather than sent (the incident would be meaningless by then).

### Stale Cache Invalidation

When a fresh API response arrives for a cached entity, the cache is updated immediately. Cache TTL is a maximum age — fresh data always replaces stale data.

There is no client-side cache invalidation event system — invalidation is purely time-based (TTL) or fetch-triggered.

---

## UI Patterns for Offline State

### Connection Status Banner

A dismissible top banner appears within 3 seconds of losing connectivity:

```
لا يوجد اتصال بالإنترنت — يعمل التطبيق بوضع عدم الاتصال
```

It disappears automatically when connectivity is restored.

### Stale Data Banner

When displaying cached data past its TTL:

```
بيانات قديمة — آخر تحديث: قبل 25 دقيقة
```

### Queued Action Indicators

The compose screen shows a «سيُرسل عند الاتصال» badge when the inquiry was queued (not yet sent). The `InquiryCard` shows a clock icon instead of the status badge.

### Failed Action List

`ActivityScreen` shows a collapsible «إجراءات فاشلة» section listing actions that exhausted retries:

```
• رسالة لم يُرسل — المطعم لم يعد موجوداً       [تجاهل]
• منشور — خطأ في الخادم                          [أعد المحاولة]
```

---

## What Does Not Work Offline

The following features require network access and show a clear offline error state rather than stale data:

| Feature | Reason |
|---------|--------|
| Assistant chat | Claude API call is server-side |
| OTP login | SMS delivery |
| Geocoding (forward/reverse) | Photon is server-side |
| Listing browse (uncached) | No local copy |
| Payment processing | Security requires online |

---

## Consequences

### Positive

- Users in low-connectivity areas can use the app's core features (map, navigation, viewing places) even without internet.
- User work is never lost due to a connection drop.
- The app feels fast because most reads are served from local cache.

### Negative / Trade-offs

- Local cache uses storage space (SQLite + MapLibre tile cache). Estimated 200–600 MB for a power user with several cities cached.
- Cache staleness adds complexity. The «بيانات قديمة» UX must be implemented consistently.
- The outgoing queue adds state management complexity. Failed actions need a recovery UI.
- Testing requires simulating offline states in Jest and Maestro.

### Neutral

- The backend API is unaware of the offline strategy. The server sees identical requests whether they come from online or queued offline.
- React Query is already used for all data fetching; the offline strategy extends its existing cache rather than adding a separate system.

---

## Alternatives Considered

### PouchDB / CouchDB Sync

Full offline-first database replication. Rejected because:
- Too heavy for the use case (map/places app, not a document app).
- Conflict resolution complexity for social features (likes, comments).
- Native SQLite + React Query covers our actual needs.

### Service Worker (PWA)

Not applicable — this is a native app (React Native), not a web app.

### No Offline Support

Rejected. The primary user base is in Iraq where intermittent connectivity is the norm, not an edge case.
