# Iraq Smart Maps — Module Reference

> Version: 1.0 · Last updated: 2026-10-16
> One entry per backend domain module. All modules live under `modules/`.
> Cross-module interfaces live in `packages/contracts/src/`.

---

## Module Index

| Module           | Schema           | Status     | Brief purpose                                   |
|------------------|------------------|------------|-------------------------------------------------|
| identity         | identity         | Active      | Auth, users, OTP, JWT, roles                   |
| providers        | providers        | Active      | Business registration, verification             |
| places           | places           | Active      | OSM place import, search, reviews               |
| routing          | routing          | Active      | Turn-by-turn navigation via Valhalla            |
| geocoding        | geocoding        | Active      | Address search (PostGIS + Photon)               |
| insights         | insights         | Active      | Crowd-sourced prices and crowding               |
| assistant        | assistant        | Active      | Claude-powered AI travel assistant              |
| messaging        | messaging        | Active      | User ↔ provider inquiry system                 |
| discover         | discover         | Active      | Social feed, posts, likes, comments             |
| media            | media            | Active      | Photo upload, storage, CDN serving              |
| activity         | activity         | Active      | Per-user activity/notification feed             |
| notifications    | notifications    | Active      | FCM push dispatch                               |
| reviews          | (places schema)  | Active      | Place reviews and star ratings                  |
| moderation       | discover schema  | Active      | Report handling, admin moderation panel         |
| analytics        | (internal)       | Active      | Admin metrics dashboard                         |
| appointments     | appointments     | Reserved    | Future: booking/appointment system              |
| listings         | listings         | Reserved    | Future: product/service listings                |
| challenges       | challenges       | Reserved    | Future: gamification                            |
| promotions       | promotions       | Reserved    | Future: promoted places/posts                   |
| reputation       | reputation       | Reserved    | Future: trust/reputation scores                 |
| tour3d           | tour3d           | Reserved    | Future: 3D tour of historical sites             |
| location-share   | (identity schema)| Reserved    | Future: real-time location sharing              |
| incidents        | incidents        | Partial     | Road incidents / place closures                 |
| search           | (places schema)  | Active      | Unified search combining places + providers     |
| social           | (discover schema)| Active      | Follow graph                                    |
| payments         | payments         | Reserved    | Future: payment integration                     |

---

## 1. identity

### What it does

Handles everything related to user identity: phone-based OTP login, JWT issuance and refresh, role
management (user / provider / admin), account preferences, soft-deletion with downstream cleanup,
and the referral system. Phone numbers are stored AES-GCM encrypted; a separate HMAC hash is used
for O(1) lookup without ever storing plaintext. Tokens are short-lived (15 min access, 30 day
refresh) with rotation on each refresh.

### Ports it provides

| Port interface     | Method(s)                                  | Used by                        |
|--------------------|--------------------------------------------|--------------------------------|
| `AuthPort`         | `requestOtp`, `verifyOtp`, `refresh`       | apps/api (AuthController)      |
| `MePort`           | `getMe`, `updateMe`, `deleteMe`            | apps/api (MeController)        |
| `UsersPort`        | `findById`, `findByPhoneHash`, `grantRole` | providers, assistant (internal)|

### Ports it consumes

| Port interface | Implementation             | Purpose                       |
|----------------|----------------------------|-------------------------------|
| `OtpSender`    | adapters/sms or console    | Deliver 6-digit OTP via SMS   |

### Events it emits (via outbox)

| Event name                      | Payload fields                     | When                        |
|---------------------------------|------------------------------------|------------------------------|
| `identity.user.registered.v1`  | `{ userId, locale }`               | First successful OTP verify  |
| `identity.user.deleted.v1`     | `{ userId }`                       | DELETE /v1/me                |

### Events it listens to

None.

### DB schema: `identity`

Tables: `users`, `roles`, `refresh_tokens`, `preferences`

### ENV vars

