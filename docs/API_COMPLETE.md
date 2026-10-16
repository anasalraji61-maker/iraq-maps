# Iraq Smart Maps — Complete API Reference

> **Version:** v1 (current)  
> **Base URL:** `https://api.iraq-maps.app` (production) · `http://localhost:3000` (local dev)  
> **Protocol:** HTTPS only in production. All endpoints use JSON (`Content-Type: application/json`) unless noted.  
> **Language:** Arabic is the primary locale. Pass `lang=ar` (default), `lang=ckb` (Kurdish Sorani), or `lang=en`.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Common Patterns](#common-patterns)
3. [Error Format](#error-format)
4. [Rate Limiting](#rate-limiting)
5. [Pagination](#pagination)
6. [Cities & Tiles](#cities--tiles)
7. [Places & Search](#places--search)
8. [Geocoding](#geocoding)
9. [Routing & Navigation](#routing--navigation)
10. [Incidents](#incidents)
11. [Providers](#providers)
12. [Media](#media)
13. [Messaging & Inquiries](#messaging--inquiries)
14. [Notifications](#notifications)
15. [Assistant](#assistant)
16. [Insights](#insights)
17. [Discover (Social Feed)](#discover-social-feed)
18. [Reviews](#reviews)
19. [Reputation](#reputation)
20. [Listings & Marketplace](#listings--marketplace)
21. [Payments & Wallet](#payments--wallet)
22. [Appointments](#appointments)
23. [Tour 3D](#tour-3d)
24. [WebSocket Events](#websocket-events)
25. [Identity & Auth Endpoints](#identity--auth-endpoints)

---

## Authentication

All protected endpoints require a JWT Bearer token issued by the identity module.

```
Authorization: Bearer <jwt>
```

The JWT payload contains:

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | UUID | User ID (`UserId`) |
| `role` | string | `user` · `provider` · `moderator` · `admin` |
| `exp` | number | Unix timestamp when the token expires |
| `iat` | number | Unix timestamp when the token was issued |

**Token lifetime:** access tokens expire in 15 minutes. Refresh tokens are valid for 30 days and are stored in an HTTP-only cookie.

### OTP Login Flow

Iraq Smart Maps uses phone-number OTP (SMS). No passwords.

```
POST /v1/auth/otp/request
POST /v1/auth/otp/verify
POST /v1/auth/token/refresh
DELETE /v1/auth/sessions (logout)
```

Phone numbers must be Iraqi mobile numbers in E.164 format: `+9647xxxxxxxxx`. The client normalises `07xx` input before sending.

---

## Common Patterns

### IDs

All IDs are UUIDs unless stated otherwise.

| ID Type | Example | Notes |
|---------|---------|-------|
| `UserId` | `"550e8400-e29b-41d4-a716-446655440000"` | UUID v4 |
| `PlaceId` | `"node/12345678"` or `"p<providerId>"` | OSM node/way/relation ref, or `p<uuid>` for provider places |
| `CityId` | `"baghdad"` | kebab-case lowercase |
| `InquiryId` | `"550e8400-..."` | UUID v4 |

### Timestamps

All timestamps are ISO 8601 strings in UTC: `"2026-10-16T09:00:00.000Z"`.

### Locale

```
lang=ar   (default) Arabic
lang=ckb  Kurdish Sorani
lang=en   English
```

### Coordinates

`LngLat` is a JSON array: `[longitude, latitude]` — longitude first, matching GeoJSON convention.

```json
[44.3661, 33.3152]
```

### Bounding Box

`BBox` is `[west, south, east, north]`:

```json
[44.20, 33.25, 44.55, 33.45]
```

---

## Error Format

All errors follow RFC 9457 Problem Details:

```json
{
  "type": "about:blank",
  "title": "Validation error",
  "status": 400,
  "code": "validation_error",
  "detail": "placeIds must have at least 1 element"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | URI identifying the error type. `about:blank` for generic errors. |
| `title` | string | Human-readable summary (English) |
| `status` | integer | HTTP status code |
| `code` | string | Stable machine-readable key for i18n on the client |
| `detail` | string? | Additional context |

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `validation_error` | 400 | Request body or query params failed zod validation |
| `unauthorized` | 401 | Missing or expired JWT |
| `forbidden` | 403 | Valid JWT but insufficient role |
| `not_found` | 404 | Entity does not exist or is not visible to this user |
| `conflict` | 409 | Idempotency key reused with different body |
| `daily_limit_exceeded` | 429 | Per-user daily rate limit hit |
| `too_many_requests` | 429 | Server-side rate limit (includes `retryAfterMs`) |
| `internal_error` | 500 | Unexpected server error |
| `routing_unavailable` | 503 | Valhalla engine timeout or down |
| `no_route` | 404 | No route found between given points |

---

## Rate Limiting

Rate limits are per user (by JWT `sub`) unless noted.

| Endpoint group | Limit | Window |
|----------------|-------|--------|
| OTP request | 5 | 10 minutes |
| Place search | 120 | 1 minute |
| Nearby search | 60 | 1 minute |
| Route calculation | 30 | 1 minute |
| Inquiry creation | 10 | 24 hours |
| Assistant chat | 50 messages | 24 hours |
| Post creation | 20 | 24 hours |
| Review creation | 5 | 24 hours |
| Media upload | 50 assets | 24 hours |

When a rate limit is hit the response is `429` with header `Retry-After: <seconds>` and body:

```json
{
  "type": "about:blank",
  "title": "Rate limit exceeded",
  "status": 429,
  "code": "too_many_requests",
  "retryAfterMs": 3600000
}
```

---

## Pagination

All list endpoints use **cursor-based pagination**. The cursor is an opaque string — do not parse or construct it.

### Request

```
GET /discover/feed?limit=10&cursor=<opaque>
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 10–20 | Items per page. Max varies by endpoint (see each section). |
| `cursor` | string? | — | Omit for the first page. Use `nextCursor` from the previous response. |

### Response

```json
{
  "items": [ ... ],
  "nextCursor": "eyJpZCI6IjEyMzQifQ"
}
```

`nextCursor` is `null` (or absent) when there are no more pages.

---

## Cities & Tiles

### List Cities

Returns all supported cities with their tile and glyph URLs.

```
GET /cities
Authorization: (none required)
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "baghdad",
      "nameAr": "بغداد",
      "nameCkb": "بەغدا",
      "nameEn": "Baghdad",
      "center": [44.3661, 33.3152],
      "bbox": [44.20, 33.25, 44.55, 33.45],
      "tilesUrl": "pmtiles://https://cdn.iraq-maps.app/tiles/baghdad.pmtiles",
      "glyphsUrl": "https://cdn.iraq-maps.app/fonts/{fontstack}/{range}.pbf",
      "attribution": "© OpenStreetMap contributors",
      "satellite": {
        "id": "sentinel2-baghdad-2026",
        "url": "https://cdn.iraq-maps.app/satellite/baghdad/{z}/{x}/{y}.jpg",
        "capturedAt": "2026-08-01"
      }
    }
  ]
}
```

### Get Tiles (PMTiles passthrough)

Vector tiles are served directly from the PMTiles file or via the API fallback route.

```
GET /v1/cities/:cityId/tiles/:z/:x/:y.mvt
Authorization: (none required)
Content-Type: application/vnd.mapbox-vector-tile
```

### Get Glyphs

```
GET /v1/cities/:cityId/glyphs/:fontstack/:range.pbf
Authorization: (none required)
Content-Type: application/x-protobuf
```

---

## Places & Search

### Search Places

Full-text search using PostgreSQL `pg_trgm` trigram similarity with Arabic normalisation.

```
GET /v1/places/search?q=<query>&city=<cityId>&lang=ar&near=<lng,lat>&limit=20
Authorization: Bearer <jwt>
```

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string (1–100) | yes | Search query. Arabic normalised server-side. |
| `city` | CityId | yes | Restrict to this city. |
| `lang` | Locale | no | Response name language. Default `ar`. |
| `near` | `"lng,lat"` | no | Bias results toward this point. |
| `limit` | integer (1–50) | no | Default 20. |

**Response 200:**

```json
{
  "items": [
    {
      "id": "node/12345678",
      "kind": "place",
      "names": {
        "ar": "مطعم الشيخ",
        "en": "Al-Sheikh Restaurant"
      },
      "category": "restaurant",
      "area": { "ar": "الكرادة", "en": "Karada" },
      "location": [44.3900, 33.3240],
      "distanceM": 320
    }
  ]
}
```

### Nearby Places

```
GET /v1/places/nearby?city=baghdad&near=44.3661,33.3152&radiusM=500&category=restaurant&limit=20
Authorization: Bearer <jwt>
```

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `city` | CityId | yes | |
| `near` | `"lng,lat"` | yes | Center point. |
| `radiusM` | integer (50–5000) | no | Search radius in metres. Default 1000. |
| `category` | PlaceCategory | no | Filter by category. |
| `limit` | integer (1–50) | no | Default 20. |

**Response 200:** Same shape as search, items sorted nearest-first.

### Autocomplete Suggestions

Lightweight prefix search for the search bar.

```
GET /v1/places/suggestions?q=كار&city=baghdad&lang=ar
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    { "id": "node/99887766", "name": "كارفور" },
    { "id": "node/11223344", "name": "كاريان مول" }
  ]
}
```

### Get Place Details

```
GET /v1/places/:placeId?lang=ar
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "id": "node/12345678",
  "kind": "place",
  "names": {
    "ar": "مطعم الشيخ",
    "en": "Al-Sheikh Restaurant"
  },
  "category": "restaurant",
  "area": { "ar": "الكرادة", "en": "Karada" },
  "location": [44.3900, 33.3240],
  "hoursRaw": "Mo-Fr 10:00-23:00; Sa-Su 11:00-00:00",
  "osmContacts": {
    "phone": "+9647701234567",
    "website": "https://example.com"
  },
  "source": "osm",
  "attribution": "© OpenStreetMap contributors",
  "provider": {
    "providerId": "a1b2c3d4-...",
    "verified": true,
    "photos": [
      {
        "assetId": "abc123",
        "url": "https://cdn.iraq-maps.app/media/abc123?sig=..."
      }
    ],
    "hours": "Mo-Fr 10:00-23:00",
    "social": [
      { "kind": "instagram", "url": "https://instagram.com/alsheikhiq" }
    ],
    "phone": "+9647701234567",
    "avgResponseHours": 2
  },
  "crowding": {
    "value": "busy",
    "source": "user_report",
    "observedAt": "2026-10-16T08:30:00Z",
    "confidence": 0.75
  },
  "priceLevel": {
    "value": 2,
    "source": "provider",
    "observedAt": "2026-10-14T12:00:00Z",
    "confidence": 0.95
  }
}
```

**PlaceKind values:** `place` · `street` · `area`

**PlaceCategory values:** `restaurant` · `cafe` · `hotel` · `shop` · `supermarket` · `pharmacy` · `hospital` · `school` · `mosque` · `park` · `government` · `bank` · `gas_station` · `parking` · `bus_stop` · `attraction` · `other`

**Response 404:**

```json
{ "code": "not_found" }
```

### Report Place Price

```
POST /v1/places/:placeId/price-reports
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "label": "وجبة رئيسية",
  "min": 5000,
  "max": 15000,
  "currency": "IQD"
}
```

**Response 201:**

```json
{ "ok": true }
```

---

## Geocoding

The geocoding module wraps Photon server-side. Clients never call Photon directly.

### Forward Geocoding (Address to Coordinates)

```
GET /v1/geocoding/forward?q=شارع+الرشيد&governorate=baghdad&limit=5
Authorization: Bearer <jwt>
```

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string (1–200) | yes | Address or place name query |
| `governorate` | IraqGovernorateId | no | Restrict to governorate |
| `district` | string | no | Restrict to district ID |
| `limit` | integer (1–10) | no | Default 5 |

**Response 200:**

```json
{
  "items": [
    {
      "id": "photon/abc123",
      "displayName": "شارع الرشيد، الرصافة، بغداد",
      "location": [44.3661, 33.3452],
      "type": "street",
      "governorate": {
        "id": "baghdad",
        "names": { "ar": "بغداد", "ckb": "بەغدا", "en": "Baghdad" }
      },
      "district": {
        "id": "rusafa",
        "names": { "ar": "الرصافة", "en": "Rusafa" }
      },
      "neighborhood": null,
      "bbox": [44.35, 33.34, 44.38, 33.36]
    }
  ]
}
```

### Reverse Geocoding (Coordinates to Address)

```
GET /v1/geocoding/reverse?lng=44.3661&lat=33.3152&lang=ar
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "displayName": "شارع فلسطين، الكرادة، بغداد",
  "location": [44.3661, 33.3152],
  "type": "street",
  "governorate": {
    "id": "baghdad",
    "names": { "ar": "بغداد", "ckb": "بەغدا", "en": "Baghdad" }
  },
  "district": {
    "id": "karada",
    "names": { "ar": "الكرادة", "en": "Karada" }
  },
  "neighborhood": {
    "id": "karada-inside",
    "names": { "ar": "الكرادة داخل", "en": "Karada Inside" }
  }
}
```

**Response 404** when no address can be resolved for the given coordinates:

```json
{ "code": "not_found" }
```

### Autocomplete (Geocoding)

```
GET /v1/geocoding/autocomplete?q=شارع+ال&lang=ar&limit=5
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "photon/xyz",
      "displayName": "شارع الرشيد",
      "location": [44.3661, 33.3452],
      "type": "street"
    }
  ]
}
```

### List Governorates

```
GET /v1/geocoding/governorates?lang=ar
Authorization: (none required)
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "baghdad",
      "names": { "ar": "بغداد", "ckb": "بەغدا", "en": "Baghdad" },
      "center": [44.3661, 33.3152],
      "bbox": [44.20, 33.25, 44.55, 33.45],
      "districts": [
        {
          "id": "karada",
          "names": { "ar": "الكرادة", "en": "Karada" },
          "center": [44.3900, 33.3240]
        }
      ]
    }
  ]
}
```

---

## Routing & Navigation

### Calculate Route

```
POST /v1/routes
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "origin": [44.3661, 33.3152],
  "destination": [44.4105, 33.2970],
  "waypoints": [],
  "mode": "car"
}
```

**Request fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `origin` | LngLat | yes | Start point `[lng, lat]` |
| `destination` | LngLat | yes | End point `[lng, lat]` |
| `waypoints` | LngLat[] (max 5) | no | Intermediate stops |
| `mode` | `"car"` or `"walk"` | yes | Travel mode |

**Response 201:**

```json
{
  "polyline6": "_ibsEkmzaB??...",
  "distanceM": 4320,
  "durationS": 720,
  "bbox": [44.36, 33.29, 44.41, 33.32],
  "maneuvers": [
    {
      "type": "depart",
      "modifier": "straight",
      "streetNames": ["شارع فلسطين", "Palestine Street"],
      "distanceM": 450,
      "durationS": 90,
      "beginShapeIndex": 0
    },
    {
      "type": "turn",
      "modifier": "right",
      "streetNames": ["شارع الكرادة"],
      "distanceM": 1200,
      "durationS": 240,
      "beginShapeIndex": 18
    },
    {
      "type": "arrive",
      "streetNames": [],
      "distanceM": 0,
      "durationS": 0,
      "beginShapeIndex": 95
    }
  ]
}
```

**ManeuverType values:** `depart` · `arrive` · `continue` · `turn` · `uturn` · `ramp` · `exit` · `fork` · `merge` · `roundabout_enter` · `roundabout_exit` · `ferry_enter` · `ferry_exit`

**ManeuverModifier values:** `straight` · `slight_left` · `left` · `sharp_left` · `slight_right` · `right` · `sharp_right`

> **Note:** The API never returns localised instruction strings. The mobile app builds turn-by-turn text locally from i18n templates (ADR-0006). Engine narrative text never crosses the contract boundary.

**Response 404** (no route):

```json
{
  "type": "about:blank",
  "title": "No route found",
  "status": 404,
  "code": "no_route"
}
```

**Response 503** (engine down):

```json
{
  "type": "about:blank",
  "title": "Routing service unavailable",
  "status": 503,
  "code": "routing_unavailable"
}
```

---

## Incidents

User-reported traffic incidents layered on the map.

### List Incidents

```
GET /v1/incidents?bbox=44.20,33.25,44.55,33.45&activeOnly=true
Authorization: Bearer <jwt>
```

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `bbox` | `"w,s,e,n"` | yes | Bounding box to fetch incidents for |
| `activeOnly` | boolean | no | Default `true`. Set `false` to include expired incidents. |

**Response 200:**

```json
{
  "items": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "type": "accident",
      "severity": "moderate",
      "location": [44.3800, 33.3100],
      "description": "حادثة على الجسر",
      "reportedBy": null,
      "anonymous": true,
      "createdAt": "2026-10-16T07:00:00Z",
      "expiresAt": "2026-10-16T09:00:00Z",
      "active": true,
      "confirmedCount": 5,
      "disputedCount": 1,
      "confirmedByMe": false,
      "disputedByMe": false
    }
  ]
}
```

**IncidentType values:** `accident` · `road_closure` · `pothole` · `flooding` · `traffic_jam` · `wrong_way` · `hazard` · `police` · `speed_camera` · `roadblock` · `flood` · `construction` · `other`

**IncidentSeverity values:** `minor` · `moderate` · `severe`

### Report an Incident

```
POST /v1/incidents
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "type": "traffic_jam",
  "severity": "severe",
  "location": [44.3661, 33.3152],
  "description": "ازدحام شديد على الدائري",
  "ttlHours": 2,
  "anonymous": false
}
```

**Response 201:** Returns the created `Incident` object.

### Vote on an Incident

```
POST /v1/incidents/:id/vote
Authorization: Bearer <jwt>
Content-Type: application/json

{ "vote": "confirm" }
```

`vote` is `"confirm"` or `"dispute"`.

**Response 200:**

```json
{
  "confirmedCount": 6,
  "disputedCount": 1,
  "confirmedByMe": true,
  "disputedByMe": false
}
```

### Delete Own Incident

```
DELETE /v1/incidents/:id
Authorization: Bearer <jwt>
```

**Response 204:** No body.

---

## Providers

### Register as Provider (step 1: create draft)

```
POST /v1/providers
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "placeId": "node/12345678",
  "phone": "+9647701234567",
  "hoursRaw": "Mo-Fr 09:00-22:00",
  "social": [
    { "kind": "instagram", "url": "https://instagram.com/mybusiness" }
  ]
}
```

**Response 201:**

```json
{
  "providerId": "a1b2c3d4-e5f6-...",
  "status": "draft",
  "placeId": "node/12345678",
  "phone": "+9647701234567",
  "photos": [],
  "hoursRaw": "Mo-Fr 09:00-22:00",
  "social": [{ "kind": "instagram", "url": "https://instagram.com/mybusiness" }],
  "prices": [],
  "consents": []
}
```

**ProviderStatus lifecycle:** `draft` → `pending` (after submit) → `verified` or `suspended`

### Submit for Verification

```
POST /v1/providers/:providerId/submit
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:**

```json
{ "status": "pending" }
```

### Get Own Provider Profile

```
GET /v1/providers/me
Authorization: Bearer <jwt>
```

**Response 200:** Full provider record including `status`, `consents`, `photos`, `prices`, etc.

### Update Provider Profile

```
PATCH /v1/providers/me
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "hoursRaw": "Mo-Su 10:00-23:00",
  "social": [
    { "kind": "instagram", "url": "https://instagram.com/mybusiness" },
    { "kind": "facebook", "url": "https://facebook.com/mybusiness" }
  ]
}
```

**Response 200:** Updated provider record.

### Manage Consents

```
PUT /v1/providers/me/consents
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "consents": ["photos", "show_phone", "social_links", "whatsapp_messages", "show_prices"]
}
```

**ConsentScope values:** `photos` · `social_links` · `whatsapp_messages` · `show_phone` · `show_prices`

**Response 200:**

```json
{ "consents": ["photos", "show_phone", "social_links"] }
```

### Add Price Range

```
POST /v1/providers/me/prices
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "label": "وجبة رئيسية",
  "min": 5000,
  "max": 15000,
  "currency": "IQD"
}
```

**Response 201:** Returns the created `PriceRange` with its ID.

### Update Price Range

```
PUT /v1/providers/me/prices/:priceId
Authorization: Bearer <jwt>
Content-Type: application/json

{ "min": 6000, "max": 18000 }
```

### Delete Price Range

```
DELETE /v1/providers/me/prices/:priceId
Authorization: Bearer <jwt>
```

**Response 204.**

### Admin: List Pending Providers

```
GET /v1/admin/providers?status=pending&cursor=<opaque>&limit=20
Authorization: Bearer <jwt>  (role: moderator or admin)
```

### Admin: Verify Provider

```
POST /v1/admin/providers/:providerId/verify
Authorization: Bearer <jwt>  (role: moderator or admin)
Content-Type: application/json

{}
```

**Response 200:** `{ "status": "verified" }`

### Admin: Suspend Provider

```
POST /v1/admin/providers/:providerId/suspend
Authorization: Bearer <jwt>  (role: moderator or admin)
Content-Type: application/json

{ "reason": "Violations de politique" }
```

---

## Media

### Request Upload URL

```
POST /v1/media/upload-url
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "contentType": "image/jpeg",
  "purpose": "provider_photo"
}
```

**purpose values:** `provider_photo` · `post_photo` · `review_photo` · `listing_photo` · `scene_asset`

**Response 201:**

```json
{
  "assetId": "abc123def456",
  "uploadUrl": "https://storage.iraq-maps.app/upload/abc123?sig=...&expires=...",
  "expiresAt": "2026-10-16T09:15:00Z"
}
```

The client PUTs the binary file directly to `uploadUrl`. No auth header needed on that PUT.

### Confirm Upload

```
POST /v1/media/assets/:assetId/confirm
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:**

```json
{
  "assetId": "abc123def456",
  "readUrl": "https://cdn.iraq-maps.app/media/abc123?sig=...&expires=...",
  "expiresAt": "2026-10-16T10:00:00Z"
}
```

Read URLs are signed and short-lived (default 1 hour). Request a fresh one via confirm or the dedicated refresh endpoint.

### Get Read URL

```
GET /v1/media/assets/:assetId/read-url
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "assetId": "abc123def456",
  "readUrl": "https://cdn.iraq-maps.app/media/abc123?sig=...&expires=...",
  "expiresAt": "2026-10-16T10:00:00Z"
}
```

### Delete Asset

```
DELETE /v1/media/assets/:assetId
Authorization: Bearer <jwt>
```

**Response 204.**

---

## Messaging & Inquiries

Users send inquiries (messages) to one or more places. The messaging engine selects the delivery channel per recipient: in-app · WhatsApp Cloud API · handoff link.

### Create Inquiry (Send Message)

```
POST /v1/inquiries
Authorization: Bearer <jwt>
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "text": "هل لديكم طاولة لـ 4 أشخاص الليلة؟",
  "placeIds": ["node/12345678", "node/87654321"],
  "confirm": true
}
```

The `Idempotency-Key` header is required and must be a UUID. Reusing the same key with the same body returns the original response (idempotent). Reusing with a different body returns 409.

`confirm: true` is required. The client must show a confirmation dialog to the user before sending.

**Request limits:**
- `text`: 1–500 characters
- `placeIds`: 1–5 places

**Response 201:**

```json
{
  "id": "inquiry-uuid",
  "userId": "user-uuid",
  "text": "هل لديكم طاولة لـ 4 أشخاص الليلة؟",
  "targets": [
    {
      "placeId": "node/12345678",
      "channel": "in_app",
      "status": "queued",
      "handoffLink": null
    },
    {
      "placeId": "node/87654321",
      "channel": "handoff",
      "status": "handed_off",
      "handoffLink": {
        "type": "wa_me",
        "url": "https://wa.me/9647701234567?text=...",
        "copyText": "هل لديكم طاولة لـ 4 أشخاص الليلة؟"
      }
    }
  ],
  "createdAt": "2026-10-16T09:00:00Z",
  "readAt": null
}
```

**MessageStatus values:** `queued` · `sent` · `delivered` · `read` · `replied` · `failed` · `handed_off`

**MessagingChannelKind values:** `in_app` · `whatsapp` · `handoff`

**Response 429** (daily limit):

```json
{ "code": "daily_limit_exceeded" }
```

### List Own Inquiries

```
GET /v1/inquiries?cursor=<opaque>
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [ /* Inquiry[] */ ],
  "nextCursor": "eyJpZCI6Ii4uLiJ9"
}
```

### Get Inquiry

```
GET /v1/inquiries/:id
Authorization: Bearer <jwt>
```

**Response 200:** Full `Inquiry` object.

**Response 404:** `{ "code": "not_found" }`

### Mark Inquiry as Read

```
POST /v1/inquiries/:id/read
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "ok": true }`

### Provider: List Received Inquiries

```
GET /v1/provider/inbox?cursor=<opaque>
Authorization: Bearer <jwt>  (role: provider)
```

**Response 200:** Same pagination shape as list own inquiries, but returns inquiries addressed to the provider's place.

### Provider: Reply to Inquiry

```
POST /v1/provider/inbox/:id/reply
Authorization: Bearer <jwt>  (role: provider)
Content-Type: application/json

{
  "text": "نعم، لدينا طاولة. يرجى الحضور قبل الساعة 8 مساءً."
}
```

**Response 200:** `{ "ok": true }`

**Response 404:** `{ "code": "not_found" }`

---

## Notifications

### Register Device

```
POST /v1/devices
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "token": "<FCM or APNs push token>",
  "platform": "android"
}
```

`platform` is `"android"` or `"ios"`.

**Response 200 or 201:**

```json
{ "deviceId": "device-uuid" }
```

### Get Notification Preferences

```
GET /v1/notification-prefs
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "newInquiry": true,
  "replyReceived": true,
  "statusUpdate": true,
  "discoverLikes": true,
  "discoverComments": true,
  "messages": true
}
```

### Update Notification Preferences

```
PUT /v1/notification-prefs
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "discoverLikes": false
}
```

Partial update — only send the fields you want to change.

**Response 200:** Full `NotificationPrefs` object.

### List Notifications

```
GET /v1/notifications?limit=20&unreadOnly=false&cursor=<opaque>
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "notif-uuid",
      "title": "رد جديد على استفسارك",
      "body": "ردّ مطعم الشيخ على رسالتك",
      "data": { "inquiryId": "inquiry-uuid", "screen": "messages/detail" },
      "readAt": null,
      "createdAt": "2026-10-16T09:05:00Z"
    }
  ],
  "unreadCount": 3,
  "nextCursor": null
}
```

### Mark Notification as Read

```
POST /v1/notifications/:id/read
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "ok": true }`

### Mark All Notifications as Read

```
POST /v1/notifications/read-all
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "ok": true }`

---

## Assistant

The AI travel and business assistant. Claude is invoked server-side only. The mobile app never holds an API key.

### Chat

```
POST /v1/assistant/chat
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "sessionId": "session-uuid-or-null",
  "messages": [
    { "role": "user", "content": "أين أفضل مطاعم الكرادة؟" }
  ]
}
```

If `sessionId` is null or omitted, a new session is created.

**Response 200:**

```json
{
  "sessionId": "session-uuid",
  "reply": "في منطقة الكرادة توجد عدة مطاعم مميزة...",
  "focusPlaceIds": ["node/11111", "node/22222", "node/33333"],
  "focusPlaceNames": {
    "node/11111": "مطعم الشيخ",
    "node/22222": "مطعم بغداد",
    "node/33333": "كافيه الكرادة"
  },
  "composeParams": null
}
```

When `composeParams` is non-null, the app should offer a «تواصل» button:

```json
{
  "sessionId": "session-uuid",
  "reply": "يمكنك التواصل مع هذا المطعم مباشرةً.",
  "composeParams": {
    "text": "أريد حجز طاولة",
    "placeIds": ["node/11111"]
  }
}
```

**Response 429** (daily limit):

```json
{
  "type": "about:blank",
  "title": "Daily message limit reached",
  "status": 429,
  "code": "daily_limit_exceeded",
  "retryAfterMs": 43200000
}
```

### Plan a Trip

```
POST /v1/assistant/trip-plan
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "destination": "النجف الأشرف",
  "startDate": "2026-12-01",
  "endDate": "2026-12-03",
  "interests": ["culture", "religious", "food"],
  "budget": "mid",
  "partySize": 4
}
```

**TripInterest values:** `food` · `culture` · `shopping` · `nature` · `history` · `religious`

**BudgetLevel values:** `budget` · `mid` · `luxury`

**Response 200:**

```json
{
  "planId": "plan-uuid",
  "destination": "النجف الأشرف",
  "summary": "رحلة 3 أيام إلى النجف تشمل الأماكن الدينية والتاريخية والمطاعم الشعبية",
  "days": [
    {
      "day": 1,
      "date": "2026-12-01",
      "theme": "الزيارات الدينية",
      "activities": [
        {
          "time": "09:00",
          "title": "زيارة مرقد الإمام علي",
          "description": "زيارة الحرم الشريف في الصباح قبل الازدحام",
          "placeId": "node/55555",
          "estimatedCost": "مجاناً",
          "duration": "2 ساعة"
        }
      ],
      "totalEstimatedCost": "25,000 IQD"
    }
  ],
  "totalEstimatedCost": "75,000 IQD",
  "tips": [
    "احجز مكان الإقامة مسبقاً في موسم الزيارات",
    "الملابس المحتشمة مطلوبة في الأماكن الدينية"
  ]
}
```

### Get Recommendations

```
POST /v1/assistant/recommendations
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "category": "restaurants",
  "near": [44.3900, 33.3240],
  "limit": 5
}
```

**RecommendationCategory values:** `restaurants` · `cafes` · `hotels` · `shopping` · `attractions`

**Response 200:**

```json
{
  "items": [
    {
      "placeId": "node/12345",
      "name": "مطعم الشيخ",
      "address": "شارع فلسطين، الكرادة",
      "category": "restaurant",
      "aiReason": "أكثر المطاعم تقييماً في المنطقة وتخصصه بالمشاوي العراقية",
      "estimatedPrice": "15,000–25,000 IQD",
      "rating": 4.6,
      "distanceMeters": 320
    }
  ]
}
```

### List Sessions

```
GET /v1/assistant/sessions?limit=10
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "sessionId": "session-uuid",
      "preview": "أين أفضل مطاعم الكرادة؟",
      "createdAt": "2026-10-16T09:00:00Z",
      "updatedAt": "2026-10-16T09:02:00Z"
    }
  ],
  "nextCursor": null
}
```

### Delete Session (Clear History)

```
DELETE /v1/assistant/sessions/:sessionId
Authorization: Bearer <jwt>
```

**Response 204.**

### Get Daily Usage

```
GET /v1/assistant/usage
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "used": 12,
  "limit": 50,
  "remaining": 38,
  "resetsAt": "2026-10-17T00:00:00Z"
}
```

---

## Insights

Crowding and price estimates for places. All estimates carry `source`, `observedAt`, and `confidence` (CLAUDE.md rule 5).

### Get Crowding

```
GET /v1/insights/places/:placeId/crowding
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "placeId": "node/12345678",
  "crowding": {
    "value": "busy",
    "source": "user_report",
    "observedAt": "2026-10-16T08:30:00Z",
    "confidence": 0.75
  }
}
```

**CrowdingLevel values:** `quiet` · `moderate` · `busy` · `very_busy`

**EstimateSource values:** `provider` · `user_report` · `osm` · `heuristic`

**Response 200** with null crowding when no data is available:

```json
{ "placeId": "node/12345678", "crowding": null }
```

### Report Crowding

```
POST /v1/insights/places/:placeId/crowding
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "level": "busy"
}
```

**Response 201:** `{ "ok": true }`

### Get Price Level

```
GET /v1/insights/places/:placeId/price-level
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "placeId": "node/12345678",
  "priceLevel": {
    "value": 2,
    "source": "provider",
    "observedAt": "2026-10-14T12:00:00Z",
    "confidence": 0.95
  }
}
```

`priceLevel.value` is 1–4 (1 = budget, 4 = very expensive).

---

## Discover (Social Feed)

### Get Feed

```
GET /discover/feed?limit=10&cursor=<opaque>&category=food
Authorization: Bearer <jwt>
```

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | integer (1–20) | Default 10 |
| `cursor` | string | Pagination cursor |
| `category` | PostCategory | Filter by category |

**PostCategory values:** `food` · `transport` · `tourism` · `shopping` · `services` · `other`

**Response 200:**

```json
{
  "items": [
    {
      "id": "post-uuid",
      "authorId": "user-uuid",
      "placeId": "node/12345678",
      "type": "photo",
      "category": "food",
      "body": "جربت هذا المطعم اليوم والأكل رائع 😍",
      "mediaAssetIds": ["abc123", "def456"],
      "likeCount": 24,
      "commentCount": 5,
      "viewCount": 312,
      "bookmarkCount": 8,
      "mentionedUserIds": [],
      "isLikedByMe": false,
      "authorVerified": false,
      "isPinned": false,
      "createdAt": "2026-10-16T08:00:00Z"
    }
  ],
  "nextCursor": "eyJpZCI6InBvc3QtdXVpZCJ9"
}
```

**PostType values:** `photo` · `tip` · `event` · `offer`

### Create Post

```
POST /discover/posts
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "type": "photo",
  "category": "food",
  "body": "جربت هذا المطعم اليوم والأكل رائع!",
  "placeId": "node/12345678",
  "mediaAssetIds": ["abc123", "def456"],
  "mentionedUserIds": []
}
```

**Response 201:** Full `DiscoverPost` object.

**Response 429** (daily limit):

```json
{
  "type": "about:blank",
  "title": "Post creation limit reached",
  "status": 429,
  "code": "too_many_requests",
  "retryAfterMs": 3600000
}
```

### Get Post

```
GET /discover/posts/:postId
Authorization: Bearer <jwt>
```

**Response 200:** Full `DiscoverPost` object.

### Edit Post

```
PATCH /discover/posts/:postId
Authorization: Bearer <jwt>
Content-Type: application/json

{ "body": "تحديث: المطعم رائع وأنصح بالسمك المشوي!" }
```

**Response 200:** Updated `DiscoverPost`.

### Delete Post

```
DELETE /discover/posts/:postId
Authorization: Bearer <jwt>
```

**Response 204.**

### Like Post

```
POST /discover/posts/:postId/like
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "likeCount": 25 }`

### Unlike Post

```
DELETE /discover/posts/:postId/like
Authorization: Bearer <jwt>
```

**Response 200:** `{ "likeCount": 24 }`

### Bookmark Post

```
POST /discover/posts/:postId/bookmark
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "bookmarkCount": 9 }`

### Remove Bookmark

```
DELETE /discover/posts/:postId/bookmark
Authorization: Bearer <jwt>
```

**Response 200:** `{ "bookmarkCount": 8 }`

### List Comments

```
GET /discover/posts/:postId/comments?cursor=<opaque>&limit=20
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "comment-uuid",
      "postId": "post-uuid",
      "authorId": "user-uuid",
      "body": "شكراً على التوصية!",
      "likeCount": 3,
      "isLikedByMe": false,
      "createdAt": "2026-10-16T08:05:00Z"
    }
  ],
  "nextCursor": null
}
```

### Add Comment

```
POST /discover/posts/:postId/comments
Authorization: Bearer <jwt>
Content-Type: application/json

{ "body": "شكراً على التوصية!" }
```

**Response 201:** `DiscoverComment` object.

### Delete Comment

```
DELETE /discover/posts/:postId/comments/:commentId
Authorization: Bearer <jwt>
```

**Response 204.**

### Like Comment

```
POST /discover/posts/:postId/comments/:commentId/like
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "likeCount": 4 }`

### Report Post

```
POST /discover/posts/:postId/report
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "reason": "spam",
  "detail": "إعلان تجاري مكرر"
}
```

**ReportReason values:** `spam` · `misleading` · `inappropriate` · `other`

**Response 201:** `{ "ok": true }`

### Search Users (for @mentions)

```
GET /discover/users/search?q=ahmed&limit=10
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "userId": "user-uuid",
      "username": "ahmed_baghdad",
      "displayName": "أحمد البغدادي"
    }
  ]
}
```

### Pin Post (own posts)

```
POST /discover/posts/:postId/pin
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** `{ "isPinned": true }`

### Unpin Post

```
DELETE /discover/posts/:postId/pin
Authorization: Bearer <jwt>
```

**Response 200:** `{ "isPinned": false }`

---

## Reviews

### List Reviews for a Place

```
GET /v1/places/:placeId/reviews?sort=newest&cursor=<opaque>&limit=20
Authorization: Bearer <jwt>
```

**sort values:** `newest` · `highest` · `lowest` · `most_helpful`

**Response 200:**

```json
{
  "items": [
    {
      "id": "review-uuid",
      "userId": "user-uuid",
      "placeId": "node/12345678",
      "rating": 5,
      "text": "مطعم رائع والخدمة ممتازة!",
      "photos": ["https://cdn.iraq-maps.app/media/abc123?sig=..."],
      "isAnonymous": false,
      "visitDate": "2026-10-10",
      "status": "active",
      "helpfulCount": 12,
      "notHelpfulCount": 1,
      "myVote": null,
      "response": null,
      "createdAt": "2026-10-11T10:00:00Z",
      "updatedAt": "2026-10-11T10:00:00Z"
    }
  ],
  "nextCursor": null
}
```

### Get Rating Summary

```
GET /v1/places/:placeId/reviews/summary
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "placeId": "node/12345678",
  "average": 4.3,
  "total": 47,
  "breakdown": {
    "1": 2,
    "2": 3,
    "3": 5,
    "4": 12,
    "5": 25
  }
}
```

### Create Review

```
POST /v1/places/:placeId/reviews
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "rating": 5,
  "text": "تجربة رائعة!",
  "photos": ["abc123"],
  "isAnonymous": false,
  "visitDate": "2026-10-10"
}
```

**Response 201:** Full `FullReview` object.

### Update Review

```
PUT /v1/places/:placeId/reviews/:reviewId
Authorization: Bearer <jwt>
Content-Type: application/json

{ "text": "تحديث: لا يزال رائعاً!", "rating": 4 }
```

**Response 200:** Updated `FullReview`.

### Delete Review

```
DELETE /v1/places/:placeId/reviews/:reviewId
Authorization: Bearer <jwt>
```

**Response 204.**

### Vote on Review (helpful / not helpful)

```
POST /v1/reviews/:reviewId/vote
Authorization: Bearer <jwt>
Content-Type: application/json

{ "helpful": true }
```

**Response 200:** `{ "helpfulCount": 13, "notHelpfulCount": 1, "myVote": true }`

### Provider: Respond to Review

```
POST /v1/reviews/:reviewId/response
Authorization: Bearer <jwt>  (role: provider)
Content-Type: application/json

{
  "text": "شكراً جزيلاً! نسعد بزيارتكم دائماً."
}
```

**Response 201:** `ReviewProviderResponse` object.

### Report Review

```
POST /v1/reviews/:reviewId/report
Authorization: Bearer <jwt>
Content-Type: application/json

{ "reason": "fake", "detail": "هذا المراجع لم يزر المطعم" }
```

**ReviewReportReason values:** `spam` · `fake` · `inappropriate` · `other`

**Response 201:** `{ "ok": true }`

---

## Reputation

### Get Provider Reputation Score

```
GET /v1/providers/:providerId/reputation
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "providerId": "provider-uuid",
  "score": 87,
  "level": "trusted",
  "reviewCount": 47,
  "averageRating": 4.3,
  "responseRate": 0.94,
  "avgResponseHours": 2,
  "badges": ["fast_responder", "high_rated", "verified"],
  "updatedAt": "2026-10-16T00:00:00Z"
}
```

**ReputationLevel values:** `new` · `rising` · `trusted` · `top`

---

## Listings & Marketplace

### List Categories

```
GET /v1/listings/categories
Authorization: (none required)
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "cat-uuid",
      "nameAr": "مطاعم",
      "nameEn": "Restaurants",
      "icon": "🍽️",
      "parentId": null,
      "slug": "restaurants"
    }
  ]
}
```

### List Listings

```
GET /v1/listings?city=baghdad&category=<catId>&sort=newest&cursor=<opaque>&limit=20
Authorization: Bearer <jwt>
```

**sort values:** `newest` · `price_asc` · `price_desc` · `popularity`

**Response 200:**

```json
{
  "items": [
    {
      "id": "listing-uuid",
      "providerId": "provider-uuid",
      "providerName": "مطعم الشيخ",
      "providerVerified": true,
      "type": "food_item",
      "titleAr": "سمك مسكوف",
      "titleEn": "Masgouf Fish",
      "priceIqd": 25000,
      "coverPhotoUrl": "https://cdn.iraq-maps.app/media/abc123?sig=...",
      "category": {
        "id": "cat-uuid",
        "nameAr": "مطاعم",
        "nameEn": "Restaurants",
        "icon": "🍽️"
      },
      "isAvailable": true,
      "deliveryAvailable": false
    }
  ],
  "nextCursor": null
}
```

**ListingType values:** `product` · `service` · `food_item` · `rental` · `package`

### Get Listing Details

```
GET /v1/listings/:listingId
Authorization: Bearer <jwt>
```

**Response 200:** Full listing with `descriptionAr`, `descriptionEn`, all photos, delivery details, etc.

### Provider: Create Listing

```
POST /v1/listings
Authorization: Bearer <jwt>  (role: provider)
Content-Type: application/json

{
  "type": "food_item",
  "categoryId": "cat-uuid",
  "titleAr": "سمك مسكوف",
  "titleEn": "Masgouf Fish",
  "descriptionAr": "سمك طازج مشوي على نار الحطب",
  "descriptionEn": "Fresh fish grilled over wood fire",
  "priceIqd": 25000,
  "isAvailable": true,
  "deliveryAvailable": false,
  "mediaAssetIds": ["abc123"]
}
```

**Response 201:** Full listing object.

### Provider: Update Listing

```
PATCH /v1/listings/:listingId
Authorization: Bearer <jwt>  (role: provider)
Content-Type: application/json

{ "priceIqd": 28000, "isAvailable": true }
```

### Provider: Delete Listing

```
DELETE /v1/listings/:listingId
Authorization: Bearer <jwt>  (role: provider)
```

**Response 204.**

---

## Payments & Wallet

IQD amounts are integer dinars (no fractions). USD amounts are integer cents.

### Get Wallet

```
GET /v1/wallet
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "walletId": "wallet-uuid",
  "userId": "user-uuid",
  "balanceIqd": 150000,
  "currency": "IQD",
  "updatedAt": "2026-10-16T08:00:00Z"
}
```

### Get Transaction History

```
GET /v1/wallet/transactions?cursor=<opaque>&limit=20
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "txn-uuid",
      "walletId": "wallet-uuid",
      "type": "debit",
      "amount": 25000,
      "currency": "IQD",
      "status": "completed",
      "description": "حجز طاولة في مطعم الشيخ",
      "referenceId": "intent-uuid",
      "createdAt": "2026-10-15T19:00:00Z"
    }
  ],
  "nextCursor": null
}
```

**TransactionType values:** `credit` · `debit` · `hold` · `release` · `refund`

**TransactionStatus values:** `pending` · `completed` · `failed` · `reversed`

### List Payment Methods

```
GET /v1/payment-methods
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "pm-uuid",
      "userId": "user-uuid",
      "type": "card",
      "isDefault": true,
      "card": {
        "last4": "4242",
        "brand": "visa",
        "expiryMonth": 12,
        "expiryYear": 2028,
        "holderName": "Ahmed Al-Iraqi"
      }
    }
  ]
}
```

**PaymentMethodType values:** `card` · `wallet` · `cash_on_delivery`

### Add Payment Method

```
POST /v1/payment-methods
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "type": "card",
  "card": {
    "last4": "4242",
    "brand": "visa",
    "expiryMonth": 12,
    "expiryYear": 2028
  }
}
```

**Response 201:** Payment method object.

### Create Payment Intent

```
POST /v1/payment-intents
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "amount": 25000,
  "currency": "IQD",
  "paymentMethodId": "pm-uuid",
  "description": "حجز طاولة"
}
```

**Response 201:**

```json
{
  "id": "intent-uuid",
  "amount": 25000,
  "currency": "IQD",
  "status": "requires_confirmation",
  "paymentMethodId": "pm-uuid",
  "description": "حجز طاولة",
  "createdAt": "2026-10-16T09:00:00Z"
}
```

**PaymentIntentStatus values:** `pending` · `requires_confirmation` · `processing` · `succeeded` · `failed` · `refunded` · `partially_refunded` · `cancelled`

### Confirm Payment Intent

```
POST /v1/payment-intents/:intentId/confirm
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

**Response 200:** Updated `PaymentIntent` with `status: "succeeded"`.

---

## Tour 3D

> **Status: Reserved for a later phase.** Contracts are frozen; screens are not yet implemented.

### List Scenes

```
GET /v1/tour3d/scenes?city=baghdad&category=heritage&cursor=<opaque>&limit=20
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "items": [
    {
      "id": "scene-uuid",
      "nameAr": "المتحف العراقي",
      "nameEn": "Iraq Museum",
      "category": "museum",
      "thumbnailUrl": "https://cdn.iraq-maps.app/tour3d/scene-uuid/thumb.jpg",
      "viewpointCount": 12,
      "durationMinutes": 25,
      "placeId": "node/55555"
    }
  ],
  "nextCursor": null
}
```

### Get Scene

```
GET /v1/tour3d/scenes/:sceneId
Authorization: Bearer <jwt>
```

**Response 200:** Full scene with viewpoints, annotations, and signed asset URLs.

---

## WebSocket Events

Connect to `wss://api.iraq-maps.app/v1/ws` with a JWT token in the query string:

```
wss://api.iraq-maps.app/v1/ws?token=<jwt>
```

Events are JSON objects with an `event` field.

### Inquiry Status Changed

```json
{
  "event": "messaging.inquiry.status_changed.v1",
  "inquiryId": "inquiry-uuid",
  "placeId": "node/12345678",
  "channel": "whatsapp",
  "status": "delivered",
  "at": "2026-10-16T09:01:30Z"
}
```

### New Notification

```json
{
  "event": "notifications.new.v1",
  "notification": {
    "id": "notif-uuid",
    "title": "رد جديد على استفسارك",
    "body": "ردّ مطعم الشيخ على رسالتك",
    "data": { "inquiryId": "inquiry-uuid" },
    "readAt": null,
    "createdAt": "2026-10-16T09:05:00Z"
  }
}
```

### New Discover Post

```json
{
  "event": "discover.post.created.v1",
  "postId": "post-uuid",
  "placeId": "node/12345678"
}
```

### Post Liked

```json
{
  "event": "discover.post.liked.v1",
  "postId": "post-uuid",
  "likeCount": 25
}
```

### Provider Verification Status Changed

```json
{
  "event": "providers.status_changed.v1",
  "providerId": "provider-uuid",
  "status": "verified"
}
```

---

## Identity & Auth Endpoints

### Request OTP

```
POST /v1/auth/otp/request
Content-Type: application/json

{ "phone": "+9647701234567" }
```

**Response 200:** `{ "expiresAt": "2026-10-16T09:10:00Z" }`

**Response 429** (OTP rate limit):

```json
{
  "type": "about:blank",
  "title": "Too many OTP requests",
  "status": 429,
  "code": "too_many_requests",
  "retryAfterMs": 600000
}
```

### Verify OTP

```
POST /v1/auth/otp/verify
Content-Type: application/json

{
  "phone": "+9647701234567",
  "code": "123456"
}
```

**Response 200:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": "2026-10-16T09:15:00Z",
  "userId": "user-uuid",
  "isNewUser": false
}
```

The refresh token is set as an HTTP-only cookie `refresh_token`.

**Response 401** (wrong code):

```json
{ "code": "invalid_otp" }
```

**Response 410** (expired):

```json
{ "code": "otp_expired" }
```

### Refresh Access Token

```
POST /v1/auth/token/refresh
Cookie: refresh_token=<token>
```

**Response 200:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": "2026-10-16T09:30:00Z"
}
```

### Logout

```
DELETE /v1/auth/sessions
Authorization: Bearer <jwt>
```

Invalidates the current refresh token.

**Response 204.**

### Get Own Profile

```
GET /v1/auth/me
Authorization: Bearer <jwt>
```

**Response 200:**

```json
{
  "userId": "user-uuid",
  "phone": "+9647701234567",
  "displayName": "أحمد البغدادي",
  "username": "ahmed_baghdad",
  "role": "user",
  "createdAt": "2026-09-01T00:00:00Z"
}
```

### Update Profile

```
PATCH /v1/auth/me
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "displayName": "أحمد محمد البغدادي",
  "username": "ahmed_baghdadi"
}
```

**Response 200:** Updated profile.

### Delete Account

```
DELETE /v1/auth/me
Authorization: Bearer <jwt>
Content-Type: application/json

{ "confirm": true }
```

Schedules the account for deletion per CLAUDE.md rule 6 / ADR-0007. All personal data is deleted within 30 days.

**Response 200:** `{ "scheduledAt": "2026-10-16T09:00:00Z", "deletesAt": "2026-11-15T09:00:00Z" }`
