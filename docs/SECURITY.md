# Iraq Smart Maps — Security Documentation

> Version: 1.0 · Last updated: 2026-10-16
> This document covers the security architecture, controls, and procedures.
> All findings from the M4 security audit are incorporated here.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Authorization](#2-authorization)
3. [Input Validation](#3-input-validation)
4. [Rate Limiting](#4-rate-limiting)
5. [File Upload Security](#5-file-upload-security)
6. [Secret Management](#6-secret-management)
7. [Data Protection](#7-data-protection)
8. [GDPR and Privacy](#8-gdpr-and-privacy)
9. [Data Retention Policy](#9-data-retention-policy)
10. [Incident Response](#10-incident-response)

---

## 1. Authentication

### OTP-based login (no passwords)

The system uses SMS one-time passwords as the sole authentication mechanism. There are no
passwords to steal, no password reset flows to hijack, and no credential stuffing attacks
possible. Each OTP is:

- 6 digits, cryptographically random (`crypto.randomInt`)
- Valid for 10 minutes
- Single-use (deleted from Redis on successful verify)
- Stored as `bcrypt(otp)` in Redis, never in plaintext
- Sent to the verified phone number only

OTP brute-force protection:
- 5 failed attempts per phone per 10 minutes → 429 Too Many Requests
- New OTP cannot be requested until `resendAfterSec` (60s) has elapsed
- Rate limit key: `rl:otp:<phone_hash>` in Redis, sliding window

### JWT tokens

```
Access token:
  Algorithm:  HS256
  Secret:     JWT_ACCESS_SECRET (≥32 bytes, never `example-secret`)
  Lifetime:   15 minutes
  Claims:     { sub: userId, roles: string[], iat, exp, jti }

Refresh token:
  Algorithm:  HS256
  Secret:     JWT_REFRESH_SECRET (different from access secret)
  Lifetime:   30 days
  Claims:     { sub: userId, jti: uuid, iat, exp }
  Storage:    jti allowlist in Redis (TTL = 30 days)
```

### Token rotation

Every refresh issues a new token pair. The old `jti` is deleted from Redis before the new one
is stored — this prevents replay attacks: if an attacker captures a refresh token, they get one
use before the legitimate client invalidates it.

### Token revocation

Logout revokes the refresh token immediately by deleting its `jti` from Redis. Access tokens
remain valid until expiry (15 min max). For immediate access revocation (e.g. account
suspension), the session key `session:<userId>` in Redis is deleted; the next request will
re-evaluate roles.

### HTTPS requirement

All API traffic must be over TLS. The NestJS server does not handle TLS directly — it expects
a reverse proxy (Nginx / Caddy) to terminate TLS and pass `X-Forwarded-*` headers. `TRUST_PROXY`
must be set correctly:

```
# Correct (hop count = 1 proxy in front):
TRUST_PROXY=1

# Correct (specific proxy IP):
TRUST_PROXY=10.0.0.1

# NEVER in production (allows X-Forwarded-For spoofing):
TRUST_PROXY=true
```

---

## 2. Authorization

### Role model

| Role       | Assigned                        | Capabilities                              |
|------------|---------------------------------|-------------------------------------------|
| `user`     | All authenticated users         | Search, message, post, use assistant      |
| `provider` | Users after provider approval   | Respond to inquiries, manage profile      |
| `admin`    | Manually granted by team        | Admin panel access, moderation actions    |

### Enforcement

```typescript
// Controller-level enforcement via NestJS guard:
@Roles('provider')
@Post('/provider/inbox/:id/reply')
async reply(@Param('id') id: string, @Body() body: ReplyDto, @User() user: RequestUser) {
  // Guard checked roles; service double-checks ownership:
  return this.messagingService.providerReply(user.userId, id, body);
}

// Service-level ownership check (defence in depth):
const inquiry = await db.query.inquiries.findFirst({
  where: and(eq(inquiries.id, inquiryId), eq(inquiries.providerId, user.providerId)),
});
if (!inquiry) throw new ForbiddenException();
```

### Admin endpoints

Admin routes under `/v1/admin/*` require:
```
X-Admin-Key: <ADMIN_KEY>
```
If `ADMIN_KEY` is not set in env, all admin endpoints return 404. This prevents accidental
exposure of admin functionality in environments where it wasn't intended.

### Consent-gated data

Per CLAUDE.md rule 6: a provider's phone number, photos, and social links are only returned in
API responses when the corresponding consent scope is active for that provider. The
`providers.providers` row has a `consent_scopes` JSONB field; the serializer checks it before
including each field.

---

## 3. Input Validation

### Zod everywhere

Every API endpoint body, query param, and path param is validated by a Zod schema before
the handler is called. Schemas are defined in `packages/contracts` and shared between client
and server.

```typescript
// Example: send inquiry
export const SendInquiryBody = z.object({
  providerId: z.string().uuid(),
  placeIds: z.array(z.string().uuid()).min(1).max(5),
  body: z.string().trim().min(1).max(2000),
});
```

Validation errors return HTTP 400 with a structured `Problem` body:
```json
{
  "type": "https://iraqsmartmaps.app/errors/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "body: body must be at most 2000 characters"
}
```

### Phone number validation

Iraqi phone numbers are validated against the pattern `+9647[3-9]\d{8}` before any processing.
This prevents injection via phone field.

### SQL injection

Drizzle ORM uses parameterized queries exclusively. No raw string interpolation in SQL.
PostGIS spatial queries use `ST_Point(?, ?)` with bound parameters.

### XSS prevention

- API responses are JSON, not HTML; no XSS surface on the API.
- Admin panel is a React SPA; all text is set via `textContent` (React default), never `innerHTML`.
- Post body is stored as plain text; rendered in the mobile app via React Native `<Text>`,
  which never executes scripts.

---

## 4. Rate Limiting

### Per-user, per-endpoint limits

Implemented via Redis sliding window. The `RateLimitGuard` in NestJS reads limits from
configuration and applies them before the controller executes.

| Endpoint                        | Limit              | Window    |
|---------------------------------|--------------------|-----------|
| `POST /v1/auth/otp/request`     | 3 requests         | 10 min    |
| `POST /v1/auth/otp/verify`      | 5 requests         | 10 min    |
| `POST /v1/auth/refresh`         | 10 requests        | 1 min     |
| `POST /v1/assistant/chat`       | 10 requests        | 1 min     |
| `POST /v1/messages/inquiries`   | 3 requests         | 1 min     |
| `POST /v1/discover/posts`       | 5 requests         | 5 min     |
| `POST /v1/media/upload`         | 10 requests        | 5 min     |
| All other authenticated routes  | 120 requests       | 1 min     |
| Public search endpoints         | 60 requests (IP)   | 1 min     |

### Response headers

Rate limit responses include:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1729094400   (Unix timestamp)
Retry-After: 58
```

### DoS mitigation

- IP-level rate limiting on public endpoints (reverse proxy, nginx `limit_req`)
- Request size limit: 10 MB JSON body (Fastify default), 10 MB file upload (configurable)
- Maximum query string length enforced by Fastify

---

## 5. File Upload Security

### Validation pipeline

Every file upload goes through a strict pipeline before storage:

```
1. MIME type check
   ├─ Allowed: image/jpeg, image/png, image/webp, image/heic
   ├─ Check both Content-Type header AND magic bytes (file signature)
   └─ Reject if mismatch (e.g. renamed .exe to .jpg)

2. Size limit
   └─ Reject if > MEDIA_MAX_BYTES (default: 10 MB)

3. Dimension check (sharp)
   └─ Reject if width or height > 8192 px (prevents decompression bombs)

4. EXIF GPS strip (sharp)
   └─ Strip ALL EXIF metadata from JPEG/HEIC before storage
   └─ Preserves image content, removes location data

5. Thumbnail generation
   └─ 400x400 JPEG thumbnail for API responses
   └─ Original stored separately for full-resolution view

6. Storage with random key
   └─ Key: media/<uuid>/<uuid2>.jpg (not original filename)
   └─ Original filename never stored or exposed
```

### Serving uploads

Uploaded files are served via S3 pre-signed URLs with a TTL (default: 1 hour). The mobile app
never has direct write access to the S3 bucket — all uploads go through the API.

### Content moderation

Post photos are not pre-screened by automated tools in the MVP. Users can report posts;
admins review via the admin panel. Future: integrate a content moderation API.

---

## 6. Secret Management

### Hard rule: no secrets in the repo

The repository is public. Any secret committed is permanently compromised, even after deletion
(Git history preserves it; public forks may have copied it).

### Secret categories and storage

| Secret type            | Storage                  | Access                              |
|------------------------|--------------------------|-------------------------------------|
| JWT secrets            | `.env` (local), CI env   | API server process only             |
| Phone encryption key   | `.env` (local), CI env   | API server process only             |
| API keys (Anthropic, SMS) | `.env` (local), CI secrets | API server process only         |
| FCM service account    | JSON file outside repo   | `FCM_SERVICE_ACCOUNT_JSON_PATH`     |
| Android keystore       | GitHub Secrets (base64)  | Build workflow only                 |
| S3 credentials         | `.env` (local), CI env   | API server + build pipeline         |

### gitleaks scan

`pnpm gitleaks` runs the `gitleaks` scanner on every commit. It uses the `.gitleaks.toml`
configuration at the repo root. The CI gate fails if any secret pattern is detected.

To scan manually:
```bash
gitleaks detect --source . --config .gitleaks.toml
```

### Secret rotation procedure

If a secret is accidentally committed:

1. **Immediately rotate the key/credential** — deletion from history is not enough.
2. Revoke the old credential at the provider (Anthropic dashboard, Firebase, etc.).
3. Generate a new credential and update all environments.
4. File an incident report (see §10).
5. Check access logs for the period between commit and rotation.
6. Force-push to remove from history (only if repo is not yet widely forked).

### `.env` example file discipline

`.env.example` contains only variable **names** and comments, never values:
```bash
JWT_ACCESS_SECRET=        # ≥32 char random string, e.g.: openssl rand -hex 32
ANTHROPIC_API_KEY=        # sk-ant-...
```

---

## 7. Data Protection

### Phone number encryption

Phone numbers are sensitive personal data. They are stored encrypted at rest:

```
Storage:   AES-256-GCM with PHONE_ENCRYPTION_KEY (32 bytes)
Lookup:    HMAC-SHA256 hash with PHONE_HASH_KEY (separate key)
           → users.phone_hash (indexed for O(1) lookup)
           → users.phone_encrypted (only decrypted when needed to send OTP)
```

Phone numbers are never:
- Logged (Pino redact config masks phone fields)
- Included in events payloads
- Passed to the AI assistant

### Personal data minimisation

The app collects the minimum necessary data:
- Phone number (authentication, OTP only)
- Display name (optional)
- Location (only when user explicitly uses navigation or search; not persisted)
- Device push token (notifications; stored encrypted)

### Audit logging

Security-relevant actions are logged with user ID, IP, and timestamp:
- OTP requests and verifications
- Role grants
- Provider approvals/rejections
- Admin actions (post removal, provider suspension)
- Account deletions

Logs do not include phone numbers, message content, or location coordinates.

---

## 8. GDPR and Privacy

Although Iraq does not have GDPR-equivalent law, the app follows GDPR principles as a standard
of care and for future EU expansion.

### User rights implementation

| Right                  | Implementation                                     |
|------------------------|----------------------------------------------------|
| Right to access        | `GET /v1/me` returns all profile data              |
| Right to erasure       | `DELETE /v1/me` soft-deletes, anonymises content   |
| Right to portability   | Future: `/v1/me/export` endpoint                   |
| Right to rectification | `PATCH /v1/me` allows name/locale update           |

### Account deletion cascade

When `DELETE /v1/me` is called:
1. `users.deleted_at` is set (soft delete)
2. All refresh tokens revoked (Redis + DB)
3. `identity.user.deleted.v1` event published
4. Event handlers:
   - `messaging`: inquiries anonymised (user_id → null, name → "مستخدم محذوف")
   - `discover`: posts/comments soft-deleted (`status = 'removed'`)
   - `activity`: items where actor = deleted user soft-deleted
   - `notifications`: device tokens deleted
5. Physical deletion of `users` row scheduled after 30-day grace period (background job)

### Privacy policy

The privacy policy is available at `site/` and linked from the app. It is written in Arabic
(primary), with Kurdish and English translations. Updated when data practices change.

### Data processing agreements

Third-party processors used:
- Anthropic (Claude API): message content processed for AI responses. No retention per API agreement.
- Firebase FCM: push notification tokens. Stored by Google.
- WhatsApp Cloud API: business message delivery. Meta processes message content.
- SMS gateway: phone number used for OTP delivery only.

---

## 9. Data Retention Policy

| Data type              | Retention                                   | Deletion trigger              |
|------------------------|---------------------------------------------|-------------------------------|
| User accounts          | Until deletion request + 30-day grace       | User deletes account          |
| Phone numbers          | Until account deleted                       | Account deletion              |
| JWT refresh tokens     | 30 days (Redis TTL)                         | Logout or rotation            |
| OTP codes              | 10 minutes (Redis TTL)                      | Auto-expiry or use            |
| Inquiry messages       | Indefinite (anonymised after user deletion) | User deletion (anonymise)     |
| Discover posts         | Indefinite unless removed                   | User request or admin action  |
| Media assets           | Indefinite unless post/place deleted        | Cascade from parent           |
| Activity items         | 90 days                                     | Age-based cleanup job         |
| Push tokens            | Until device re-registers or user deleted   | Token rotation                |
| Server logs            | 30 days                                     | Log rotation                  |
| Audit logs             | 1 year                                      | Yearly purge job              |
| Price/crowding reports | 6 months                                    | Age-based cleanup job         |

---

## 10. Incident Response

### Severity levels

| Level    | Definition                                         | Response time |
|----------|----------------------------------------------------|---------------|
| Critical | Data breach, secret exposure, production outage    | < 1 hour      |
| High     | Auth bypass, XSS in admin panel, data leak risk    | < 4 hours     |
| Medium   | Rate limit bypass, DoS vector, logic flaw          | < 24 hours    |
| Low      | Information disclosure, minor logic issue          | < 1 week      |

### Response procedure

**Step 1: Contain**
- For secret exposure: rotate the credential immediately (see §6)
- For auth bypass: disable affected endpoint (`ADMIN_KEY` set to empty, or deploy a hotfix)
- For data breach: revoke all user sessions (flush Redis refresh token allowlist)

**Step 2: Assess**
- Determine scope: which users affected, what data accessed, time window
- Check access logs (audit log table + server logs)
- Preserve logs before rotation

**Step 3: Notify**
- Internal: notify all team members immediately
- Users: if personal data was accessed, notify affected users within 72 hours
- Regulatory: if EU users are affected, notify supervisory authority within 72 hours (GDPR Art. 33)

**Step 4: Remediate**
- Deploy fix to production
- Verify fix with security test
- Re-run `pnpm gitleaks` and full gate

**Step 5: Post-mortem**
- Write a post-mortem in `docs/incidents/YYYY-MM-DD-title.md`
- Include: timeline, root cause, impact, remediation, prevention

### Responsible disclosure

Security vulnerabilities can be reported to the maintainer via the email address in
`package.json`. We aim to acknowledge reports within 48 hours and provide a fix timeline
within 7 days for critical issues.

---

*End of security documentation. For the deployment hardening checklist see `docs/DEPLOYMENT.md §8`.*