| Variable               | Required | Description                                          |
|------------------------|----------|------------------------------------------------------|
| `JWT_ACCESS_SECRET`    | Yes      | HS256 signing secret for access tokens (≥32 chars)  |
| `JWT_REFRESH_SECRET`   | Yes      | HS256 signing secret for refresh tokens (≥32 chars) |
| `PHONE_ENCRYPTION_KEY` | Yes      | Base64-encoded 32-byte AES-GCM key                   |
| `PHONE_HASH_KEY`       | Yes      | HMAC key for phone lookup hash                       |
| `OTP_SENDER`           | Yes      | `sms` \| `console` \| `fixed` \| `fake`             |
| `OTP_FIXED_CODE`       | e2e only | Used with `OTP_SENDER=fixed`                        |
| `SMS_PROVIDER_API_KEY` | prod     | API key for SMS gateway                              |

---

## 2. providers

### What it does

Manages business registration on the platform. A provider is a user who claims ownership of an
existing OSM place. After submitting registration details (name, phone, hours, links), an admin
reviews and approves or rejects the claim. Approved providers get the `provider` role via
identity.grantRole and can respond to messaging inquiries. Providers can update their profile,
hours, and linked social pages. A verified badge is shown in the app after admin approval.

### Ports it provides

| Port interface          | Method(s)                                          | Used by                       |
|-------------------------|----------------------------------------------------|-------------------------------|
| `ProvidersPort`         | `getByOsmId`, `getByUserId`, `getByProviderIds`    | assistant, messaging, places  |
| `AdminProvidersPort`    | `list`, `approve`, `reject`, `suspend`             | apps/admin                    |

### Ports it consumes

| Port interface    | Implementation              | Purpose                              |
|-------------------|-----------------------------|--------------------------------------|
| `ObjectStorage`   | adapters/storage-s3         | Store provider logo / cover photo    |
| `UsersPort`       | modules/identity            | Grant `provider` role on approval    |

### Events it emits

| Event name                    | Payload fields              | When                          |
|-------------------------------|-----------------------------|------------------------------ |
| `provider.registered.v1`     | `{ providerId, userId, osmId }` | Registration submitted    |
| `provider.verified.v1`       | `{ providerId, userId }`    | Admin approves registration   |

### Events it listens to

None.

### DB schema: `providers`

Tables: `providers`, `provider_hours`, `provider_links`

### ENV vars

None beyond core DATABASE_URL and the ObjectStorage vars (S3_*).

---

## 3. places

### What it does

The central registry of all places in the city. Data comes from two sources: (1) OpenStreetMap
data imported via `modules/places/src/import.ts` into `places.osm_places`, and (2) enrichment
added by providers and users (photos, reviews, price reports). Search uses PostGIS spatial queries
combined with pg_trgm Arabic text similarity. The module exposes both a REST API for mobile search
and a CLI command for the OSM import pipeline. OSM data is kept strictly separate from
provider-owned data per ODbL license requirements.

### Ports it provides

| Port interface   | Method(s)                                          | Used by                        |
|------------------|----------------------------------------------------|--------------------------------|
| `PlacesPort`     | `search`, `getById`, `getByOsmId`, `listByCity`    | assistant, messaging, insights |
| `ReviewsPort`    | `addReview`, `listReviews`, `getAggregated`        | apps/api (ReviewsController)   |
| `TilesPort`      | `getTileUrl`                                       | mobile-features/map            |

### Ports it consumes

| Port interface    | Implementation             | Purpose                              |
|-------------------|----------------------------|--------------------------------------|
| `GeocoderClient`  | PostGIS / Photon           | Reverse-geocode imported places      |

### Events it emits

None currently. Future: `places.place.verified.v1` when provider claim approved.

### Events it listens to

| Event                         | Handler                                            |
|-------------------------------|----------------------------------------------------|
| `media.asset.uploaded.v1`    | Links asset to place when `osm_id` present in asset|
| `provider.verified.v1`       | Sets `has_provider = true` flag on osm_places      |

### DB schema: `places`

Tables: `osm_places`, `place_tags`, `collections`, `collection_items`, `cities`
Reviews table is in this schema: `reviews`, `review_media`

### ENV vars

