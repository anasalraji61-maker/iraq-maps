# Iraq Smart Maps — Architecture Deep Dive

> Version: 1.0 · Last updated: 2026-10-16
> This document is English-language developer reference. For the high-level Arabic overview see `docs/ARCHITECTURE.md`.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Request Flow: Mobile → API → Module → DB](#2-request-flow-mobile--api--module--db)
3. [Module Interaction Diagram](#3-module-interaction-diagram)
4. [Data Flow: OSM → Import → Places → API → Mobile](#4-data-flow-osm--import--places--api--mobile)
5. [Event Flow: User Action → Event → Queue → Handlers](#5-event-flow-user-action--event--queue--handlers)
6. [Real-Time Flow: Action → WebSocket → Mobile](#6-real-time-flow-action--websocket--mobile)
7. [Caching Strategy by Layer](#7-caching-strategy-by-layer)
8. [Database Schema Overview](#8-database-schema-overview)
9. [Authentication Flow (JWT + Refresh)](#9-authentication-flow-jwt--refresh)
10. [Background Jobs](#10-background-jobs)
11. [External Service Integrations](#11-external-service-integrations)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                        │
│                                                                             │
│  ┌───────────────────┐          ┌───────────────────────────────────────┐  │
│  │  Android App      │          │  Web Admin Panel                      │  │
│  │  React Native     │          │  (apps/admin — Vite + React)          │  │
│  │  Expo Router      │          │  Provider moderation, metrics         │  │
│  │  MapLibre Native  │          │  X-Admin-Key protected                │  │
│  └────────┬──────────┘          └─────────────────┬─────────────────────┘  │
└───────────┼─────────────────────────────────────────┼────────────────────┘
            │  HTTPS + Bearer JWT                      │  HTTPS + X-Admin-Key
            ▼                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY TIER                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  apps/api — NestJS (Fastify adapter)                                │   │
│  │  - ts-rest router: maps HTTP contracts to NestJS controllers        │   │
│  │  - JWT Guard: verifies access tokens, injects RequestUser           │   │
│  │  - Rate limit guard: per-user sliding-window via Redis              │   │
│  │  - Request signing guard: HMAC X-Request-Signature (optional)      │   │
│  │  - Zod validation pipe: validates all request bodies/params        │   │
│  │  - Observability: Pino structured logging, OpenTelemetry traces    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │  Direct method calls (no HTTP)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DOMAIN TIER (Modular Monolith)                     │
│                                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │identity  │ │providers │ │ places   │ │ routing  │ │  assistant       │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │messaging │ │ insights │ │discover  │ │  media   │ │  activity        │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │notif-    │ │geocoding │ │ reviews  │ │moderation│ │  analytics       │ │
│  │ications  │ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │
│  └──────────┘                                                               │
│                                                                             │
│  All cross-module calls go through ports in packages/contracts              │
│  No module imports from another module's src/                               │
└──────────────────────┬─────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ PostgreSQL 16│ │  Redis   │ │  S3-compat.  │
│ + PostGIS    │ │ BullMQ   │ │  storage     │
│ + pg_trgm    │ │ sessions │ │  (media)     │
└──────────────┘ └──────────┘ └──────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    GEO SERVICES (sidecar containers)                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐                        │
│  │Valhalla  │  │  Photon  │  │  PMTiles (tiles)   │                        │
│  │ routing  │  │geocoding │  │  Planetiler output │                        │
│  └──────────┘  └──────────┘  └────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES (all behind adapter interfaces)         │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐                  │
│  │ Claude API   │  │  WhatsApp     │  │ Firebase FCM    │                  │
│  │ (LLM)        │  │  Cloud API    │  │ (push notifs)   │                  │
│  └──────────────┘  └───────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Request Flow: Mobile → API → Module → DB

### 2.1 Standard Authenticated Request

```
Mobile App
  │
  │  POST /v1/assistant/chat
  │  Authorization: Bearer <access_token>
  │  Content-Type: application/json
  │  X-Request-Signature: <HMAC> (optional)
  │
  ▼
NestJS Fastify Server (apps/api)
  │
  ├─ 1. Rate limit guard checks Redis sliding window
  │     key: ratelimit:<userId>:<route>
  │     Returns 429 if over limit
  │
  ├─ 2. Request signing guard (if REQUEST_SIGNING_SECRET set)
  │     Verifies X-Request-Signature HMAC
  │     Returns 401 if invalid or missing
  │
  ├─ 3. JWT guard
  │     Verifies access token signature (JWT_ACCESS_SECRET)
  │     Checks token expiry
  │     Injects { userId, roles } into request context
  │     Returns 401 if invalid/expired
  │
  ├─ 4. Zod validation pipe
  │     Validates request body against ts-rest contract schema
  │     Returns 400 with Problem details if invalid
  │
  ├─ 5. NestJS controller (AssistantController)
  │     Extracts validated body, calls service method
  │
  ├─ 6. AssistantService
  │     Business logic: check daily limit, call LLM, persist
  │     Reads/writes via Drizzle ORM
  │
  ├─ 7. Drizzle ORM → PostgreSQL
  │     Query executes in module's schema (assistant.*)
  │     Connection pool (DATABASE_URL, iraqmaps_app role)
  │
  └─ 8. Response serialized through ts-rest contract
        JSON → Mobile client
```

### 2.2 Public (Unauthenticated) Request

```
Mobile (no token)
  │
  │  GET /v1/places/search?q=مطعم&lat=33.3&lng=44.4&r=2000
  │
  ▼
NestJS
  ├─ Rate limit guard (IP-based for public routes)
  ├─ No JWT guard (route marked @Public())
  ├─ Zod validation of query params
  ├─ PlacesService.search()
  │   └─ PostGIS: ST_DWithin + pg_trgm ts_headline
  └─ Response with Place[] array
```

### 2.3 File Upload Request

```
Mobile
  │
  │  POST /v1/media/upload
  │  Content-Type: multipart/form-data
  │  Authorization: Bearer <token>
  │
  ▼
MediaController
  ├─ JWT guard
  ├─ Multer middleware: size limit (MEDIA_MAX_BYTES), MIME type whitelist
  ├─ GPS EXIF strip (sharp)
  ├─ MediaService.upload()
  │   ├─ ObjectStorage.put() → S3 or FileObjectStorage
  │   └─ DB record in media.assets
  └─ Return { assetId, url }
```

---

## 3. Module Interaction Diagram

```
packages/contracts defines all cross-module interfaces.
Arrows show direction of dependency (importer → imported).

apps/api
  ├── imports → modules/identity    (NestJS DI)
  ├── imports → modules/places
  ├── imports → modules/routing
  ├── imports → modules/providers
  ├── imports → modules/media
  ├── imports → modules/messaging
  ├── imports → modules/assistant
  ├── imports → modules/insights
  ├── imports → modules/discover
  ├── imports → modules/activity
  ├── imports → modules/notifications
  └── imports → adapters/*          (bound to interfaces)

modules/assistant
  ├── consumes → packages/contracts/LlmClient  (→ adapters/llm-anthropic)
  ├── consumes → packages/contracts/PlacesPort (→ modules/places)
  └── reads DB → assistant schema

modules/messaging
  ├── consumes → packages/contracts/MessagingChannel (→ adapters/whatsapp-cloud)
  ├── publishes → messaging.inquiry.received.v1
  └── publishes → messaging.reply.received.v1

modules/notifications
  ├── consumes → packages/contracts/PushSender (→ adapters/push-fcm)
  ├── listens → messaging.inquiry.received.v1
  ├── listens → messaging.reply.received.v1
  ├── listens → discover.post.liked.v1
  ├── listens → discover.post.commented.v1
  └── listens → discover.post.mentioned.v1

modules/discover
  ├── consumes → packages/contracts/ObjectStorage (→ adapters/storage-s3)
  ├── publishes → discover.post.liked.v1
  ├── publishes → discover.post.commented.v1
  └── publishes → discover.post.mentioned.v1

modules/activity
  ├── listens → discover.post.liked.v1
  ├── listens → discover.post.commented.v1
  └── listens → identity.user.deleted.v1

modules/media
  ├── consumes → packages/contracts/ObjectStorage
  └── publishes → media.asset.uploaded.v1

modules/providers
  ├── consumes → packages/contracts/ObjectStorage
  ├── publishes → provider.registered.v1
  └── publishes → provider.verified.v1

modules/places
  ├── consumes → packages/contracts/GeocoderClient (→ Photon / PostGIS fallback)
  └── reads DB → places schema (OSM-imported data)

modules/routing
  └── consumes → packages/contracts/RoutingEngine (→ adapters/routing-valhalla)

modules/insights
  └── reads DB → places schema (price/crowding reports)

NO module imports from another module's src/ directory.
All cross-module calls are either:
  a) NestJS DI with a port interface
  b) Domain events through BullMQ outbox
```

---

## 4. Data Flow: OSM → Import → Places → API → Mobile

```
OpenStreetMap Planet (pbf)
  │
  │  geo-services/osm-pipeline/
  │
  ├─ 1. EXTRACT
  │     osmium extract --polygon iraq.geojson planet.osm.pbf → iraq.osm.pbf
  │     (runs once, ~1 GB file)
  │
  ├─ 2. TILE GENERATION (geo-services/tiles/)
  │     Planetiler --area=iraq.osm.pbf
  │     Output: iraq-<date>.pmtiles (vector tiles, Mapbox GL spec)
  │     Published as GitHub Actions artifact (ADR-0008)
  │     Mobile references via EXPO_PUBLIC_TILES_URL
  │
  ├─ 3. DATABASE IMPORT (modules/places/src/import.ts)
  │     Reads iraq.osm.pbf with osmium-tool node bindings
  │     Filters: amenity, shop, tourism, historic, office, leisure
  │     For each place:
  │       a. Insert into places.osm_places (osmId, name_ar, name_en, name_ckb, geom)
  │       b. Upsert tags → places.place_tags
  │       c. Geocode if missing Arabic name (Photon fallback)
  │     Runs via: pnpm run import:places --city=baghdad
  │
  ├─ 4. ENRICHMENT (ongoing)
  │     Provider registration links places.osm_places ↔ providers.providers
  │     Price reports → insights.price_reports
  │     Photos → media.assets (linked to osm_id)
  │     Reviews → reviews.reviews
  │
  └─ 5. SERVING (API → Mobile)
        GET /v1/places/search
          └─ PlacesService.search()
               ├─ PostGIS: ST_DWithin(geom, ST_Point(lng, lat), radius)
               ├─ pg_trgm: similarity(name_ar, query)
               └─ LEFT JOIN providers ON providers.osm_id = osm_places.osm_id

        Mobile renders:
          ├─ Vector tiles (PMTiles) via MapLibre — OSM geometry
          └─ Place cards from API — enriched business data

OSM data (ODbL) is NEVER mixed with provider-owned data in the same table.
OSM attribution must always be visible in the map UI.
```

---

## 5. Event Flow: User Action → Event → Queue → Handlers

### 5.1 Transactional Outbox Pattern

```
                  ┌────────────────────────────────────────┐
                  │  Domain Service (e.g. MessagingService) │
                  │                                         │
                  │  BEGIN TRANSACTION                      │
                  │    INSERT INTO messaging.inquiries ...  │
                  │    INSERT INTO platform.outbox          │
                  │      (id, name, payload, created_at)   │
                  │      VALUES (uuid, 'messaging.         │
                  │        inquiry.received.v1', {...})     │
                  │  COMMIT                                 │
                  └────────────────┬───────────────────────┘
                                   │ (atomic: inquiry + event
                                   │  or neither)
                                   ▼
                  ┌────────────────────────────────────────┐
                  │  Outbox Relay (packages/db-kit)         │
                  │  BullMQ repeatable job, every 500ms     │
                  │                                         │
                  │  SELECT * FROM platform.outbox          │
                  │    WHERE published_at IS NULL           │
                  │    FOR UPDATE SKIP LOCKED               │
                  │    LIMIT 100;                           │
                  │                                         │
                  │  For each row:                          │
                  │    queue.add(row.name, row.payload)     │
                  │    UPDATE outbox SET published_at = NOW │
                  └────────────────┬───────────────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────────────┐
                  │  BullMQ Queue (Redis)                   │
                  │  Queue name: domain-events              │
                  └────────────────┬───────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
        ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
        │Notifications │  │  Activity   │  │  (future     │
        │  Worker      │  │  Worker     │  │   handlers)  │
        │              │  │             │  │              │
        │  On inquiry  │  │  On liked,  │  │              │
        │  received:   │  │  commented: │  │              │
        │  push notif  │  │  insert row │  │              │
        │  to provider │  │  in feed    │  │              │
        └──────────────┘  └─────────────┘  └──────────────┘
```

### 5.2 Event Names (all versioned)

| Event name                          | Producer           | Consumers                        |
|-------------------------------------|--------------------|----------------------------------|
| `identity.user.registered.v1`       | identity           | (future: onboarding flow)        |
| `identity.user.deleted.v1`          | identity           | activity, messaging, discover    |
| `provider.registered.v1`            | providers          | notifications, media             |
| `provider.verified.v1`              | providers          | notifications                    |
| `media.asset.uploaded.v1`           | media              | places (link photo)              |
| `messaging.inquiry.received.v1`     | messaging          | notifications, activity          |
| `messaging.reply.received.v1`       | messaging          | notifications, activity          |
| `discover.post.liked.v1`            | discover           | notifications, activity          |
| `discover.post.commented.v1`        | discover           | notifications, activity          |
| `discover.post.mentioned.v1`        | discover           | notifications                    |
| `discover.user.followed.v1`         | discover           | notifications, activity          |

---

## 6. Real-Time Flow: Action → WebSocket → Mobile

```
Currently in MVP: real-time is achieved through polling + push notifications.
WebSocket / SSE is planned for M8+.

Current real-time mechanisms:

1. PUSH NOTIFICATIONS (FCM via adapters/push-fcm)
   ─────────────────────────────────────────────
   Provider receives inquiry
   → messaging.inquiry.received.v1 event
   → NotificationsWorker.handleInquiryReceived()
   → PushSender.send(deviceToken, { title, body, data })
   → Firebase FCM HTTP v1 API
   → Android system notification
   → App wakes, navigates to inbox

2. POLLING (mobile-features)
   ─────────────────────────
   Activity feed: GET /v1/activity (every 30s when app in foreground)
   Inbox: GET /v1/messages/inquiries (pull-to-refresh)
   Provider inbox: GET /v1/provider/inbox (pull-to-refresh + badge count)

3. OPTIMISTIC UPDATES
   ──────────────────
   Like/unlike a post: UI updates instantly; API call fires in background
   Send message: shown as pending; confirmed on API response

Future (post-MVP):
   Server-Sent Events on /v1/events stream
   Mobile subscribes on app foreground
   Server pushes new activity items, message receipts, notifications
```

---

## 7. Caching Strategy by Layer

### Layer 1: Mobile (React Native)

```
┌─────────────────────────────────────────────────────────────┐
│  @tanstack/react-query (api-client wraps it)                 │
│                                                             │
│  staleTime / gcTime per query type:                         │
│  ─────────────────────────────────────────────────────────  │
│  Place search results     staleTime: 5 min   gcTime: 30 min │
│  Place detail             staleTime: 10 min  gcTime: 1 hr   │
│  Provider profile         staleTime: 15 min  gcTime: 2 hr   │
│  Discover feed            staleTime: 1 min   gcTime: 10 min │
│  Assistant thread         staleTime: ∞       gcTime: 24 hr  │
│  Route calculation        staleTime: 2 min   gcTime: 10 min │
│  My profile               staleTime: 30 min  gcTime: 2 hr   │
│                                                             │
│  Offline: AsyncStorage persists query cache for places      │
│  and routes (ADR-0012 offline-first strategy)               │
└─────────────────────────────────────────────────────────────┘
```

### Layer 2: API Server (Redis)

```
┌─────────────────────────────────────────────────────────────┐
│  Redis (REDIS_URL)                                          │
│                                                             │
│  Rate limiting:                                             │
│    key: rl:<userId>:<endpoint>                              │
│    TTL: sliding window, 60 seconds                          │
│                                                             │
│  OTP codes:                                                 │
│    key: otp:<phone_hash>                                    │
│    TTL: 10 minutes                                          │
│    Value: bcrypt hash of 6-digit code                       │
│                                                             │
│  Refresh token allowlist:                                   │
│    key: refresh:<jti>                                       │
│    TTL: 30 days                                             │
│                                                             │
│  Assistant daily usage:                                     │
│    key: assistant:usage:<userId>:<date>                     │
│    TTL: 25 hours                                            │
│                                                             │
│  Session cache (optional):                                  │
│    key: session:<userId>                                    │
│    TTL: 5 minutes                                           │
│    Value: serialized Me object (avoids DB hit per request)  │
└─────────────────────────────────────────────────────────────┘
```

### Layer 3: Database (PostgreSQL)

```
┌─────────────────────────────────────────────────────────────┐
│  No explicit query cache. Relies on:                        │
│                                                             │
│  - shared_buffers (default 128MB, tune to 25% of RAM)      │
│  - effective_cache_size (tune to 75% of RAM)                │
│  - work_mem for sort / hash joins in spatial queries        │
│                                                             │
│  Index strategy (PostGIS heavy):                            │
│    places.osm_places: GIST(geom), GIN(to_tsvector(name))  │
│    places.osm_places: GIN(name_ar gist_trgm_ops)           │
│    messaging.inquiries: BTREE(user_id, created_at DESC)     │
│    discover.posts: BTREE(created_at DESC) INCLUDE(id)       │
│    activity.items: BTREE(user_id, created_at DESC)          │
└─────────────────────────────────────────────────────────────┘
```

### Layer 4: Tile Serving

```
PMTiles (static file, S3-compatible or local)
  ├─ Served from EXPO_PUBLIC_TILES_URL (CDN or direct)
  ├─ Immutable file per city per OSM extract date
  ├─ MapLibre Native caches tiles in device storage
  └─ No server-side tile rendering at request time
```

---

## 8. Database Schema Overview

All schemas live in the same PostgreSQL instance. Each module owns its schema exclusively. No cross-schema JOINs in application code — data needed across modules is duplicated or resolved through API calls / events.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  platform schema (shared infrastructure)                                    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  outbox         id, name, payload, created_at, published_at                 │
│  migrations     (drizzle internal)                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  identity schema                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  users          id (ULID), phone_encrypted, phone_hash (lookup), name,      │
│                 locale, referral_code, referred_by, deleted_at, created_at  │
│  roles          user_id, role ('user'|'provider'|'admin'), granted_at       │
│  refresh_tokens jti, user_id, expires_at, revoked_at                        │
│  preferences    user_id, key, value (JSONB)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  places schema                                                               │
│  ─────────────────────────────────────────────────────────────────────────  │
│  osm_places     id (ULID), osm_id, osm_type, name_ar, name_en, name_ckb,   │
│                 geom (GEOGRAPHY POINT), amenity, category, city_id,         │
│                 address_ar, address_en, imported_at                         │
│  place_tags     place_id, key, value                                        │
│  collections    id, name_ar, name_en, description, created_by               │
│  collection_items collection_id, place_id, added_at                         │
│  cities         id, name_ar, name_en, bbox (GEOGRAPHY POLYGON), active      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  providers schema                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  providers      id, user_id (FK identity.users), osm_id (FK places),        │
│                 name_ar, name_en, phone_encrypted, website,                 │
│                 status ('pending'|'approved'|'rejected'|'suspended'),       │
│                 verified_at, created_at                                     │
│  provider_hours provider_id, day_of_week, opens_at, closes_at, closed      │
│  provider_links  provider_id, type, url                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  media schema                                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  assets         id (ULID), uploader_id, storage_key, mime_type, bytes,      │
│                 width, height, status, osm_id (optional link), created_at   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  messaging schema                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  inquiries      id, user_id, provider_id, place_ids (TEXT[]),               │
│                 body, status ('open'|'replied'|'closed'), created_at        │
│  replies        id, inquiry_id, author_id, author_type, body,               │
│                 sent_via ('app'|'whatsapp'), created_at                     │
│  read_receipts  inquiry_id, reader_id, read_at                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  assistant schema                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│  threads        id, user_id, title, created_at, last_message_at             │
│  messages       id, thread_id, role ('user'|'assistant'), content (TEXT),   │
│                 tool_calls (JSONB), created_at                              │
│  usage          id, user_id, date (DATE), message_count, token_count        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  discover schema                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  posts          id (UUID), author_id, body (TEXT), place_id (optional),     │
│                 status ('active'|'removed'|'pending'), created_at,          │
│                 pinned_at, category                                          │
│  post_media     post_id, asset_id, position                                 │
│  likes          post_id, user_id, created_at                                │
│  comments       id, post_id, author_id, body, parent_id, created_at         │
│  follows        follower_id, followee_id, created_at                        │
│  reports        id, reporter_id, post_id, reason, created_at                │
│  hashtags       id, tag, post_id                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  activity schema                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  items          id, user_id, type, ref_id, ref_type, actor_id,              │
│                 data (JSONB), read_at, created_at                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  notifications schema                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  device_tokens  id, user_id, token (FCM), platform, created_at, updated_at  │
│  sent           id, user_id, type, payload (JSONB), sent_at                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  insights schema                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  price_reports  id, place_id, reporter_id, item_name, price_iqd,            │
│                 source, observed_at, confidence, created_at                 │
│  crowding_reports id, place_id, reporter_id, level, observed_at,            │
│                 source, confidence, created_at                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Authentication Flow (JWT + Refresh)

```
REGISTRATION / LOGIN (OTP-based, no passwords)
══════════════════════════════════════════════

Step 1: Request OTP
  Mobile → POST /v1/auth/otp/request { phone: "+9647..." }
  Server:
    ├─ Validate Iraqi phone format (+964...)
    ├─ Encrypt phone with AES-GCM (PHONE_ENCRYPTION_KEY)
    ├─ Hash phone with HMAC (PHONE_HASH_KEY) for lookup
    ├─ Generate 6-digit OTP
    ├─ Store bcrypt(OTP) in Redis: otp:<phone_hash> TTL=10min
    └─ Send SMS via OtpSender (sms | console | fake)
  Response: { expiresAt, resendAfterSec: 60 }

Step 2: Verify OTP
  Mobile → POST /v1/auth/otp/verify { phone, code }
  Server:
    ├─ Hash phone → look up Redis key
    ├─ bcrypt.compare(code, storedHash)
    ├─ Delete Redis key (single-use)
    ├─ Upsert user record (create if new)
    ├─ Issue token pair:
    │    accessToken:  JWT, exp=15min, { sub: userId, roles }
    │    refreshToken: JWT, exp=30d,   { sub: userId, jti: uuid }
    ├─ Store jti in Redis: refresh:<jti> TTL=30d
    └─ Response: { accessToken, refreshToken, accessExpiresAt, user, isNewUser }

TOKEN USAGE
═══════════
  Every authenticated request:
    Authorization: Bearer <accessToken>
  Server:
    ├─ Verify signature with JWT_ACCESS_SECRET
    ├─ Check exp claim (15 min lifetime)
    └─ Inject { userId, roles } into NestJS ExecutionContext

TOKEN REFRESH
═════════════
  Mobile detects 401 or accessExpiresAt approaching:
  POST /v1/auth/refresh { refreshToken }
  Server:
    ├─ Verify signature with JWT_REFRESH_SECRET
    ├─ Check jti exists in Redis (not revoked)
    ├─ Delete old jti from Redis (rotation)
    ├─ Issue new token pair with new jti
    └─ Response: { accessToken, refreshToken, accessExpiresAt }

LOGOUT
══════
  POST /v1/auth/logout { refreshToken }
  Server:
    ├─ Verify refresh token
    ├─ Delete jti from Redis (immediate revocation)
    └─ 204 No Content

ACCOUNT DELETION
════════════════
  DELETE /v1/me
  Server:
    ├─ Soft-delete: users.deleted_at = NOW()
    ├─ Revoke all refresh tokens (DELETE FROM refresh_tokens WHERE user_id)
    ├─ Publish identity.user.deleted.v1 event via outbox
    └─ Downstream: activity, messaging, discover cascade soft-delete

ROLES
═════
  user    — authenticated end user (default)
  provider — business owner (granted after verification)
  admin   — moderation panel access (granted manually)

  Stored in identity.roles, included in JWT sub claim.
  @Roles() decorator on controllers enforces role requirements.
```

---

## 10. Background Jobs

All jobs run via BullMQ, backed by Redis. Workers are registered in apps/api.

| Job name                   | Queue              | Schedule / Trigger     | Description                                         |
|----------------------------|--------------------|------------------------|-----------------------------------------------------|
| `outbox-relay`             | `platform`         | Repeatable, every 500ms| Polls platform.outbox, publishes to domain-events queue |
| `otp-cleanup`              | `identity`         | Repeatable, every 1hr  | Removes expired OTP entries from Redis             |
| `session-cleanup`          | `identity`         | Repeatable, every 6hr  | Removes revoked refresh tokens past expiry         |
| `push-notification`        | `notifications`    | On event               | Sends FCM push via adapters/push-fcm               |
| `whatsapp-send`            | `messaging`        | On inquiry reply       | Forwards reply via WhatsApp Cloud API              |
| `media-process`            | `media`            | On upload              | Strips EXIF GPS, generates thumbnail (sharp)       |
| `assistant-usage-reset`    | `assistant`        | Repeatable, midnight   | Clears daily usage counter in Redis                |
| `insights-aggregate`       | `insights`         | Repeatable, every 4hr  | Aggregates price/crowding reports into summaries   |
| `discover-trending`        | `discover`         | Repeatable, every 1hr  | Updates trending posts / hashtags score            |
| `notification-batch`       | `notifications`    | Repeatable, every 5min | Batches pending notifications to avoid spam        |
| `provider-badge-refresh`   | `providers`        | On provider.verified   | Refreshes verified badge in mobile cache key       |

Worker concurrency: 5 per queue (configurable via env). Failed jobs retry 3× with exponential backoff (2s, 8s, 32s), then go to the failed queue for inspection.

---

## 11. External Service Integrations

All external services are accessed through interfaces defined in `packages/contracts`. Real implementations live in `adapters/`. In-memory fakes live in `packages/testing`. Environment variables enable real vs. fake (see `docs/milestones/MOCKS.md`).

### 11.1 Claude API (LLM)

```
Interface:   LlmClient (packages/contracts/src/assistant.ts)
Adapter:     adapters/llm-anthropic
Mock:        packages/testing/src/fakes/llm.ts

LlmClient.chat(messages, tools, systemPrompt) → AsyncIterable<LlmChunk>

Model configured via: ASSISTANT_MODEL (e.g. claude-3-5-haiku-20241022)
Auth: ANTHROPIC_API_KEY header
Rate limit: ASSISTANT_DAILY_LIMIT_PER_USER messages/day per user
Streaming: uses SSE passthrough to mobile

Tools the assistant can call:
  - searchPlaces({ query, lat, lng, radius })
  - getPlaceDetail({ placeId })
  - getInsights({ placeId })
  - searchProviders({ query, city })
  - getCurrentConditions({ placeId })
```

### 11.2 WhatsApp Cloud API

```
Interface:   MessagingChannel (packages/contracts/src/messaging.ts)
Adapter:     adapters/whatsapp-cloud
Mock:        in-memory (no real sends without WHATSAPP_ACCESS_TOKEN)

Outbound:
  POST https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
  Auth: WHATSAPP_ACCESS_TOKEN
  Template: WHATSAPP_TEMPLATE_NAME

Inbound webhooks:
  POST /v1/webhooks/whatsapp
  Verification: WHATSAPP_WEBHOOK_VERIFY_TOKEN (GET)
  Signature:    WHATSAPP_APP_SECRET (X-Hub-Signature-256)
```

### 11.3 Firebase Cloud Messaging (FCM)

```
Interface:   PushSender (packages/contracts/src/notifications.ts)
Adapter:     adapters/push-fcm
Mock:        packages/testing/src/fakes/push.ts

Auth: service account JSON at FCM_SERVICE_ACCOUNT_JSON_PATH
      (path to file outside repo, loaded at startup)
API:  FCM HTTP v1 (googleapis)
PUSH_PROVIDER=fcm to enable; PUSH_PROVIDER=fake for dev/test
```

### 11.4 S3-Compatible Storage

```
Interface:   ObjectStorage (packages/contracts/src/media.ts)
Adapter:     adapters/storage-s3
Local dev:   FileObjectStorage (packages/testing) — writes to local disk

Env vars: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
Compatible with: AWS S3, Cloudflare R2, MinIO, Backblaze B2
STORAGE_TYPE=s3 to enable; STORAGE_TYPE=file for dev/test
```

### 11.5 Valhalla (Routing Engine)

```
Interface:   RoutingEngine (packages/contracts/src/routing.ts)
Adapter:     adapters/routing-valhalla (in geo-services)
Mock:        packages/testing/src/fakes/routing.ts

VALHALLA_URL= URL of Valhalla HTTP API
Costing models: auto, pedestrian, bicycle
Input: origin/destination as lat/lng pairs
Output: GeoJSON LineString + maneuvers (Arabic turn instructions)
```

### 11.6 Photon (Geocoding)

```
Interface:   GeocoderClient (packages/contracts/src/geocoding.ts)
Adapter:     PostGIS full-text search (ADR-0005: Photon deferred)
Mock:        packages/testing/src/fakes/geocoder.ts

PHOTON_URL= when real Photon is available
Fallback: PostGIS pg_trgm similarity search on osm_places.name_ar/name_en
```

---

*End of Architecture Deep Dive. For module-by-module details see `docs/MODULES.md`.*
