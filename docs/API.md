# API Reference

Base URL: `http://localhost:3000` (local dev) or the deployed `API_BASE_URL`.

All routes are prefixed `/v1`. Requests and responses use JSON (`Content-Type: application/json`).

---

## Authentication

Most endpoints require a Bearer JWT in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained via the auth flow below. They expire after 15 minutes; use the refresh token to get a new pair.

---

## Auth

### Request OTP

```
POST /v1/auth/otp/request
```

**Body**

```json
{ "phone": "+9647xxxxxxxxx" }
```

Phone must be in E.164 format (the mobile app normalizes Iraqi numbers automatically).

**Response 200**

```json
{ "resendAfterSec": 60 }
```

**Error codes**: `otp_rate_limited`, `otp_resend_too_soon`, `invalid_request`

---

### Verify OTP

```
POST /v1/auth/otp/verify
```

**Body**

```json
{ "phone": "+9647xxxxxxxxx", "code": "123456" }
```

**Response 200**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "isNewUser": true
}
```

**Error codes**: `otp_invalid`, `otp_expired`, `otp_too_many_attempts`, `otp_locked`

---

### Refresh token

```
POST /v1/auth/refresh
```

**Body**

```json
{ "refreshToken": "eyJ..." }
```

**Response 200** — same shape as verify.

---

## Me (current user)

### Get profile

```
GET /v1/me
```

**Response 200**

```json
{
  "id": "usr_01h...",
  "phone": "+9647xxxxxxxxx",
  "name": "أنس",
  "locale": "ar",
  "roles": ["user"],
  "createdAt": "2026-01-01T00:00:00Z"
}
```

---

### Update profile

```
PATCH /v1/me
```

**Body** (all fields optional)

```json
{ "name": "أنس الراجي", "locale": "ar" }
```

---

### Delete account

```
DELETE /v1/me
```

Requires explicit confirmation from the client (the app shows a confirmation sheet before calling this). Triggers data erasure asynchronously.

---

### Export data

```
GET /v1/me/export
```

Returns a signed S3 URL to a JSON archive of the user's data. The archive is generated asynchronously; the URL is valid for 24 hours.

---

## Places

### Search places

```
GET /v1/places/search?q=<query>&lat=<lat>&lon=<lon>&radius=<meters>&limit=<n>
```

Arabic and Kurdish queries go through the shared normalizer. `pg_trgm` full-text search on name and address fields.

**Response 200**

```json
{
  "results": [
    {
      "id": "plc_01h...",
      "osmId": 12345678,
      "name": "مطعم أبو علي",
      "category": "restaurant",
      "lat": 33.34,
      "lon": 44.39,
      "address": "شارع فلسطين، بغداد",
      "distance": 420,
      "isOpen": true,
      "photos": ["https://..."]
    }
  ]
}
```

---

### Get place by ID

```
GET /v1/places/:id
```

Returns the full place card including hours, phone, website, and crowdsourced prices.

---

### Report incorrect price

```
POST /v1/places/:id/price-report
```

**Body**

```json
{
  "item": "شاي",
  "amount": 2500,
  "currency": "IQD",
  "observedAt": "2026-10-15T10:00:00Z"
}
```

Stored with `source: "user_report"` and `confidence: "low"` until corroborated.

---

### Submit place photo

```
POST /v1/places/:id/photos
```

**Body**

```json
{ "assetId": "ast_01h..." }
```

The asset must be uploaded first via `POST /v1/media/upload`. Photos enter a moderation queue.

---

## Routing

### Get route

```
POST /v1/routes
```

**Body**

```json
{
  "origin": { "lat": 33.34, "lon": 44.39 },
  "destination": { "lat": 33.31, "lon": 44.41 },
  "mode": "auto"
}
```

`mode`: `auto` (car), `pedestrian`, `bicycle`.

**Response 200**

```json
{
  "durationSec": 420,
  "distanceMeters": 3200,
  "maneuvers": [
    {
      "type": "turn_right",
      "streetName": "شارع الرشيد",
      "distanceMeters": 800,
      "instruction": "انعطف يميناً نحو شارع الرشيد"
    }
  ],
  "geometry": { "type": "LineString", "coordinates": [[44.39, 33.34], ...] }
}
```

---

### Save favorite route

```
POST /v1/routes/favorites
```

**Body**

```json
{
  "label": "البيت → العمل",
  "origin": { "lat": 33.34, "lon": 44.39, "label": "البيت" },
  "destination": { "lat": 33.31, "lon": 44.41, "label": "العمل" }
}
```

---

```
GET /v1/routes/favorites
DELETE /v1/routes/favorites/:id
```

---

## Assistant

### Send message

```
POST /v1/assistant/chat
```

**Body**

```json
{
  "sessionId": "ses_01h...",
  "message": "ما أفضل مطعم للمسقوف في الكرخ؟",
  "locale": "ar"
}
```

**Response 200** — Server-Sent Events stream (`text/event-stream`):

```
data: {"type":"delta","text":"يُعدّ "}
data: {"type":"delta","text":"مطعم أبو نواس..."}
data: {"type":"place_card","place":{"id":"plc_01h...","name":"مطعم أبو نواس",...}}
data: {"type":"done","usage":{"inputTokens":120,"outputTokens":88}}
```

Daily budget is enforced server-side. When the budget is exhausted the stream closes with:

```
data: {"type":"error","code":"daily_limit_reached","resetAt":"2026-10-16T00:00:00Z"}
```

---

## Discover

### List feed

```
GET /v1/discover?cursor=<cursor>&filter=<following|trending|latest>
```

**Response 200**

```json
{
  "posts": [{ "id": "pst_01h...", "author": {...}, "body": "...", "mediaUrls": [...], "likesCount": 5, ... }],
  "nextCursor": "eyJ..."
}
```

---

### Create post

```
POST /v1/discover/posts
```

**Body**

```json
{
  "body": "زرت مطعم أبو علي اليوم... #بغداد",
  "mediaAssetIds": ["ast_01h..."],
  "categorySlug": "food",
  "poll": { "options": ["جيد", "ممتاز"], "durationHours": 24 }
}
```

---

### Get post

```
GET /v1/discover/posts/:id
```

---

### Edit post

```
PATCH /v1/discover/posts/:id
```

---

### Delete post

```
DELETE /v1/discover/posts/:id
```

---

### Like / unlike post

```
POST   /v1/discover/posts/:id/like
DELETE /v1/discover/posts/:id/like
```

---

### Report post

```
POST /v1/discover/posts/:id/report
```

**Body**

```json
{ "reason": "spam" }
```

---

### List comments

```
GET /v1/discover/posts/:id/comments?cursor=<cursor>
```

---

### Create comment

```
POST /v1/discover/posts/:id/comments
```

**Body**

```json
{ "body": "رأيي الشخصي..." }
```

---

### Delete comment

```
DELETE /v1/discover/posts/:id/comments/:commentId
```

---

### Vote in poll

```
POST /v1/discover/posts/:id/poll/vote
```

**Body**

```json
{ "optionIndex": 0 }
```

---

### Hashtag feed

```
GET /v1/discover/hashtags/:tag?cursor=<cursor>
```

---

### Trending hashtags

```
GET /v1/discover/hashtags/trending
```

---

### Saved posts

```
GET    /v1/discover/saved
POST   /v1/discover/posts/:id/save
DELETE /v1/discover/posts/:id/save
```

---

### Follow / unfollow

```
POST   /v1/users/:id/follow
DELETE /v1/users/:id/follow
GET    /v1/users/:id/followers
GET    /v1/users/:id/following
```

---

## Messages

### List conversations

```
GET /v1/messages?cursor=<cursor>
```

---

### Get conversation

```
GET /v1/messages/:id?cursor=<cursor>
```

---

### Send message

```
POST /v1/messages/:id/send
```

**Body**

```json
{ "text": "مرحباً، هل لديكم طاولة لشخصين؟", "assetId": null }
```

---

### React to message

```
POST /v1/messages/:id/messages/:messageId/react
```

**Body**

```json
{ "emoji": "👍" }
```

---

### Archive conversation

```
PATCH /v1/messages/:id/archive
```

---

## Providers

### Register provider

```
POST /v1/providers
```

**Body**

```json
{
  "businessName": "مطعم أبو علي",
  "category": "restaurant",
  "location": { "lat": 33.34, "lon": 44.39 },
  "phone": "+9647xxxxxxxxx",
  "hours": { "monday": { "open": "09:00", "close": "22:00" }, ... },
  "photoAssetIds": ["ast_01h..."]
}
```

---

### Get own dashboard

```
GET /v1/providers/me
```

---

### List received inquiries

```
GET /v1/providers/me/inquiries?status=<pending|replied|closed>&cursor=<cursor>
```

---

### Reply to inquiry

```
POST /v1/providers/me/inquiries/:id/reply
```

**Body**

```json
{ "text": "نعم، تفضل!" }
```

---

### Update inquiry status

```
PATCH /v1/providers/me/inquiries/:id
```

**Body**

```json
{ "status": "closed" }
```

---

### List reviews

```
GET /v1/providers/me/reviews?cursor=<cursor>
```

---

### Post review response

```
POST /v1/providers/me/reviews/:reviewId/response
```

**Body**

```json
{ "text": "شكراً لزيارتك!" }
```

---

## Notifications

### List notifications

```
GET /v1/notifications?cursor=<cursor>&unreadOnly=<bool>
```

---

### Mark read

```
PATCH /v1/notifications/:id/read
POST  /v1/notifications/read-all
```

---

## Media

### Request upload ticket

```
POST /v1/media/upload
```

**Body**

```json
{ "mimeType": "image/jpeg", "sizeBytes": 204800 }
```

**Response 200**

```json
{
  "assetId": "ast_01h...",
  "uploadUrl": "https://s3.../presigned...",
  "headers": { "Content-Type": "image/jpeg" }
}
```

The client PUTs the file directly to `uploadUrl`, then passes `assetId` to the relevant endpoint.

---

## Insights

### Get place insights

```
GET /v1/insights/:placeId
```

**Response 200**

```json
{
  "prices": [
    {
      "item": "شاي",
      "amount": 2500,
      "currency": "IQD",
      "source": "user_report",
      "observedAt": "2026-10-15T10:00:00Z",
      "confidence": "low"
    }
  ],
  "crowding": {
    "level": "medium",
    "source": "aggregate",
    "observedAt": "2026-10-15T12:00:00Z",
    "confidence": "medium"
  }
}
```

---

## Error format

All errors follow RFC 7807 (Problem Details):

```json
{
  "statusCode": 422,
  "error": "Unprocessable Entity",
  "message": "otp_invalid",
  "details": {}
}
```

Common `message` codes: `otp_invalid`, `otp_expired`, `otp_locked`, `otp_rate_limited`, `daily_limit_reached`, `not_found`, `forbidden`, `unauthorized`, `invalid_request`.

---

## Health check

```
GET /healthz
```

**Response 200**

```json
{ "status": "ok", "db": "ok", "redis": "ok" }
```