| Variable        | Required | Description                                                    |
|-----------------|----------|----------------------------------------------------------------|
| `TILES_SOURCE`  | No       | PMTiles file path or URL; `{city}` replaced with city slug    |
| `GLYPHS_SOURCE` | No       | Glyph server path or URL for map label rendering              |

---

## 4. routing

### What it does

Provides turn-by-turn navigation between two geographic coordinates. Delegates path-finding to
a Valhalla instance (HTTP API). Returns a GeoJSON LineString for map overlay plus a list of
maneuvers with Arabic instructions, distance, and duration. Supports car, walking, and bicycle
costing models. The module caches results in Redis for 2 minutes to avoid repeated Valhalla
calls for the same origin/destination pair. Maneuver types are a closed enum (ADR-0006).

### Ports it provides

| Port interface  | Method(s)                                  | Used by                        |
|-----------------|--------------------------------------------|--------------------------------|
| `RoutingPort`   | `getRoute(origin, destination, mode)`      | apps/api (RoutesController)    |

### Ports it consumes

| Port interface    | Implementation               | Purpose                     |
|-------------------|------------------------------|-----------------------------|
| `RoutingEngine`   | adapters/routing-valhalla    | Path calculation            |

### Events it emits

None.

### Events it listens to

None.

### DB schema

No persistent schema. Route results are ephemeral (Redis TTL only).

### ENV vars

| Variable       | Required | Description                          |
|----------------|----------|--------------------------------------|
| `VALHALLA_URL` | No       | Valhalla HTTP endpoint; fake if unset|

---

## 5. geocoding

### What it does

Converts text queries to geographic coordinates (forward geocoding) and coordinates to place
names (reverse geocoding). Per ADR-0005, the primary implementation uses PostGIS pg_trgm
similarity on `places.osm_places` to avoid a dependency on an external Photon server during
MVP development. When `PHOTON_URL` is set, the real Photon adapter is used instead. The module
normalizes Arabic input (removes diacritics, normalises hamza forms) before search using
`packages/i18n/src/normalize`.

### Ports it provides

| Port interface    | Method(s)                              | Used by                         |
|-------------------|----------------------------------------|---------------------------------|
| `GeocoderPort`    | `forward(query, near?)`, `reverse(lat,lng)` | assistant tools, mobile search |

### Ports it consumes

| Port interface    | Implementation              | Purpose                         |
|-------------------|-----------------------------|----------------------------------|
| `GeocoderClient`  | PostGIS pg_trgm or Photon   | Actual geocoding                 |

### Events it emits / listens to

None.

### DB schema

Uses `places` schema read-only. No geocoding-specific tables.

### ENV vars

| Variable     | Required | Description                                    |
|--------------|----------|------------------------------------------------|
| `PHOTON_URL` | No       | Photon search server URL; PostGIS used if unset|

---

## 6. insights

### What it does

Collects and aggregates crowd-sourced data points: price reports for menu items / services, and
crowding level observations. All data points carry `source`, `observedAt`, and `confidence` fields
as required by the no-invented-data rule. Aggregated summaries are refreshed every 4 hours by a
background job. The assistant tools consume this module to answer "how busy is X?" or
"what does Y cost?" questions. The mobile UI shows a report button on place cards.

### Ports it provides

| Port interface   | Method(s)                                       | Used by                        |
|------------------|-------------------------------------------------|--------------------------------|
| `InsightsPort`   | `getPrices(placeId)`, `getCrowding(placeId)`,   | assistant tools, place cards   |
|                  | `reportPrice(...)`, `reportCrowding(...)`        | apps/api (InsightsController)  |

### Ports it consumes

None (reads places schema directly for place validation).

### Events it emits

None currently.

### Events it listens to

None.

### DB schema: `insights`

Tables: `price_reports`, `crowding_reports`, `price_aggregates`, `crowding_aggregates`
Each row: `id, place_id, reporter_id, value, source, observed_at, confidence, created_at`

### ENV vars

None beyond DATABASE_URL.

---

## 7. assistant

### What it does

