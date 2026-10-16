# Iraq Smart Maps — Complete API Reference

> **Base URL**: `https://api.iraqmaps.app` (production) · `http://localhost:3000` (local dev)
>
> All endpoints are versioned under `/v1/` unless otherwise noted. The API is JSON-first;
> all request bodies and responses use `Content-Type: application/json`.
>
> **Product language**: Arabic (ar) is the primary language for user-facing data.
> Kurdish Sorani (ckb) and English (en) are supported as fallbacks.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Common Conventions](#2-common-conventions)
3. [Cities & Tiles](#3-cities--tiles)
4. [Places & Search](#4-places--search)
5. [Reviews](#5-reviews)
6. [Providers](#6-providers)
7. [Provider Promotions](#7-provider-promotions)
8. [Appointments](#8-appointments)
9. [Provider Insights](#9-provider-insights)
10. [Routing](#10-routing)
11. [Media Uploads](#11-media-uploads)
12. [Messaging (Inquiries)](#12-messaging-inquiries)
13. [Group Messaging](#13-group-messaging)
14. [AI Assistant](#14-ai-assistant)
15. [Discover Feed](#15-discover-feed)
16. [Stories](#16-stories)
17. [Events](#17-events)
18. [Challenges](#18-challenges)
19. [Marketplace](#19-marketplace)
20. [Social Graph](#20-social-graph)
21. [Check-ins & Gamification](#21-check-ins--gamification)
22. [Safety](#22-safety)
23. [Notifications](#23-notifications)
24. [Payments](#24-payments)
25. [Admin — Providers](#25-admin--providers)
26. [Admin — Discover](#26-admin--discover)
27. [Error Reference](#27-error-reference)

---

## 1. Authentication

Iraq Smart Maps uses **OTP-based phone authentication** (no passwords). After a successful login,
the server issues a short-lived JWT access token and a longer-lived refresh token.

### Flow

```
1. POST /v1/auth/otp/start    → sends a 6-digit OTP to the Iraqi phone number
2. POST /v1/auth/otp/verify   → exchanges OTP for access + refresh tokens
3. POST /v1/auth/token/refresh → exchanges refresh token for a new access token
```

### Token Format

All protected endpoints require:

```
Authorization: Bearer <access_token>
```

- **Access token**: JWT, expires in 15 minutes.
- **Refresh token**: opaque string, expires in 30 days, stored in `HttpOnly` cookie or secure storage.

### Roles

| Role | Description |
|------|-------------|
| `user` | Default authenticated user |
| `provider` | Verified business owner |
| `moderator` | Can review reported content |
| `admin` | Full admin access |

---

### POST /v1/auth/otp/start

Start phone verification — sends a 6-digit OTP via SMS.

**Request body**

```json
{
  "phone": "+9647701234567",
  "locale": "ar"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `phone` | `string` | Yes | E.164, must match `/^\+9647\d{9}$/` |
| `locale` | `"ar" \| "ckb" \| "en"` | No | SMS language; default `"ar"` |

**Responses**

| Status | Body | Notes |
|--------|------|-------|
| 202 | `{ verificationId: string, expiresAt: string }` | OTP sent |
| 400 | Problem | Invalid phone format |
| 429 | Problem | Rate limit exceeded |

**Example**

```bash
curl -X POST https://api.iraqmaps.app/v1/auth/otp/start \
  -H "Content-Type: application/json" \
  -d '{ "phone": "+9647701234567", "locale": "ar" }'
```

```json
{
  "verificationId": "6f2e8a1b-4c3d-4f9a-b2e7-1a2b3c4d5e6f",
  "expiresAt": "2026-10-16T15:30:00.000Z"
}
```

---

### POST /v1/auth/otp/verify

Exchange OTP for tokens. Creates a new user account on first login.

**Request body**

```json
{
  "verificationId": "6f2e8a1b-4c3d-4f9a-b2e7-1a2b3c4d5e6f",
  "code": "482917"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `verificationId` | `string` | Yes | From `/otp/start` |
| `code` | `string` | Yes | 6-digit numeric OTP |

**Responses**

| Status | Body | Notes |
|--------|------|-------|
| 200 | `{ accessToken, refreshToken, user }` | Successful login |
| 400 | Problem | Wrong OTP code |
| 404 | Problem | Verification not found or expired |
| 429 | Problem | Too many attempts |

**Example response**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g...",
  "user": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "phone": "+9647701234567",
    "role": "user",
    "createdAt": "2026-10-16T14:00:00.000Z"
  }
}
```

---

### POST /v1/auth/token/refresh

Exchange a refresh token for a new access token.

**Request body**

```json
{ "refreshToken": "dGhpcyBpcyBhIHJlZnJlc2g..." }
```

**Responses**

| Status | Body |
|--------|------|
| 200 | `{ accessToken, refreshToken }` |
| 401 | Problem — token invalid or expired |

---

### DELETE /v1/auth/session

Logout — invalidates the current session. Requires `Authorization: Bearer`.

**Responses**: `204 No Content`

---

## 2. Common Conventions

### Pagination

Cursor-based. Endpoints that return lists accept:

| Parameter | Type | Default | Notes |
|-----------|------|---------|-------|
| `cursor` | `string` | — | Opaque cursor from previous response |
| `limit` | `number` | 20 | Max items; varies by endpoint |

Response shape:

```json
{
  "items": [ ... ],
  "nextCursor": "eyJpZCI6IjEyMyJ9"
}
```

`nextCursor` is `null` or absent when there are no more pages.

### LngLat

Coordinates are always `[longitude, latitude]` (GeoJSON order), e.g. `[44.3661, 33.3152]` for Baghdad.

### Problem Details (RFC 9457)

All errors use this shape:

```json
{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "code": "rate_limit_exceeded",
  "detail": "Try again after 60 seconds."
}
```

`code` is a stable machine-readable key used by the mobile app for i18n.

### Estimate

Prices and crowding values are never bare numbers. They always carry provenance:

```json
{
  "value": "moderate",
  "source": "user_report",
  "observedAt": "2026-10-16T12:00:00.000Z",
  "confidence": 0.82
}
```

### Rate Limits

Default limits (may tighten per endpoint):

| Tier | Limit |
|------|-------|
| Unauthenticated | 30 req/min |
| Authenticated | 120 req/min |
| OTP endpoints | 5 req/15min per phone |
| Assistant chat | 20 messages/day |

---

## 3. Cities & Tiles

The cities contract exposes the map configuration and a fallback tile/glyph server.

### GET /v1/cities

List all available cities with their map configuration.

**Authentication**: None required

**Responses**

| Status | Body |
|--------|------|
| 200 | `{ items: CityDescriptor[] }` |

**CityDescriptor schema**

```json
{
  "id": "baghdad",
  "nameAr": "بغداد",
  "bbox": [44.1, 33.1, 44.7, 33.7],
  "tilesUrl": "pmtiles://https://cdn.iraqmaps.app/tiles/baghdad.pmtiles",
  "glyphsUrl": "/v1/cities/baghdad/glyphs/{fontstack}/{range}.pbf",
  "attribution": "© OpenStreetMap contributors",
  "satellite": {
    "kind": "sentinel2",
    "url": "https://cdn.iraqmaps.app/satellite/baghdad/{z}/{x}/{y}.webp",
    "minZoom": 10,
    "maxZoom": 18
  }
}
```

**Example**

```bash
curl https://api.iraqmaps.app/v1/cities
```

---

### GET /v1/cities/:id/tiles/:z/:x/:y

Fallback tile server. The mobile app fetches tiles directly from PMTiles when possible;
this endpoint serves as a fallback for devices that cannot use the PMTiles protocol.

**Path params**: `id` (city slug), `z`, `x`, `y` (tile coordinates)

**Responses**

| Status | Body | Notes |
|--------|------|-------|
| 200 | `Uint8Array` | `application/vnd.mapbox-vector-tile` |
| 204 | — | No tile at this address |
| 400 | Problem | Invalid coordinates |
| 404 | Problem | City not found |

---

### GET /v1/cities/:id/glyphs/:fontstack/:range

Fallback glyph server for map text rendering.

- `fontstack`: e.g., `Noto Sans Arabic Regular`
- `range`: e.g., `0-255.pbf`

**Responses**: `200` (`application/x-protobuf`), `400`, `404`

---

## 4. Places & Search

The places contract is the core of the map experience — search, nearby, and place detail.

### GET /v1/search

Full-text search for places in a city. Uses `pg_trgm` with optional proximity boosting.

**Authentication**: None required

**Query parameters**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `q` | `string` | Yes | Search query, 1–100 chars |
| `city` | `string` | Yes | City slug, e.g. `baghdad` |
| `near` | `string` | No | `"lng,lat"` — boosts nearby results |
| `lang` | `"ar"\|"ckb"\|"en"` | No | Response language; default `ar` |
| `limit` | `number` | No | 1–50; default 20 |

**Response**

```json
{
  "items": [
    {
      "id": "way-123456789",
      "kind": "place",
      "names": { "ar": "مطعم الشرق", "en": "Al-Sharq Restaurant" },
      "category": "restaurant",
      "area": { "ar": "الكرادة", "en": "Karrada" },
      "location": [44.3920, 33.3295],
      "distanceM": 342
    }
  ]
}
```

**PlaceSummary fields**

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Stable place ID (OSM ID or `p<providerId>`) |
| `kind` | `"place"\|"street"\|"area"` | Place type |
| `names` | `{ ar, ckb?, en? }` | Localised names |
| `category` | `string\|null` | OSM category slug; null for streets/areas |
| `area` | `PlaceNames\|null` | Neighbourhood, when known |
| `location` | `[lng, lat]` | WGS-84 coordinates |
| `distanceM` | `number\|null` | Distance from `near`; null when no `near` |

**Error codes**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `invalid_query` | `q` is empty or contains control characters |
| 429 | `rate_limit_exceeded` | Too many requests |

**Example**

```bash
curl "https://api.iraqmaps.app/v1/search?q=مطعم&city=baghdad&near=44.3661,33.3152&lang=ar"
```

---

### GET /v1/places/nearby

POIs within a radius of a point, sorted by distance.

**Query parameters**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `city` | `string` | Yes | City slug |
| `near` | `string` | Yes | `"lng,lat"` — center point |
| `radiusM` | `number` | No | 50–5000 metres; default 1000 |
| `category` | `string` | No | Filter by OSM category |
| `limit` | `number` | No | 1–50; default 20 |

**Response**: same `SearchResult` shape as `/v1/search`.

**Example**

```bash
curl "https://api.iraqmaps.app/v1/places/nearby?city=baghdad&near=44.3920,33.3295&radiusM=500&category=cafe"
```

```json
{
  "items": [
    {
      "id": "node-987654321",
      "kind": "place",
      "names": { "ar": "كافيه البغدادي", "en": "Al-Baghdadi Cafe" },
      "category": "cafe",
      "area": { "ar": "المنصور", "en": "Mansour" },
      "location": [44.3891, 33.3310],
      "distanceM": 87
    }
  ]
}
```

---

### GET /v1/places/:id

Full place details including opening hours, provider section, crowding, and price estimates.

**Authentication**: None required (provider details require provider's consent)

**Path params**: `id` — place ID

**Response**

```json
{
  "id": "way-123456789",
  "kind": "place",
  "names": { "ar": "مطعم الشرق", "en": "Al-Sharq Restaurant" },
  "category": "restaurant",
  "area": { "ar": "الكرادة" },
  "location": [44.3920, 33.3295],
  "hoursRaw": "Mo-Fr 11:00-23:00; Sa-Su 10:00-00:00",
  "osmContacts": {
    "phone": "+9647801234567",
    "website": "https://alsharq.iq"
  },
  "source": "osm",
  "attribution": "© OpenStreetMap contributors",
  "provider": {
    "providerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "verified": true,
    "photos": [
      { "assetId": "...", "url": "https://cdn.iraqmaps.app/..." }
    ],
    "hours": "Mo-Fr 11:00-23:00",
    "social": [{ "kind": "instagram", "url": "https://instagram.com/alsharq" }],
    "phone": "+9647801234567",
    "avgResponseHours": 2
  },
  "crowding": {
    "value": "moderate",
    "source": "user_report",
    "observedAt": "2026-10-16T12:00:00.000Z",
    "confidence": 0.75
  },
  "priceLevel": {
    "value": 2,
    "source": "provider",
    "observedAt": "2026-10-15T09:00:00.000Z",
    "confidence": 0.9
  }
}
```

**PlaceDetails additional fields**

| Field | Type | Notes |
|-------|------|-------|
| `hoursRaw` | `string\|null` | OSM `opening_hours` syntax; client evaluates "open now" |
| `osmContacts` | `{ phone?, website? }` | Public OSM tags; shown with "From OpenStreetMap" badge |
| `source` | `"osm"\|"provider"` | Origin of the place data |
| `attribution` | `string` | OSM attribution string |
| `provider` | `PlaceProviderSection\|undefined` | Verified provider data, consent-filtered |
| `crowding` | `Estimate<string>\|null` | Crowding level; null when no data |
| `priceLevel` | `Estimate<number>\|null` | Price level 1–4; null when no data |

**Error codes**

| Status | Code | Meaning |
|--------|------|---------|
| 404 | `not_found` | Place not found |

---

### GET /v1/search/suggestions

Autocomplete suggestions — names only, no full details. Fast trigram-only search.
Returns up to 5 results.

**Query parameters**

| Param | Type | Required |
|-------|------|----------|
| `q` | `string` | Yes |
| `city` | `string` | Yes |
| `lang` | `string` | No |

**Response**

```json
{
  "items": [
    { "id": "way-123456789", "name": "مطعم الشرق" },
    { "id": "node-987654321", "name": "مطعم الشرق الأوسط" }
  ]
}
```

---

## 5. Reviews

Users can submit, list, and delete reviews for places. One review per user per place (upsert).

### POST /v1/places/:placeId/reviews

Submit or update the authenticated user's review.

**Authentication**: Required

**Request body**

```json
{
  "rating": 4,
  "text": "مطعم ممتاز، الأكل لذيذ والخدمة سريعة",
  "photoAssetIds": ["a1b2c3d4-...", "e5f6g7h8-..."]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `rating` | `number` | Yes | 1–5 integer |
| `text` | `string` | No | Up to 500 chars |
| `photoAssetIds` | `string[]` | No | Up to 5 ready asset IDs |

**Responses**

| Status | Body |
|--------|------|
| 201 | `Review` |
| 400 | `{ code: string }` |
| 401 | `{ code: "unauthenticated" }` |

**Review schema**

```json
{
  "id": "f1e2d3c4-b5a6-7890-abcd-ef0123456789",
  "placeId": "way-123456789",
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "rating": 4,
  "text": "مطعم ممتاز، الأكل لذيذ والخدمة سريعة",
  "photoAssetIds": [],
  "createdAt": "2026-10-16T14:30:00.000Z"
}
```

---

### GET /v1/places/:placeId/reviews

Paginated list of reviews with aggregate summary.

**Query params**: `cursor` (optional)

**Response**

```json
{
  "items": [ /* Review[] */ ],
  "nextCursor": "eyJpZCI6IjUifQ==",
  "summary": {
    "placeId": "way-123456789",
    "count": 47,
    "average": 4.2,
    "starBreakdown": { "1": 2, "2": 3, "3": 8, "4": 18, "5": 16 }
  }
}
```

---

### DELETE /v1/places/:placeId/reviews/mine

Delete the authenticated user's own review.

**Authentication**: Required

**Responses**: `200: { ok: true }`, `404`

---

### GET /v1/places/:placeId/reviews/summary

Aggregate rating summary only, without listing individual reviews.

**Response**: `RatingSummary` (see above)

---

## 6. Providers

A provider is a verified business owner linked to a place. Providers manage their profile,
photos, prices, and contact consents.

**Status lifecycle**: `draft → pending → verified | suspended`

Nothing is publicly visible until the provider reaches `verified` status.

### POST /v1/providers

Create a new provider profile. One provider per authenticated user; returns `409` if one already exists.

**Authentication**: Required

**Request body**

```json
{
  "name": "مطعم الشرق",
  "category": "restaurant",
  "location": [44.3920, 33.3295]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | `string` | Yes | 1–120 chars |
| `category` | `string` | Yes | OSM place category |
| `location` | `[lng, lat]` | No | Business coordinates |

**Responses**

| Status | Body | Notes |
|--------|------|-------|
| 201 | `ProviderMe` | Created |
| 400 | Problem | Validation error |
| 401 | Problem | Not authenticated |
| 409 | Problem | Provider already exists |

**ProviderMe schema**

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "draft",
  "name": "مطعم الشرق",
  "category": "restaurant",
  "location": [44.3920, 33.3295],
  "phone": null,
  "claimedPlaceId": null,
  "hoursRaw": null,
  "prices": [],
  "links": [],
  "photos": [],
  "consents": [],
  "suspensionReason": null,
  "avgResponseHours": null
}
```

---

### GET /v1/providers/me

Get the authenticated user's provider profile.

**Responses**: `200: ProviderMe`, `401`, `404` (no provider yet)

---

### PATCH /v1/providers/me

Update the provider profile. All fields optional.

**Request body**

```json
{
  "name": "مطعم الشرق الجديد",
  "hoursRaw": "Mo-Fr 11:00-23:00; Sa-Su 10:00-00:00",
  "prices": [
    {
      "label": "وجبة رئيسية",
      "min": 5000,
      "max": 15000,
      "currency": "IQD"
    }
  ],
  "links": [
    { "kind": "instagram", "url": "https://instagram.com/alsharq" }
  ],
  "photoAssetIds": ["a1b2c3d4-..."],
  "avgResponseHours": 3
}
```

**Field notes**

- `prices`: up to 30 price ranges; `min <= max` required
- `links`: up to 10 social links; only `https://` URLs
- `photoAssetIds`: replaces the current photo list; up to 10
- `avgResponseHours`: self-reported typical reply time, 1–168 hours

**Responses**: `200: ProviderMe`, `400`, `401`, `404`, `409`

---

### POST /v1/providers/me/phone/start

Start business phone verification. Sends an OTP to the given number.

**Request body**

```json
{ "phone": "+9647701234567", "locale": "ar" }
```

**Responses**

| Status | Body |
|--------|------|
| 202 | `{ verificationId: string, expiresAt: string }` |
| 400 | Problem |
| 429 | Problem — too many attempts |

---

### POST /v1/providers/me/phone/confirm

Confirm the OTP sent to the business phone.

**Request body**

```json
{
  "verificationId": "...",
  "code": "482917"
}
```

**Responses**: `200: ProviderMe`, `400`, `429`

---

### POST /v1/providers/me/claim

Claim an existing OSM place as the provider's business. One place per provider.

**Request body**

```json
{ "placeId": "way-123456789" }
```

**Responses**

| Status | Notes |
|--------|-------|
| 200 | `ProviderMe` with `claimedPlaceId` set |
| 404 | Place not found |
| 409 | Place already claimed by another provider |

---

### POST /v1/providers/me/submit

Submit the provider profile for admin verification. The business phone must be verified first.

**Body**: empty

**Responses**

| Status | Notes |
|--------|-------|
| 200 | `ProviderMe` with `status: "pending"` |
| 409 | Phone not verified, or not in `draft` status |

---

### GET /v1/providers/me/consents

Get the full consent ledger — which data-sharing scopes are currently active and the full audit trail.

**Consent scopes**

| Scope | Effect |
|-------|--------|
| `photos` | Show provider photos on the place card |
| `social_links` | Show social media links on the place card |
| `whatsapp_messages` | Allow users to message via WhatsApp |
| `show_phone` | Display business phone on the place card |
| `show_prices` | Display price ranges on the place card |

**Response**

```json
{
  "active": ["photos", "show_phone"],
  "records": [
    {
      "scope": "photos",
      "grantedAt": "2026-10-01T10:00:00.000Z",
      "revokedAt": null,
      "evidence": { "textVersion": "v1.0.0", "locale": "ar" }
    }
  ]
}
```

---

### PUT /v1/providers/me/consents/:scope

Grant or revoke a single consent scope.

**Path params**: `scope` — one of the consent scope values above

**Request body**

```json
{
  "granted": true,
  "evidence": { "textVersion": "v1.0.0", "locale": "ar" }
}
```

**Response**: `200: ConsentLedger`

**Note**: Revoking a scope takes effect on the next request — the data is hidden immediately.

---

## 7. Provider Promotions

Providers can create time-limited promotions shown on their place card.

### POST /v1/providers/promotions

**Authentication**: Required (provider)

**Request body**

```json
{
  "title": "خصم رمضان",
  "description": "خصم 20% على جميع الوجبات خلال شهر رمضان المبارك",
  "discountPct": 20,
  "validFrom": "2027-03-01T00:00:00.000Z",
  "validTo": "2027-03-31T23:59:59.000Z",
  "conditions": "لا يسري مع العروض الأخرى",
  "code": "RAMADAN20"
}
```

**Responses**: `201: ProviderPromotion`, `400`, `401`, `404`

**ProviderPromotion schema**

```json
{
  "id": "...",
  "providerId": "...",
  "title": "خصم رمضان",
  "description": "خصم 20% على جميع الوجبات",
  "discountPct": 20,
  "validFrom": "2027-03-01T00:00:00.000Z",
  "validTo": "2027-03-31T23:59:59.000Z",
  "conditions": "لا يسري مع العروض الأخرى",
  "code": "RAMADAN20",
  "redeemedCount": 0,
  "status": "active",
  "createdAt": "2026-10-16T10:00:00.000Z"
}
```

---

### GET /v1/providers/promotions

List the authenticated provider's own active promotions.

**Responses**: `200: ProviderPromotion[]`

---

### GET /v1/providers/:providerId/promotions

List a specific provider's public promotions (no auth required).

**Responses**: `200: ProviderPromotion[]`, `404`

---

### DELETE /v1/providers/promotions/:id

Delete a promotion.

**Responses**: `204`, `401`, `403`, `404`

---

## 8. Appointments

Users request appointments with a provider's business. Providers confirm or cancel.

### POST /v1/providers/:providerId/appointments/request

Request an appointment.

**Authentication**: Required

**Request body**

```json
{
  "date": "2026-10-20",
  "time": "14:00",
  "service": "قص شعر وتشذيب لحية",
  "notes": "أفضل المقعد الأول"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | `string` | Yes | `YYYY-MM-DD` |
| `time` | `string` | Yes | `HH:MM` (24-hour) |
| `service` | `string` | Yes | Service description, up to 200 chars |
| `notes` | `string` | No | Up to 500 chars |

**Responses**: `201: Appointment`, `400`, `401`, `404`

**Appointment schema**

```json
{
  "id": "...",
  "providerId": "...",
  "userId": "...",
  "date": "2026-10-20",
  "time": "14:00",
  "service": "قص شعر وتشذيب لحية",
  "status": "pending",
  "notes": "أفضل المقعد الأول",
  "createdAt": "2026-10-16T10:00:00.000Z",
  "updatedAt": "2026-10-16T10:00:00.000Z"
}
```

**Appointment statuses**: `pending → confirmed | cancelled → completed`

---

### GET /v1/providers/:providerId/appointments

List appointments for a provider's inbox.

**Authentication**: Required (must be the provider owner)

**Responses**: `200: Appointment[]`, `401`, `403`, `404`

---

### PATCH /v1/providers/:providerId/appointments/:id

Update appointment status.

**Authentication**: Required (provider owner)

**Request body**

```json
{ "status": "confirmed" }
```

`status` must be one of `confirmed`, `cancelled`, `completed`.

**Responses**: `200: Appointment`, `400`, `401`, `403`, `404`

---

### GET /v1/appointments

List the authenticated user's own appointments across all providers.

**Responses**: `200: Appointment[]`, `401`

---

## 9. Provider Insights

Analytics for provider owners.

### GET /v1/providers/:providerId/insights

**Authentication**: Required (must be the provider owner)

**Query params**: `range` — `"7d" | "30d" | "90d"` (default `"30d"`)

**Response**

```json
{
  "providerId": "...",
  "range": "30d",
  "topKeywords": [
    { "keyword": "مطعم", "count": 142 },
    { "keyword": "أكل", "count": 98 }
  ],
  "peakHours": [
    { "hour": 13, "count": 47 },
    { "hour": 20, "count": 51 }
  ],
  "sourceBreakdown": {
    "mapSearch": 210,
    "direct": 43,
    "discover": 78
  },
  "conversionRate": 0.34
}
```

---

## 10. Routing

Calculate driving or walking routes using the Valhalla engine.
Maneuver types are normalized to a closed set (ADR-0006); the mobile app generates
turn instructions from i18n templates in Arabic, Kurdish, and English.

### POST /v1/routes

**Authentication**: None required

**Request body**

```json
{
  "origin": [44.3661, 33.3152],
  "destination": [44.3920, 33.3295],
  "waypoints": [],
  "mode": "car"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `origin` | `[lng, lat]` | Yes | Start point |
| `destination` | `[lng, lat]` | Yes | End point |
| `waypoints` | `[lng, lat][]` | No | Up to 5 intermediate points |
| `mode` | `"car"\|"walk"` | Yes | Travel mode |

**Response**

```json
{
  "polyline6": "_c`|Em...",
  "distanceM": 4328,
  "durationS": 960,
  "bbox": [44.3661, 33.3152, 44.3920, 33.3295],
  "maneuvers": [
    {
      "type": "depart",
      "modifier": "right",
      "streetNames": ["شارع فلسطين"],
      "distanceM": 850,
      "durationS": 180,
      "beginShapeIndex": 0
    },
    {
      "type": "turn",
      "modifier": "left",
      "streetNames": ["شارع الكرادة الداخل"],
      "distanceM": 1200,
      "durationS": 300,
      "beginShapeIndex": 24
    },
    {
      "type": "arrive",
      "streetNames": [],
      "distanceM": 0,
      "durationS": 0,
      "beginShapeIndex": 87
    }
  ]
}
```

**Maneuver types**: `depart`, `arrive`, `continue`, `turn`, `uturn`, `ramp`, `exit`,
`fork`, `merge`, `roundabout_enter`, `roundabout_exit`, `ferry_enter`, `ferry_exit`

**Modifiers**: `straight`, `slight_left`, `left`, `sharp_left`, `slight_right`, `right`, `sharp_right`

**Error codes**

| Status | Code | Notes |
|--------|------|-------|
| 404 | `no_route` | No route between the points |
| 429 | `rate_limit_exceeded` | Too many requests |
| 503 | `routing_unavailable` | Valhalla engine timed out or down |

---

## 11. Media Uploads

Two-step upload flow: request a ticket → PUT directly to storage → complete.

### POST /v1/media/uploads

Request an upload ticket.

**Authentication**: Required

**Request body**

```json
{
  "purpose": "provider_photo",
  "mime": "image/jpeg",
  "size": 2048576
}
```

| Field | Type | Notes |
|-------|------|-------|
| `purpose` | `"provider_photo"\|"provider_logo"` | What the asset will be used for |
| `mime` | `"image/jpeg"\|"image/png"\|"image/webp"` | File type |
| `size` | `number` | File size in bytes; max 10 MB |

**Response**

```json
{
  "assetId": "c3d4e5f6-a1b2-7890-cdef-123456789abc",
  "uploadUrl": "https://cdn.iraqmaps.app/...",
  "headers": {
    "Content-Type": "image/jpeg",
    "Content-Length": "2048576"
  },
  "expiresAt": "2026-10-16T15:00:00.000Z"
}
```

**Step 2**: PUT the file bytes directly to `uploadUrl` with the exact `headers`.

---

### POST /v1/media/uploads/:assetId/complete

Signal that the upload is done. Triggers server-side processing (resize, EXIF strip).

**Body**: empty

**Responses**

| Status | Body | Notes |
|--------|------|-------|
| 202 | `{ assetId, status: "processing" }` | Processing started |
| 409 | Problem | Nothing uploaded yet, or already completed |

When processing is done, the event `media.asset.ready.v1` is published.

---

### GET /v1/media/:assetId/url

Get a short-lived signed read URL for a ready asset.

**Query params**: `size` — `"thumbnail"` (320px), `"medium"` (800px), `"full"` (original)

**Responses**

| Status | Body |
|--------|------|
| 200 | `{ url: string, expiresAt: string }` |
| 409 | Problem — not ready yet |

---

### POST /v1/media/:assetId/resize

Generate and cache a resized variant.

**Request body**: `{ "size": "thumbnail" | "medium" | "full" }`

**Responses**: `200: { url, expiresAt }`, `400`, `404`, `409`

---

## 12. Messaging (Inquiries)

Users send inquiries to up to 5 places at once. The system delivers via in-app messaging
or WhatsApp depending on the provider's consents.

### POST /v1/inquiries

Send an inquiry to one or more places.

**Authentication**: Required

**Required header**: `Idempotency-Key: <uuid>` — prevents double-sends on retries

**Request body**

```json
{
  "text": "هل لديكم طاولة لأربعة أشخاص الجمعة المقبلة الساعة السابعة مساءً؟",
  "placeIds": ["way-123456789", "node-987654321"],
  "confirm": true
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `text` | `string` | Yes | 1–500 chars |
| `placeIds` | `string[]` | Yes | 1–5 place IDs |
| `confirm` | `true` | Yes | Explicit user consent to send |

**Responses**

| Status | Body | Notes |
|--------|------|-------|
| 201 | `Inquiry` | Sent |
| 400 | `{ code: string }` | Validation error |
| 429 | `{ code: "daily_limit_exceeded" }` | Daily send limit reached |

**Inquiry schema**

```json
{
  "id": "d4e5f6a1-b2c3-7890-def0-123456789abc",
  "userId": "...",
  "text": "هل لديكم طاولة لأربعة أشخاص...",
  "targets": [
    {
      "placeId": "way-123456789",
      "channel": "in_app",
      "status": "delivered"
    },
    {
      "placeId": "node-987654321",
      "channel": "whatsapp",
      "status": "sent",
      "handoffLink": {
        "type": "wa_me",
        "url": "https://wa.me/9647801234567?text=...",
        "copyText": "هل لديكم طاولة..."
      }
    }
  ],
  "createdAt": "2026-10-16T14:00:00.000Z",
  "readAt": null
}
```

**Delivery channels**: `in_app`, `whatsapp`, `handoff`

**Message statuses**: `queued`, `sent`, `delivered`, `read`, `replied`, `failed`, `handed_off`

---

### GET /v1/inquiries

List the authenticated user's sent inquiries (paginated).

**Query params**: `cursor` (optional)

**Response**: `{ items: Inquiry[], nextCursor?: string }`

---

### GET /v1/inquiries/:id

Get a single inquiry by ID.

**Responses**: `200: Inquiry`, `404`

---

### POST /v1/inquiries/:id/read

Mark an inquiry as read by the user.

**Body**: `{}`

**Responses**: `200: { ok: true }`, `404`

---

### GET /v1/provider/inbox

List inquiries received by the authenticated provider (paginated).

**Authentication**: Required (provider)

**Response**: `{ items: Inquiry[], nextCursor?: string }`

---

### POST /v1/provider/inbox/:id/reply

Reply to an inquiry as a provider.

**Request body**

```json
{ "text": "نعم، لدينا طاولة متاحة. يرجى الحضور قبل الساعة السابعة." }
```

**Responses**: `200: { ok: true }`, `404`

---

### POST /v1/provider/inbox/opt-out

Opt the provider out of receiving future in-app inquiries.

**Body**: `{}`

**Responses**: `200: { ok: true }`

---

## 13. Group Messaging

Users can create groups, send messages, and add members.

### POST /v1/messaging/groups

Create a group.

**Authentication**: Required

**Request body**

```json
{
  "name": "رحلة البصرة",
  "memberIds": ["uuid-1", "uuid-2"]
}
```

**Responses**: `201: Group`, `400`, `401`

---

### GET /v1/messaging/groups

List the authenticated user's groups.

**Query params**: `cursor` (optional)

**Response**: `{ items: Group[], nextCursor?: string }`

---

### POST /v1/messaging/groups/:groupId/messages

Send a message to a group.

**Request body**: `{ "text": "متى نلتقي؟" }` (up to 2000 chars)

**Responses**: `201: GroupMessage`, `400`, `403`, `404`

---

### GET /v1/messaging/groups/:groupId/messages

List messages in a group (paginated, newest first).

**Query params**: `cursor` (optional), `limit` (max 50, default 20)

---

### POST /v1/messaging/groups/:groupId/members

Add a member to a group.

**Request body**

```json
{ "userId": "uuid", "role": "member" }
```

**Roles**: `"admin"`, `"member"`

**Responses**: `201: GroupMember`, `403`, `404`, `409`

---

## 14. AI Assistant

A Claude-powered travel and business guide for Iraq. The assistant can search places,
get directions, check crowding, and initiate contact with businesses.
All calls are server-side; the Claude API key never reaches the client.

**Daily limit**: 20 messages per user.

### POST /v1/assistant/chat

Send a message in a session.

**Authentication**: Required

**Request body**

```json
{
  "sessionId": "e5f6a1b2-c3d4-7890-ef01-234567890abc",
  "messages": [
    { "role": "user", "content": "أين أفضل مطعم سمك في بغداد؟" }
  ]
}
```

| Field | Type | Notes |
|-------|------|-------|
| `sessionId` | `string (uuid)` | Create a fresh UUID for a new session |
| `messages` | `AssistantMessage[]` | Full conversation history |

**Response**

```json
{
  "sessionId": "e5f6a1b2-c3d4-7890-ef01-234567890abc",
  "reply": "بناءً على البيانات المتاحة، إليك أفضل مطاعم السمك في بغداد...",
  "focusPlaceIds": ["way-111", "way-222", "way-333"],
  "focusPlaceNames": {
    "way-111": "مطعم أبو نواس",
    "way-222": "مطعم السمك البغدادي"
  },
  "composeParams": null
}
```

**Response fields**

| Field | Notes |
|-------|-------|
| `reply` | The assistant's response in Arabic |
| `focusPlaceIds` | Up to 5 place IDs to highlight on the map |
| `focusPlaceNames` | Display names for map pins |
| `composeParams` | When set, the app opens the compose screen to send an inquiry |

**Rate limit response (429)**

```json
{
  "type": "about:blank",
  "title": "Daily limit reached",
  "status": 429,
  "code": "daily_limit_exceeded"
}
```

---

### GET /v1/assistant/sessions/:sessionId

Get the full message history of a session.

**Responses**

```json
{
  "sessionId": "...",
  "messages": [
    { "role": "user", "content": "أين أفضل مطعم سمك في بغداد؟" },
    { "role": "assistant", "content": "..." }
  ],
  "createdAt": "2026-10-16T10:00:00.000Z"
}
```

---

### DELETE /v1/assistant/sessions/:sessionId

Delete a session (clears history).

**Responses**: `204`, `404`

---

### POST /v1/assistant/plan-trip

Generate a day-by-day trip itinerary.

**Authentication**: Required

**Request body**

```json
{
  "destination": "أربيل",
  "startDate": "2026-12-20",
  "endDate": "2026-12-23",
  "interests": ["culture", "food", "history"],
  "budget": "mid",
  "partySize": 2
}
```

| Field | Notes |
|-------|-------|
| `interests` | `food`, `culture`, `shopping`, `nature`, `history`, `religious` |
| `budget` | `budget`, `mid`, `luxury` |

**Response**

```json
{
  "planId": "...",
  "destination": "أربيل",
  "summary": "رحلة ثقافية وتاريخية لمدة 4 أيام في أربيل...",
  "days": [
    {
      "day": 1,
      "date": "2026-12-20",
      "theme": "قلعة أربيل والمدينة القديمة",
      "activities": [
        {
          "time": "10:00",
          "title": "زيارة قلعة أربيل",
          "description": "قلعة تاريخية مدرجة على قائمة اليونسكو",
          "placeId": "way-456789",
          "estimatedCost": "مجاني",
          "duration": "2 ساعة"
        }
      ],
      "totalEstimatedCost": "50,000 دينار"
    }
  ],
  "tips": ["احجز فندقك مسبقاً", "الطقس بارد في ديسمبر، أحضر ملابس دافئة"]
}
```

---

### GET /v1/assistant/recommendations

AI-powered place recommendations by category.

**Query params**: `category` (required), `lat`, `lng` (optional for proximity)

**Category values**: `restaurants`, `cafes`, `hotels`, `shopping`, `attractions`

**Response**

```json
{
  "category": "restaurants",
  "places": [
    {
      "placeId": "way-123456789",
      "name": "مطعم أبو نواس",
      "address": "شارع أبو نواس، الكرادة",
      "category": "restaurant",
      "aiReason": "مشهور بأسماك المسگوف الطازجة على ضفاف نهر دجلة",
      "estimatedPrice": "30,000 – 60,000 دينار للشخص",
      "rating": 4.3
    }
  ],
  "contextNote": "بناءً على تقييمات المستخدمين وبيانات الزيارات"
}
```

---

### POST /v1/assistant/search

Natural language place search (NLP).

**Request body**

```json
{
  "query": "مطعم عراقي قريب يقبل حجوزات",
  "lat": 33.3152,
  "lng": 44.3661
}
```

**Response**

```json
{
  "query": "مطعم عراقي قريب يقبل حجوزات",
  "parsedFilters": { "category": "restaurant", "cuisine": "iraqi", "hasReservations": true },
  "results": [
    {
      "placeId": "way-123456789",
      "name": "مطعم الشرق",
      "address": "الكرادة، بغداد",
      "category": "restaurant",
      "matchReason": "مطعم عراقي يقبل الحجوزات في منطقتك",
      "distanceMeters": 420,
      "score": 0.92
    }
  ],
  "totalFound": 12
}
```

---

## 15. Discover Feed

A social feed where users post photos, tips, events, and offers tied to places.

### GET /v1/discover/feed

Paginated chronological feed.

**Authentication**: None required

**Query params**

| Param | Type | Notes |
|-------|------|-------|
| `cursor` | `string` | Pagination cursor |
| `limit` | `number` | Max 20, default 10 |
| `category` | `string` | Filter: `food`, `transport`, `tourism`, `shopping`, `services`, `other` |

**DiscoverPost schema**

```json
{
  "id": "f1e2d3c4-...",
  "authorId": "a1b2c3d4-...",
  "placeId": "way-123456789",
  "type": "photo",
  "category": "food",
  "body": "وجبة المسگوف في مطعم أبو نواس 🐟 الأفضل في بغداد!",
  "mediaAssetIds": ["uuid1", "uuid2"],
  "likeCount": 47,
  "commentCount": 12,
  "viewCount": 230,
  "bookmarkCount": 8,
  "mentionedUserIds": [],
  "isLikedByMe": false,
  "authorVerified": true,
  "isPinned": false,
  "createdAt": "2026-10-16T12:00:00.000Z"
}
```

**Post types**: `photo`, `tip`, `event`, `offer`

---

### POST /v1/discover/posts

Create a post.

**Authentication**: Required

**Request body**

```json
{
  "type": "photo",
  "category": "food",
  "body": "وجبة المسگوف في مطعم أبو نواس! #مسگوف #بغداد",
  "placeId": "way-123456789",
  "mediaAssetIds": ["uuid1"],
  "mentionedUserIds": []
}
```

**Rate limit**: Too many posts → `429` with `retryAfterMs`

---

### GET /v1/discover/posts/:postId

Get a single post.

**Responses**: `200: DiscoverPost`, `404`

---

### PATCH /v1/discover/posts/:postId

Edit a post's body text (own post only).

**Request body**: `{ "body": "النص الجديد" }`

**Responses**: `200: DiscoverPost`, `403`, `404`

---

### DELETE /v1/discover/posts/:postId

Delete own post.

**Responses**: `204`, `403`, `404`

---

### PATCH /v1/discover/posts/:postId/pin

Pin or unpin a post (provider only — pinned to top of profile feed).

**Request body**: `{ "pinned": true }`

**Responses**: `200: DiscoverPost`, `403`, `404`

---

### POST /v1/discover/posts/:postId/like

Like a post.

**Body**: `{}`

**Response**: `200: { likeCount: number }`

---

### DELETE /v1/discover/posts/:postId/like

Unlike a post.

**Response**: `200: { likeCount: number }`

---

### POST /v1/discover/posts/:postId/bookmark

Bookmark a post.

**Body**: `{}`

**Response**: `200: { bookmarkCount: number }`

---

### DELETE /v1/discover/posts/:postId/bookmark

Remove bookmark.

**Response**: `200: { bookmarkCount: number }`

---

### POST /v1/discover/posts/:postId/report

Report a post for review.

**Request body**: `{ "reason": "spam" | "inappropriate" | "misinformation" | "other" }`

**Responses**: `204`, `404`, `429`

---

### GET /v1/discover/posts/:postId/comments

List comments on a post.

**Query params**: `cursor`, `limit` (max 20, default 10)

**Response**: `{ items: DiscoverComment[], nextCursor?: string }`

---

### POST /v1/discover/posts/:postId/comments

Add a comment.

**Request body**: `{ "body": "اشتهيت!" }` (max 500 chars)

**Responses**: `201: DiscoverComment`, `404`, `422`

---

### DELETE /v1/discover/posts/:postId/comments/:commentId

Delete own comment.

**Responses**: `204`, `403`, `404`

---

### POST /v1/discover/comments/:commentId/like

Like a comment.

**Body**: `{}`

**Response**: `200: { likeCount: number }`

---

### DELETE /v1/discover/comments/:commentId/like

Unlike a comment.

**Response**: `200: { likeCount: number }`

---

### GET /v1/discover/trending

Trending posts by engagement score (last 48 hours).

**Query params**: `limit` (max 20, default 10)

**Response**: `{ items: DiscoverPost[] }`

---

### GET /v1/discover/recommended

Personalised post recommendations.

**Authentication**: Required

**Query params**: `limit` (max 20, default 10)

---

### GET /v1/discover/search

Full-text search across post bodies.

**Query params**: `q` (1–200 chars), `cursor`, `limit`

---

### GET /v1/discover/search/suggestions

Autocomplete for hashtags and users.

**Query params**: `q`

**Response**: `{ hashtags: string[], userIds: string[] }`

---

### GET /v1/discover/trending/hashtags

Top hashtags by usage in last 24h.

**Query params**: `limit` (max 50, default 10)

**Response**: `{ items: [{ hashtag: string, count: number }] }`

---

### GET /v1/discover/users/:authorId/posts

Paginated list of a user's posts.

---

### GET /v1/discover/posts/:postId/stats

Analytics for a post (own posts).

**Response**: `{ viewCount, likeCount, commentCount, uniqueViewerCount }`

---

### GET /v1/discover/posts/:postId/edits

Edit history for a post.

**Response**: `{ items: PostEditEntry[] }`

---

### GET /v1/discover/users/search

Search users by username or display name (for @mention autocomplete).

**Query params**: `q`, `limit`

---

### GET /v1/discover/users/:userId/stats

Aggregated user stats.

**Response**: `{ postCount, followersCount, followingCount, totalLikes }`

---

### POST /v1/discover/users/:userId/follow

Follow a user.

**Body**: `{}`

**Response**: `200: { followersCount: number }`

---

### DELETE /v1/discover/users/:userId/follow

Unfollow a user.

**Response**: `200: { followersCount: number }`

---

## 16. Stories

24-hour ephemeral content, visible to followers.

### POST /v1/discover/stories

Create a story.

**Authentication**: Required

**Request body**

```json
{
  "mediaUrl": "https://cdn.iraqmaps.app/story-asset/...",
  "mediaType": "image",
  "duration": 7
}
```

`duration`: display seconds (1–60); default 5.

**Responses**: `201: Story`, `400`, `401`

---

### GET /v1/discover/stories/feed

Active stories from followed users plus own stories.

**Authentication**: Required

**Response**: `{ authors: StoryAuthor[] }`

```json
{
  "authors": [
    {
      "userId": "...",
      "displayName": "أحمد الكرادي",
      "stories": [ /* Story[] */ ],
      "hasUnviewed": true
    }
  ]
}
```

---

### DELETE /v1/discover/stories/:storyId

Delete own story before it expires.

**Responses**: `204`, `403`, `404`

---

### POST /v1/discover/stories/:storyId/view

Mark a story as viewed.

**Body**: `{}`

**Responses**: `204`, `404`

---

## 17. Events

Community events with RSVP.

### POST /v1/discover/events

Create an event.

**Authentication**: Required

**Request body**

```json
{
  "title": "مهرجان الطعام البغدادي",
  "description": "احتفل بالمطبخ العراقي الأصيل في قلب بغداد",
  "lat": 33.3152,
  "lng": 44.3661,
  "address": "ساحة الفردوس، بغداد",
  "startTime": "2026-11-15T10:00:00.000Z",
  "endTime": "2026-11-15T22:00:00.000Z",
  "maxAttendees": 500,
  "imageUrl": "https://example.com/event.jpg",
  "category": "food"
}
```

**Category values**: `cultural`, `sport`, `food`, `business`, `education`, `entertainment`, `social`, `other`

---

### GET /v1/discover/events

List events with optional filters.

**Query params**

| Param | Notes |
|-------|-------|
| `category` | Filter by category |
| `fromDate` | ISO datetime — events starting after this |
| `toDate` | ISO datetime |
| `lat`, `lng`, `radiusKm` | Spatial filter (max 100 km) |

---

### GET /v1/discover/events/:eventId

Get event by ID.

---

### POST /v1/discover/events/:eventId/rsvp

RSVP to attend an event.

**Body**: `{}`

**Responses**: `204`, `400` (full), `401`, `404`

---

### DELETE /v1/discover/events/:eventId/rsvp

Cancel RSVP.

**Responses**: `204`, `401`, `404`

---

## 18. Challenges

Time-limited participation challenges (photo, check-in, review).

### GET /v1/discover/challenges

List challenges.

**Query params**: `status` — `upcoming`, `active`, `completed`

---

### GET /v1/discover/challenges/:challengeId

Get challenge detail with leaderboard.

**Response**

```json
{
  "challenge": {
    "id": "...",
    "title": "مصور بغداد",
    "description": "شارك أفضل صورة لمعالم بغداد",
    "type": "photo",
    "targetCount": 1,
    "reward": "شهادة تقدير + بادج حصري",
    "startsAt": "2026-11-01T00:00:00.000Z",
    "endsAt": "2026-11-30T23:59:59.000Z",
    "status": "active",
    "totalParticipants": 342,
    "myProgress": 0,
    "myRank": null
  },
  "leaderboard": [
    { "rank": 1, "userId": "...", "displayName": "علي المصور", "progress": 24 }
  ]
}
```

---

### POST /v1/discover/challenges/:challengeId/progress

Record progress on a challenge.

**Request body**: `{ "increment": 1 }`

**Response**: `{ newProgress: number, completed: boolean }`

---

## 19. Marketplace

Buy/sell listings within the community.

### POST /v1/discover/listings

Create a listing.

**Authentication**: Required

**Request body**

```json
{
  "title": "آيفون 15 برو مكس - جديد",
  "description": "بحالة ممتازة، لم يستخدم، مع الكرتون الأصلي",
  "price": 1500000,
  "currency": "IQD",
  "category": "electronics",
  "images": ["https://..."],
  "lat": 33.3152,
  "lng": 44.3661
}
```

**Category values**: `electronics`, `clothing`, `vehicles`, `furniture`, `food`, `services`, `real_estate`, `other`

---

### GET /v1/discover/listings

Browse listings with filters.

**Query params**: `category`, `minPrice`, `maxPrice`, `sellerId`, `cursor`, `limit`

---

### GET /v1/discover/listings/:listingId

Get a single listing.

---

### PATCH /v1/discover/listings/:listingId

Update own listing.

**Request body**: `{ title?, description?, price?, status?, images? }`

**Status values**: `active`, `sold`, `removed`

---

## 20. Social Graph

Follow/unfollow users, block, and view followers.

### POST /v1/social/follow/:userId

Follow a user (idempotent).

**Body**: `{}`

**Response**: `FollowStats`

```json
{
  "followersCount": 142,
  "followingCount": 89,
  "isFollowing": true,
  "isFollowedBy": false,
  "mutualCount": 12
}
```

---

### DELETE /v1/social/follow/:userId

Unfollow a user.

---

### GET /v1/social/followers/:userId

Paginated list of a user's followers.

**Query params**: `cursor`, `limit` (max 50)

**Response**: `{ items: FollowUser[], nextCursor?: string }`

---

### GET /v1/social/following/:userId

Paginated list of users this user follows.

---

### GET /v1/social/feed

Chronological feed of posts from followed users.

**Authentication**: Required

---

### GET /v1/social/suggestions

Suggested users to follow.

**Authentication**: Required

**Response**

```json
{
  "items": [
    {
      "userId": "...",
      "displayName": "فاطمة الموسوي",
      "isVerified": true,
      "mutualCount": 5,
      "reason": "mutual_follow"
    }
  ]
}
```

**Reason values**: `mutual_follow`, `location`, `popular`, `interest`

---

### GET /v1/social/users/:userId/profile

Full user profile.

**Response**: `UserProfile` including `followStats` and `postCount`

---

### POST /v1/social/block/:userId

Block a user. Removes them from followers and prevents future follows.

**Body**: `{}`

**Responses**: `204`, `400`, `401`

---

### DELETE /v1/social/block/:userId

Unblock a user.

---

### GET /v1/social/blocked

List users blocked by current user.

---

### GET /v1/social/mutual/:userId

Mutual followers between current user and target user.

**Query params**: `limit` (max 10)

---

### DELETE /v1/social/followers/:userId

Remove a follower from your own follower list.

---

### DELETE /v1/social/suggestions/:userId

Dismiss a follow suggestion.

---

## 21. Check-ins & Gamification

Users check into places to earn badges and maintain streaks. Baghdad timezone (UTC+3) applies
for day boundaries and streak calculations. Anti-cheat: same place twice in 24h is rejected.

### POST /v1/checkins

Check in to a place.

**Authentication**: Required

**Request body**

```json
{
  "placeId": "way-123456789",
  "method": "manual",
  "note": "زيارة أسبوعية للمطعم المفضل",
  "photos": ["uuid1"]
}
```

| Field | Notes |
|-------|-------|
| `method` | `manual` (tapped), `auto` (geofence), `qr` (QR code) |
| `note` | Optional; max 280 chars |
| `photos` | Up to 4 pre-uploaded asset IDs |

**Response**

```json
{
  "checkIn": {
    "id": "...",
    "userId": "...",
    "placeId": "way-123456789",
    "timestamp": "2026-10-16T14:00:00.000Z",
    "method": "manual",
    "note": "زيارة أسبوعية",
    "photos": [],
    "placeName": "مطعم الشرق",
    "placeCategory": "restaurant",
    "citySlug": "baghdad",
    "visitCount": 7,
    "isPioneer": false
  },
  "newBadges": [
    {
      "slug": "regular",
      "title_ar": "الزائر المنتظم",
      "description_ar": "زرت هذا المكان 10 مرات",
      "icon": "🏅",
      "earned": true,
      "progress": 1.0,
      "targetCount": 10,
      "currentCount": 10
    }
  ],
  "streak": {
    "current": 5,
    "longest": 12,
    "lastCheckIn": "2026-10-16T14:00:00.000Z",
    "activeToday": true,
    "canExtend": true
  },
  "isMilestone": false,
  "milestoneLabel_ar": null
}
```

**Error responses**

| Status | Code | Notes |
|--------|------|-------|
| 409 | `already_checked_in` | Checked in to same place in last 24h; `nextAllowedAt` in body |
| 404 | `place_not_found` | Place ID doesn't exist |

---

### GET /v1/checkins/my

Authenticated user's check-in history (paginated).

**Query params**: `cursor`, `limit` (max 50, default 20)

---

### GET /v1/checkins/place/:placeId

Public check-in history for a place (paginated).

---

### GET /v1/checkins/badges

All badges with earned/locked state for the current user.

**Response**

```json
{
  "badges": [
    {
      "slug": "first_checkin",
      "title_ar": "أول زيارة",
      "description_ar": "سجّلت أول زيارة لك!",
      "icon": "⭐",
      "hint_ar": "سجّل زيارتك لأي مكان لأول مرة",
      "earned": true,
      "progress": 1.0,
      "targetCount": 1,
      "currentCount": 1,
      "earnedAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}
```

**Available badges**: `first_checkin`, `restaurant_lover`, `shrine_visitor`, `explorer`,
`streak_7`, `streak_30`, `baghdad_king`, `ramadan_visitor`, `pioneer`, `regular`,
`night_owl`, `early_bird`, `weekend_warrior`, `road_tripper`, `cafe_hopper`,
`history_buff`, `shopaholic`, `centurion`, `eid_celebrant`

---

### GET /v1/checkins/streak

Current and longest streak for the current user.

---

### GET /v1/checkins/leaderboard

Weekly / monthly / all-time leaderboard.

**Query params**: `timeframe` — `weekly`, `monthly`, `all_time` (default `weekly`)

**Response**

```json
{
  "timeframe": "weekly",
  "entries": [
    {
      "rank": 1,
      "userId": "...",
      "displayName": "عمر النجيفي",
      "avatarAssetId": null,
      "checkInCount": 23,
      "badgeCount": 8,
      "isMe": false
    }
  ],
  "myEntry": null,
  "computedAt": "2026-10-16T00:00:00.000Z"
}
```

---

## 22. Safety

Report safety incidents, manage trusted contacts, share live location, and send emergency alerts.

### POST /v1/safety/incidents

Report a safety incident.

**Authentication**: Required

**Request body**

```json
{
  "type": "road_danger",
  "severity": "medium",
  "location": [44.3661, 33.3152],
  "cityId": "baghdad",
  "description": "حادثة مرورية على الطريق السريع",
  "ttlHours": 4,
  "anonymous": false
}
```

**Incident types**: `unsafe_area`, `checkpoint`, `flooding`, `fire`, `explosion`,
`armed_conflict`, `civil_unrest`, `kidnapping_risk`, `theft`, `road_danger`,
`medical_emergency`, `natural_disaster`, `curfew`, `other`

**Severity levels**: `low`, `medium`, `high`, `critical`

**Responses**: `201: SafetyIncident`, `400`, `401`

---

### GET /v1/safety/incidents

Get active incidents near a location.

**Query params**

| Param | Required | Notes |
|-------|----------|-------|
| `lat` | Yes | |
| `lng` | Yes | |
| `radiusKm` | No | 0.1–100; default 20 |
| `cityId` | No | Filter by city |
| `severity` | No | Minimum severity |
| `types` | No | Comma-separated types |

**Response**: Paginated `SafetyIncident[]`

---

### GET /v1/safety/incidents/:id

Get a specific incident.

---

### PATCH /v1/safety/incidents/:id/status

Update incident status (confirm or dismiss).

**Authentication**: Required (admin/moderator for most types)

**Request body**

```json
{ "status": "confirmed", "adminNote": "تحقق من التقارير الواردة" }
```

---

### PUT /v1/safety/subscriptions/me

Set alert preferences for push notifications.

**Request body**

```json
{
  "cityId": "baghdad",
  "enabledTypes": ["fire", "flooding", "road_danger"],
  "minSeverity": "medium",
  "radiusKm": 20,
  "pushEnabled": true
}
```

---

### GET /v1/safety/subscriptions/me

Get current alert preferences.

---

### GET /v1/safety/contacts

List the current user's trusted contacts.

---

### POST /v1/safety/contacts

Add a trusted contact.

**Request body**

```json
{
  "contactUserId": "...",
  "consentAcknowledged": true
}
```

The contact must accept before location sharing is active.

**Responses**: `201: TrustedContact`, `400`, `401`, `409`

---

### DELETE /v1/safety/contacts/:contactId

Remove a trusted contact.

**Responses**: `204`, `401`, `404`

---

### POST /v1/safety/location-shares

Start sharing live location with trusted contacts.

**Request body**

```json
{
  "viewerIds": ["uuid-1", "uuid-2"],
  "durationMinutes": 60,
  "emergencyTriggered": false
}
```

**Responses**: `201: SafetyLocationShare`, `400`, `401`

---

### PUT /v1/safety/location-shares/:shareId

Update location while sharing.

**Request body**: `{ "location": [lng, lat] }`

**Responses**: `200: SafetyLocationShare`, `401`, `403`, `404`, `410` (expired)

---

### DELETE /v1/safety/location-shares/:shareId

Stop sharing location.

**Responses**: `204`, `401`, `403`, `404`

---

### GET /v1/safety/location-shares/:shareId

Get a specific location share (viewers can see sharer's location here).

**Responses**: `200: SafetyLocationShare`, `401`, `403`, `404`, `410`

---

### GET /v1/safety/location-shares

List all active shares (where current user is sharer or viewer).

---

### POST /v1/safety/emergency-alerts

Send an emergency alert to all trusted contacts.

**Request body**

```json
{
  "type": "sos",
  "location": [44.3661, 33.3152],
  "message": "أحتاج مساعدة فورية",
  "startLocationShare": true
}
```

**Alert types**: `sos`, `medical`, `fire`, `security`, `accident`, `other`

**Response**: `EmergencyAlert` with `notifiedContactIds` and `shareId` if location share started

---

### GET /v1/safety/emergency-alerts

History of sent emergency alerts (paginated).

---

### GET /v1/safety/emergency-numbers

Static list of Iraqi emergency service numbers. No authentication required.

**Response**

```json
[
  { "service": "police", "number": "104", "description": "الشرطة" },
  { "service": "fire", "number": "115", "description": "الإطفاء والدفاع المدني" },
  { "service": "ambulance", "number": "122", "description": "الإسعاف" },
  { "service": "civil_defense", "number": "115", "description": "الدفاع المدني" },
  { "service": "electricity", "number": "108", "description": "طوارئ الكهرباء" },
  { "service": "water", "number": "118", "description": "طوارئ الماء" }
]
```

---

## 23. Notifications

### POST /v1/devices

Register a push notification device.

**Authentication**: Required

**Request body**

```json
{ "token": "ExponentPushToken[...]", "platform": "android" }
```

**Responses**: `201: { deviceId }` or `200: { deviceId }` (already registered)

---

### GET /v1/notification-prefs

Get the user's notification preferences.

**Response**

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

---

### PUT /v1/notification-prefs

Update notification preferences (partial update — send only changed fields).

---

### GET /v1/notifications

List notifications with cursor pagination.

**Query params**

| Param | Notes |
|-------|-------|
| `unreadOnly` | Boolean |
| `cursor` | Pagination cursor |
| `limit` | 1–50; default 20 |

**Response**

```json
{
  "items": [
    {
      "id": "...",
      "title": "رد جديد على استفسارك",
      "body": "مطعم الشرق ردّ على رسالتك",
      "data": { "inquiryId": "..." },
      "readAt": null,
      "createdAt": "2026-10-16T13:00:00.000Z"
    }
  ],
  "unreadCount": 3,
  "nextCursor": null
}
```

---

### POST /v1/notifications/:id/read

Mark a notification as read.

**Body**: `{}`

**Responses**: `200: { ok: true }`, `404`

---

### DELETE /v1/notifications/:id

Dismiss (delete) a notification.

**Responses**: `200: { ok: true }`, `404`

---

### GET /v1/notifications/digest

Unread count grouped by notification type (for badge display).

**Response**: `{ total: number, byType: { [type: string]: number } }`

---

## 24. Payments

IQD-first wallet with payment intents. Currently in stub phase — no live payment processor.

### GET /v1/payments/wallet

Get the current user's wallet.

**Authentication**: Required

**Response**

```json
{
  "id": "...",
  "userId": "...",
  "balanceIqd": 250000,
  "heldIqd": 50000,
  "availableIqd": 200000,
  "isActive": true,
  "createdAt": "2026-09-01T00:00:00.000Z",
  "updatedAt": "2026-10-16T10:00:00.000Z"
}
```

All IQD amounts are **integer dinars** (no fractions). `availableIqd = balanceIqd - heldIqd`.

---

### GET /v1/payments/wallet/transactions

Paginated transaction history.

**Query params**: `type`, `status`, `from`, `to` (datetime), `cursor`, `limit`

---

### POST /v1/payments/wallet/top-up

Add funds to wallet (admin/transfer channel only in stub phase).

**Request body**

```json
{
  "amountIqd": 100000,
  "source": "bank_transfer",
  "reference": "TRF-2026-001"
}
```

**Source values**: `bank_transfer`, `cash_deposit`, `admin_credit`, `promotion`

---

### GET /v1/payments/methods

List saved payment methods.

---

### POST /v1/payments/methods/card

Add a card (stub — display info only, no tokenisation).

**Request body**

```json
{
  "last4": "4242",
  "brand": "visa",
  "expiryMonth": 12,
  "expiryYear": 2028,
  "holderName": "أحمد محمد",
  "setDefault": true
}
```

**Note**: Only the last 4 digits are stored. Never send the full card number.

---

### DELETE /v1/payments/methods/:methodId

Remove a payment method.

---

### PATCH /v1/payments/methods/:methodId/default

Set a payment method as default.

---

### POST /v1/payments/intents

Create a payment intent.

**Request body**

```json
{
  "amount": 50000,
  "currency": "IQD",
  "description": "حجز موعد في صالون الملوك",
  "metadata": { "appointmentId": "..." }
}
```

**Responses**: `201: PaymentIntent`, `400`, `401`, `422`

---

### GET /v1/payments/intents/:intentId

Get a payment intent by ID.

---

### POST /v1/payments/intents/:intentId/confirm

Confirm payment with a saved method.

**Request body**: `{ "paymentMethodId": "..." }`

---

### POST /v1/payments/intents/:intentId/cancel

Cancel a pending intent.

---

### POST /v1/payments/intents/:intentId/refund

Refund (full or partial).

**Request body**: `{ "amount": 25000, "reason": "إلغاء الخدمة" }` (omit `amount` for full refund)

---

### GET /v1/payments/intents

List current user's payment intents (paginated).

**Query params**: `status`, `cursor`, `limit`

---

## 25. Admin — Providers

Require role `admin` or `moderator`.

### GET /v1/admin/providers

Queue of providers by status.

**Query params**: `status` (default `pending`), `cursor`

**Response**: `paginated(AdminProviderView)`

---

### POST /v1/admin/providers/:id/verify

Verify a provider (moves to `verified` status).

**Body**: empty

**Responses**: `200: AdminProviderView`, `401`, `403`, `404`, `409`

---

### POST /v1/admin/providers/:id/suspend

Suspend a provider.

**Request body**: `{ "reason": "انتهاك شروط الاستخدام" }`

---

### POST /v1/admin/providers/:id/reject

Reject a pending provider.

**Request body**: `{ "reason": "المعلومات المقدمة غير كافية" }`

---

### GET /v1/admin/providers/audit-log

Audit log of all provider status changes.

**Response**: Array of `{ id, action, providerNameAr, adminUser, timestamp }`

---

## 26. Admin — Discover

Moderate reported posts.

### GET /v1/admin/discover/reported

List reported posts.

**Authentication**: Required (`admin` or `moderator`)

**Response**: `ReportedPostView[]` including `reportCount` and `reasons`

---

### POST /v1/admin/discover/posts/:postId/approve

Clear all reports from a post (keep it in the feed).

**Body**: `{}`

**Responses**: `204`, `401`, `403`, `404`

---

### POST /v1/admin/discover/posts/:postId/remove

Soft-delete a post.

**Body**: `{}`

**Responses**: `204`, `401`, `403`, `404`

---

## 27. Error Reference

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (async operation started) |
| 204 | No Content |
| 400 | Bad Request — validation error |
| 401 | Unauthenticated — missing or invalid JWT |
| 403 | Forbidden — authenticated but not authorized |
| 404 | Not Found |
| 409 | Conflict — resource already exists or state conflict |
| 410 | Gone — resource expired |
| 422 | Unprocessable — semantic error |
| 429 | Too Many Requests |
| 503 | Service Unavailable — upstream dependency down |

### Common Error Codes (`code` field)

| Code | Meaning |
|------|---------|
| `unauthenticated` | No valid JWT |
| `forbidden` | Wrong role |
| `not_found` | Resource does not exist |
| `already_exists` | Conflict — e.g. duplicate provider |
| `rate_limit_exceeded` | Generic rate limit |
| `daily_limit_exceeded` | Per-day quota (assistant, inquiries) |
| `already_checked_in` | Same place within 24h |
| `place_not_found` | Place ID doesn't exist |
| `no_route` | Valhalla cannot find a route |
| `routing_unavailable` | Valhalla engine down |
| `phone_not_verified` | Provider phone OTP not confirmed |
| `invalid_query` | Search query rejected |

---

*Last updated: 2026-10-16 · Generated from `packages/contracts/src/`*