Powers the AI travel and business assistant. Uses the Claude API (via `LlmClient`) with a curated
set of tools that can search places, get insights, look up provider info, and retrieve current
conditions. Maintains a thread/message history per user. Enforces a daily message limit
(`ASSISTANT_DAILY_LIMIT_PER_USER`) tracked in Redis. Streaming responses are proxied as SSE to
mobile. The assistant may only mention places and data returned by its own tool calls — it is
not allowed to hallucinate place details (enforced via system prompt). Per ADR-0010, the LLM
never sees raw phone numbers or personal data from identity.

### Ports it provides

| Port interface     | Method(s)                                        | Used by                         |
|--------------------|--------------------------------------------------|---------------------------------|
| `AssistantPort`    | `chat(userId, threadId, message)` → AsyncIterable| apps/api (AssistantController)  |
|                    | `listThreads(userId)`, `clearThread(threadId)`   |                                 |

### Ports it consumes

| Port interface    | Implementation              | Purpose                          |
|-------------------|-----------------------------|----------------------------------|
| `LlmClient`       | adapters/llm-anthropic      | Claude API chat/tool calls       |
| `PlacesPort`      | modules/places              | Tool: search places              |
| `InsightsPort`    | modules/insights            | Tool: get prices/crowding        |
| `ProvidersPort`   | modules/providers           | Tool: get provider info          |

### Events it emits

None.

### Events it listens to

None.

### DB schema: `assistant`

Tables: `threads`, `messages`, `usage`

### ENV vars

| Variable                       | Required | Description                                    |
|--------------------------------|----------|------------------------------------------------|
| `ANTHROPIC_API_KEY`            | Yes      | Claude API key                                 |
| `ASSISTANT_MODEL`              | Yes      | Model ID, e.g. `claude-3-5-haiku-20241022`     |
| `ASSISTANT_DAILY_LIMIT_PER_USER` | No     | Max messages per user per day (default: 20)    |

---

## 8. messaging

### What it does

The inquiry system that lets users send questions or booking requests to providers. A user can
send an inquiry referencing one or more place IDs; the provider receives it in their inbox and
can reply through the app or (if configured) via WhatsApp. Inquiries have a status lifecycle:
`open → replied → closed`. Each user is limited to `MESSAGING_DAILY_LIMIT_PER_USER` new
inquiries per day. The WhatsApp channel is optional — if `WHATSAPP_ACCESS_TOKEN` is not set,
the system uses an in-memory fake that logs instead of sending. Inbound WhatsApp replies
arrive via a signed webhook.

### Ports it provides

| Port interface       | Method(s)                                        | Used by                           |
|----------------------|--------------------------------------------------|-----------------------------------|
| `MessagingUserPort`  | `sendInquiry`, `listInquiries`, `getInquiry`     | apps/api (MessagesController)     |
|                      | `markRead`                                       |                                   |
| `MessagingProviderPort` | `listProviderInbox`, `reply`, `closeInquiry` | apps/api (ProviderInboxController)|

### Ports it consumes

| Port interface      | Implementation              | Purpose                             |
|---------------------|-----------------------------|-------------------------------------|
| `MessagingChannel`  | adapters/whatsapp-cloud     | Forward provider replies via WA     |
| `ProvidersPort`     | modules/providers           | Validate provider exists            |

### Events it emits

| Event name                          | Payload                                      | When                        |
|-------------------------------------|----------------------------------------------|-----------------------------|
| `messaging.inquiry.received.v1`    | `{ inquiryId, userId, placeIds }`            | New inquiry created         |
| `messaging.reply.received.v1`      | `{ inquiryId, replyId, fromProviderId }`     | Provider submits reply      |

### Events it listens to

None.

### DB schema: `messaging`

Tables: `inquiries`, `replies`, `read_receipts`

### ENV vars

| Variable                         | Required | Description                               |
|----------------------------------|----------|-------------------------------------------|
| `MESSAGING_DAILY_LIMIT_PER_USER` | No       | Default: 10                               |
| `WHATSAPP_ACCESS_TOKEN`          | No       | Enables real WhatsApp sends               |
| `WHATSAPP_PHONE_NUMBER_ID`       | No       | Sender phone number ID                    |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`  | No       | Webhook verification token                |
| `WHATSAPP_APP_SECRET`            | No       | Inbound webhook signature validation      |
| `WHATSAPP_TEMPLATE_NAME`         | No       | Message template name                     |

---

## 9. discover

### What it does

The social feed module. Users create posts with text and up to 4 photos, optionally tagged to a
place. Other users can like, comment, and share posts. A follow graph controls whose posts appear
in the personalized feed. Posts can be pinned by providers on their profile. Admins can remove
posts flagged by reports. Hashtags are extracted automatically from post body and indexed for
discovery. Trending posts are recomputed every hour. All moderation decisions are logged for
audit. Users can delete their own posts (with confirmation) and their own comments.

### Ports it provides

| Port interface   | Method(s)                                             | Used by                       |
|------------------|-------------------------------------------------------|-------------------------------|
| `DiscoverPort`   | `createPost`, `listFeed`, `getPost`, `likePost`,      | apps/api (DiscoverController) |
|                  | `addComment`, `followUser`, `unfollowUser`,            |                               |
|                  | `reportPost`, `deletePost`, `editPost`                |                               |

### Ports it consumes

| Port interface  | Implementation          | Purpose                          |
|-----------------|-------------------------|----------------------------------|
| `ObjectStorage` | adapters/storage-s3     | Store post photos (via media)    |

### Events it emits

| Event name                         | Payload                                          | When                           |
|------------------------------------|--------------------------------------------------|--------------------------------|
| `discover.post.liked.v1`          | `{ postId, postAuthorId, likedByUserId }`        | User likes a post              |
| `discover.post.commented.v1`      | `{ postId, postAuthorId, commentedByUserId }`    | User comments on a post        |
| `discover.post.mentioned.v1`      | `{ postId, postAuthorId, mentionedUserId }`      | @mention in post body          |
| `discover.user.followed.v1`       | `{ followerId, followeeId }`                     | User follows another user      |

### Events it listens to

| Event                       | Handler                                              |
|-----------------------------|------------------------------------------------------|
| `identity.user.deleted.v1` | Soft-delete all posts and comments by deleted user  |

### DB schema: `discover`

Tables: `posts`, `post_media`, `likes`, `comments`, `follows`, `reports`, `hashtags`

### ENV vars

None beyond DATABASE_URL and S3 vars.

---

## 10. media

### What it does

Handles all file uploads: place photos, post images, provider logos. Validates MIME type and size
on ingestion, strips GPS metadata from EXIF using sharp, generates thumbnails, and stores files
via `ObjectStorage`. In development, `FileObjectStorage` writes to local disk. In production,
files go to S3-compatible storage. Signed URLs with HMAC (`MEDIA_SIGNING_SECRET`) protect private
assets. The module does not serve files directly — the CDN or S3 pre-signed URLs handle delivery.

### Ports it provides

| Port interface | Method(s)                                          | Used by                        |
|----------------|-----------------------------------------------------|-------------------------------|
| `MediaPort`    | `upload(stream, options)`, `getUrl(assetId)`,       | places, discover, providers   |
|                | `delete(assetId)`, `linkToPlace(assetId, osmId)`    |                               |

### Ports it consumes

| Port interface  | Implementation         | Purpose                        |
|-----------------|------------------------|--------------------------------|
| `ObjectStorage` | adapters/storage-s3    | Persist bytes to object store  |

### Events it emits

| Event name                 | Payload                             | When              |
|----------------------------|-------------------------------------|-------------------|
| `media.asset.uploaded.v1` | `{ assetId, uploaderId, osmId? }`  | Upload complete   |

### Events it listens to

None.

### DB schema: `media`

Tables: `assets`

### ENV vars

| Variable              | Required | Description                                       |
|-----------------------|----------|---------------------------------------------------|
| `STORAGE_TYPE`        | No       | `file` (default dev) or `s3`                     |
| `S3_ENDPOINT`         | s3 only  | S3-compatible endpoint URL                        |
| `S3_BUCKET`           | s3 only  | Bucket name                                       |
| `S3_ACCESS_KEY_ID`    | s3 only  | Access key                                        |
| `S3_SECRET_ACCESS_KEY`| s3 only  | Secret key                                        |
| `S3_REGION`           | No       | Region (default: `auto` for Cloudflare R2)        |
| `MEDIA_SIGNING_SECRET`| dev      | HMAC secret for FileObjectStorage signed URLs     |
| `MEDIA_MAX_BYTES`     | No       | Upload size limit in bytes (default: 10485760)    |

---

## 11. activity

### What it does

Maintains a per-user activity feed showing social interactions: likes on their posts, comments,
follows, and inquiry status changes. Items are appended by BullMQ workers that listen to domain
events. The mobile app polls GET /v1/activity on a 30-second interval when in the foreground.
Read/unread state is tracked. Items are soft-deleted when the source user deletes their account.
The module also tracks inquiry activity for the "My Inquiries" list with status badges.

### Ports it provides

| Port interface  | Method(s)                                      | Used by                         |
|-----------------|------------------------------------------------|---------------------------------|
| `ActivityPort`  | `listItems(userId, cursor)`, `markRead(ids)`   | apps/api (ActivityController)   |
|                 | `getUnreadCount(userId)`                       | apps/api (badge endpoint)       |

### Ports it consumes

None (reads own schema).

### Events it emits

None.

### Events it listens to

| Event                               | Handler                                  |
|-------------------------------------|------------------------------------------|
| `discover.post.liked.v1`           | Insert activity item for post author     |
| `discover.post.commented.v1`       | Insert activity item for post author     |
| `discover.post.mentioned.v1`       | Insert activity item for mentioned user  |
| `discover.user.followed.v1`        | Insert activity item for followee        |
| `messaging.inquiry.received.v1`    | Insert activity item for provider        |
| `messaging.reply.received.v1`      | Insert activity item for inquiry sender  |
| `identity.user.deleted.v1`         | Soft-delete items where actor = userId   |

### DB schema: `activity`

Tables: `items`

### ENV vars

None.

---

## 12. notifications

### What it does

Translates domain events into push notifications delivered via Firebase Cloud Messaging (FCM).
Device tokens are registered when the mobile app starts (POST /v1/notifications/register).
Notification batching (every 5 minutes) prevents spamming users with rapid-fire events.
Per ADR-0007, notification fan-out is handled asynchronously through BullMQ so the API
response is never delayed. When `PUSH_PROVIDER=fake`, notifications are logged to stdout only.

### Ports it provides

| Port interface        | Method(s)                                    | Used by                           |
|-----------------------|----------------------------------------------|-----------------------------------|
| `NotificationsPort`   | `registerDevice(userId, token, platform)`    | apps/api (NotificationsController)|
|                       | `unregisterDevice(userId, token)`            |                                   |

### Ports it consumes

| Port interface | Implementation     | Purpose                      |
|----------------|--------------------|------------------------------|
| `PushSender`   | adapters/push-fcm  | Deliver FCM push messages    |

### Events it emits

None.

### Events it listens to

| Event                               | Handler                                         |
|-------------------------------------|-------------------------------------------------|
| `messaging.inquiry.received.v1`    | Push to provider: "رسالة جديدة من مستخدم"      |
| `messaging.reply.received.v1`      | Push to user: "رد جديد من مزود الخدمة"         |
| `discover.post.liked.v1`           | Push to post author: "أحب شخص ما منشورك"       |
| `discover.post.commented.v1`       | Push to post author: "علّق شخص على منشورك"     |
| `discover.user.followed.v1`        | Push to followee: "متابع جديد"                 |

### DB schema: `notifications`

Tables: `device_tokens`, `sent`

### ENV vars

| Variable                   | Required | Description                                    |
|----------------------------|----------|------------------------------------------------|
| `PUSH_PROVIDER`            | No       | `fake` (default) or `fcm`                     |
| `FCM_SERVICE_ACCOUNT_JSON_PATH` | fcm | Path to service account JSON file             |

---

## 13. reviews

### What it does

User reviews for places: star rating (1–5) and optional text. Each user can submit one review
per place. Aggregate rating (average stars, total count) is precomputed on write and cached
on the `osm_places` row for fast retrieval. Review text is moderated: users can report reviews,
and admins can remove them from the admin panel. Reviews are linked to the `places` schema
directly (no separate schema required).

### Ports it provides

| Port interface | Method(s)                                         | Used by                       |
|----------------|---------------------------------------------------|-------------------------------|
| `ReviewsPort`  | `addReview`, `updateReview`, `listByPlace`,        | apps/api, assistant tools     |
|                | `getAggregated(placeId)`, `deleteReview`           |                               |

### Ports it consumes

None.

### Events it emits

None currently.

### Events it listens to

| Event                       | Handler                                    |
|-----------------------------|--------------------------------------------|
| `identity.user.deleted.v1` | Anonymise reviews by deleted user          |

### DB schema

Uses `places` schema. Tables: `reviews`, `review_media`

### ENV vars

None.

---

## 14. moderation (admin)

### What it does

Backend support for the admin panel (`apps/admin`). Exposes `X-Admin-Key` protected endpoints
for listing and acting on reported posts, pending provider registrations, and flagged reviews.
All moderation actions are append-only logged. The module does not have its own database schema —
it reads from `discover`, `providers`, and `places` schemas via their respective service ports.
The admin panel is a Vite React SPA that calls these endpoints directly.

### Ports it provides

| Port interface    | Method(s)                                             | Used by        |
|-------------------|-------------------------------------------------------|----------------|
| `AdminPort`       | `listPendingProviders`, `approveProvider`,            | apps/admin     |
|                   | `rejectProvider`, `listReportedPosts`,                |                |
|                   | `removePost`, `restorePost`, `getMetrics`             |                |

### Ports it consumes

| Interface         | Module        | Purpose                              |
|-------------------|---------------|--------------------------------------|
| `ProvidersPort`   | providers     | Provider status management           |
| `DiscoverPort`    | discover      | Post moderation                      |
| `PlacesPort`      | places        | Place lookup for moderation context  |

### ENV vars

| Variable     | Required | Description                                  |
|--------------|----------|----------------------------------------------|
| `ADMIN_KEY`  | No       | Enables /v1/admin/* endpoints if set         |
| `VITE_API_URL`    | admin app | Backend URL for admin panel            |
| `VITE_ADMIN_KEY`  | admin app | Admin key for admin panel API calls    |

---

## 15. incidents

### What it does

Allows users to report road incidents (accidents, closures, hazards) and place closures (temporary
shutdown, flooding). Incidents are time-bounded: each has a `reported_at` and an optional
`expires_at`. The routing module may optionally consult active incidents when planning routes
(future integration). Mobile shows incident markers on the map.

### Ports it provides

| Port interface   | Method(s)                                    | Used by                     |
|------------------|----------------------------------------------|-----------------------------|
| `IncidentsPort`  | `report`, `listActive(bbox)`, `dismiss(id)` | apps/api (IncidentsController)|

### Events it emits / listens to

None currently.

### DB schema: `incidents`

Tables: `incidents`

### ENV vars

None.

---

## 16–20. Reserved modules

The following modules have contracts defined in `packages/contracts` and placeholder directories,
but contain no business logic in the current release. They are reserved for future milestones.

| Module        | Planned purpose                                            |
|---------------|------------------------------------------------------------|
| appointments  | Book appointments with providers (e.g. clinics, salons)    |
| listings      | Provider-owned product/service catalogue with prices       |
| challenges    | Gamification: earn badges for contributing data            |
| promotions    | Paid promoted place cards and posts                        |
| reputation    | Aggregated trust score from reviews, activity, verifications|
| tour3d        | 3D walkthrough of historical sites (future phase)          |
| location-share| Real-time location sharing between users (future phase)    |

---

*End of module reference. For the full HTTP contract see `docs/API_COMPLETE.md`.
For event schemas see `packages/contracts/src/events.ts`.*
