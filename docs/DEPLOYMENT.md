# Deployment Guide

This document covers environment variables, Docker Compose production setup, database migrations, mobile
builds, admin panel deployment, and monitoring.

---

## Table of Contents

1. [Environment Variables Reference](#1-environment-variables-reference)
2. [Local Development Setup](#2-local-development-setup)
3. [Production Docker Compose](#3-production-docker-compose)
4. [Database Migrations](#4-database-migrations)
5. [Mobile Build — Expo EAS](#5-mobile-build--expo-eas)
6. [Admin Panel Deploy](#6-admin-panel-deploy)
7. [Health Check Endpoints](#7-health-check-endpoints)
8. [Monitoring Setup](#8-monitoring-setup)
9. [Secrets Management](#9-secrets-management)
10. [Rollback Procedure](#10-rollback-procedure)

---

## 1. Environment Variables Reference

Copy `.env.example` to `.env` and fill in values locally. Never commit `.env`. The table below describes
every variable.

### Core

| Variable         | Required | Description                                                    |
|------------------|----------|----------------------------------------------------------------|
| `APP_ENV`        | Yes      | `development` \| `test` \| `e2e` \| `production`             |
| `API_PORT`       | No       | Port the NestJS server listens on. Default: `3000`            |
| `LOG_LEVEL`      | No       | `debug` \| `info` \| `warn` \| `error`. Default: `info`      |
| `DATABASE_URL`   | Yes      | PostgreSQL connection URL for the app role (DML only)         |
| `REDIS_URL`      | Yes      | Redis connection URL for BullMQ queues and session cache      |
| `TRUST_PROXY`    | No       | Hop count or CIDR list when behind a reverse proxy. `true` is refused in production |
| `ADMIN_KEY`      | No       | Secret key for `X-Admin-Key` header on `/v1/admin/*` routes. Leave empty to disable admin endpoints |
| `REQUEST_SIGNING_SECRET` | No | ≥32-char HMAC secret for mobile→API request signing (`X-Request-Signature`). Leave empty to disable |

### Identity

| Variable                | Required | Description                                                          |
|-------------------------|----------|----------------------------------------------------------------------|
| `JWT_ACCESS_SECRET`     | Yes      | Secret for access token signing (HS256). ≥32 chars                  |
| `JWT_REFRESH_SECRET`    | Yes      | Secret for refresh token signing. Must differ from access secret     |
| `PHONE_ENCRYPTION_KEY`  | Yes      | base64-encoded 32-byte AES-GCM key. Generate: `openssl rand -base64 32` |
| `PHONE_HASH_KEY`        | Yes      | HMAC key for phone lookup hash                                       |
| `OTP_SENDER`            | Yes      | `sms` \| `console` (dev) \| `fixed` (e2e) \| `fake` (tests)        |
| `OTP_FIXED_CODE`        | e2e only | Fixed OTP code when `OTP_SENDER=fixed`. Example: `999999`           |
| `SMS_PROVIDER_API_KEY`  | prod     | API key for the SMS gateway when `OTP_SENDER=sms`                   |

### Messaging

| Variable                           | Required | Description                                                 |
|------------------------------------|----------|-------------------------------------------------------------|
| `MESSAGING_DAILY_LIMIT_PER_USER`   | No       | Max inquiries per user per day. Default: `10`               |
| `WHATSAPP_ACCESS_TOKEN`            | No       | WhatsApp Cloud API token. Fake used when absent             |
| `WHATSAPP_PHONE_NUMBER_ID`         | prod     | Sender phone number ID in the WhatsApp Cloud API            |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`    | prod     | Token for WhatsApp webhook verification handshake           |
| `WHATSAPP_APP_SECRET`              | prod     | Used to validate inbound webhook HMAC signatures            |
| `WHATSAPP_TEMPLATE_NAME`           | prod     | Name of the approved message template                       |

### Assistant

| Variable                         | Required | Description                                                   |
|----------------------------------|----------|---------------------------------------------------------------|
| `ANTHROPIC_API_KEY`              | prod     | Anthropic API key. Never put this in mobile code             |
| `ASSISTANT_MODEL`                | Yes      | Claude model name, e.g. `claude-3-5-haiku-20241022`          |
| `ASSISTANT_DAILY_LIMIT_PER_USER` | No       | Max assistant requests per user per day                      |

### Media / Storage

| Variable               | Required | Description                                                          |
|------------------------|----------|----------------------------------------------------------------------|
| `STORAGE_TYPE`         | No       | `file` (dev/test) \| `s3` (production)                              |
| `MEDIA_SIGNING_SECRET` | dev/test | HMAC secret for `FileObjectStorage` signed URLs                      |
| `MEDIA_MAX_BYTES`      | No       | Max upload size in bytes. Default: `10485760` (10 MiB)              |
| `S3_ENDPOINT`          | prod     | S3-compatible endpoint URL (e.g. `https://<account>.r2.cloudflarestorage.com`) |
| `S3_BUCKET`            | prod     | Bucket name                                                          |
| `S3_ACCESS_KEY_ID`     | prod     | S3 access key ID                                                     |
| `S3_SECRET_ACCESS_KEY` | prod     | S3 secret access key                                                 |
| `S3_REGION`            | No       | Region. Default: `auto` (Cloudflare R2)                             |

### Geo Services

| Variable        | Required | Description                                                                   |
|-----------------|----------|-------------------------------------------------------------------------------|
| `VALHALLA_URL`  | Yes      | URL of the Valhalla routing engine. Example: `http://valhalla:8002`           |
| `PHOTON_URL`    | Yes      | URL of the Photon geocoder. Example: `http://photon:2322`                     |
| `TILES_SOURCE`  | Yes      | PMTiles source. Absolute path to a local `.pmtiles` file, or a CDN `https://` URL. `{city}` is replaced with the city ID |
| `GLYPHS_SOURCE` | Yes      | Glyph (font) server. Local directory path, or `https://` URL. Served at `{fontstack}/{range}.pbf` |

### Notifications

| Variable                    | Required | Description                                                    |
|-----------------------------|----------|----------------------------------------------------------------|
| `PUSH_PROVIDER`             | No       | `fake` (default) \| `fcm`                                     |
| `FCM_SERVICE_ACCOUNT_JSON_PATH` | prod | Path to the Firebase service account JSON file. Must be outside the repo |

### Mobile (Public — shipped in APK)

These variables are compiled into the app bundle. They are public by definition. Never put secrets here.

| Variable                | Required | Description                                       |
|-------------------------|----------|---------------------------------------------------|
| `EXPO_PUBLIC_APP_ENV`   | Yes      | `development` \| `e2e` \| `production`           |
| `EXPO_PUBLIC_API_URL`   | Yes      | Backend URL the mobile app connects to            |
| `EXPO_PUBLIC_TILES_URL` | No       | Fallback tiles CDN URL if not provided by the API |

### Database Migrations (per-schema)

Used by `drizzle-kit migrate` for each module. Leave empty to reuse `DATABASE_URL` in local dev.

| Variable                     | Schema      |
|------------------------------|-------------|
| `DB_MIGRATE_URL_IDENTITY`    | identity    |
| `DB_MIGRATE_URL_PROVIDERS`   | providers   |
| `DB_MIGRATE_URL_PLACES`      | places      |
| `DB_MIGRATE_URL_MEDIA`       | media       |
| `DB_MIGRATE_URL_MESSAGING`   | messaging   |
| `DB_MIGRATE_URL_ASSISTANT`   | assistant   |
| `DB_MIGRATE_URL_DISCOVER`    | discover    |
| `DB_MIGRATE_URL_ACTIVITY`    | activity    |
| `DB_MIGRATE_URL_NOTIFICATIONS` | notifications |

### Test-only

| Variable                   | Description                                                         |
|----------------------------|---------------------------------------------------------------------|
| `TEST_DATABASE_ADMIN_URL`  | Admin connection (DDL permissions) for creating test schemas. Falls back to `DATABASE_URL` |

### Admin Panel

| Variable       | Description                                              |
|----------------|----------------------------------------------------------|
| `VITE_API_URL` | Backend URL for the admin panel Vite app                 |
| `VITE_ADMIN_KEY` | `x-admin-key` value for metrics endpoint              |

### Android Release Signing (GitHub Secrets only)

| Variable           | Description                                                  |
|--------------------|--------------------------------------------------------------|
| `KEYSTORE_BASE64`  | base64-encoded JKS/PKCS12 keystore: `base64 -w0 < key.jks`  |
| `KEYSTORE_ALIAS`   | Key alias inside the keystore                                |
| `KEYSTORE_PASSWORD`| Keystore password                                            |
| `KEY_PASSWORD`     | Key password (may equal `KEYSTORE_PASSWORD`)                 |

---

## 2. Local Development Setup

```bash
# 1. Clone and install
git clone git@github.com:your-org/iraq-maps.git
cd iraq-maps
pnpm install

# 2. Copy env
cp .env.example .env
# Fill in at minimum:
#   DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   PHONE_ENCRYPTION_KEY (generate: openssl rand -base64 32)
#   PHONE_HASH_KEY (generate: openssl rand -hex 32)
#   OTP_SENDER=console
#   ANTHROPIC_API_KEY (for assistant; can leave empty — falls back to fake)
#   ASSISTANT_MODEL=claude-3-5-haiku-20241022
#   TILES_SOURCE=/absolute/path/to/baghdad.pmtiles
#   GLYPHS_SOURCE=/absolute/path/to/glyphs-dir

# 3. Start infrastructure (PostGIS + Redis)
pnpm infra:local up

# 4. Run migrations
pnpm db:migrate

# 5. Start the API
pnpm dev:api

# 6. Start the mobile app (in another terminal)
pnpm dev:mobile

# 7. (optional) Start the admin panel
pnpm dev:admin
```

---

## 3. Production Docker Compose

The production compose file is `infra/docker-compose.prod.yml`. It orchestrates:

- `api` — the NestJS server
- `admin` — the admin panel (Vite static site served by Nginx)
- `postgres` — PostgreSQL 16 + PostGIS
- `redis` — Redis 7
- `valhalla` — Valhalla routing engine with Baghdad OSM data
- `photon` — Photon geocoder with Baghdad OSM data

```yaml
# infra/docker-compose.prod.yml (simplified)
services:
  api:
    image: ghcr.io/your-org/iraq-maps-api:${API_IMAGE_TAG}
    env_file: .env.prod
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  postgres:
    image: postgis/postgis:16-3.4
    volumes:
      - postgres-data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: iraqmaps
      POSTGRES_USER: iraqmaps_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iraqmaps_app"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --save 60 1 --loglevel warning

  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla:3.4.0
    volumes:
      - ./geo-services/valhalla-tiles/baghdad:/data/tiles:ro
    ports:
      - "127.0.0.1:8002:8002"

  photon:
    image: rtuinow/photon:latest
    volumes:
      - ./geo-services/photon-data:/photon/photon_data:ro
    ports:
      - "127.0.0.1:2322:2322"

volumes:
  postgres-data:
  redis-data:
```

### Building the API image

```bash
# From the repo root
docker build -f apps/api/Dockerfile -t ghcr.io/your-org/iraq-maps-api:$(git rev-parse --short HEAD) .
docker push ghcr.io/your-org/iraq-maps-api:<tag>
```

### Updating to a new version

```bash
# On the server
API_IMAGE_TAG=<new-tag> docker compose -f infra/docker-compose.prod.yml up -d api
```

---

## 4. Database Migrations

Each backend module owns its own Postgres schema and runs migrations independently.

### Running migrations (all modules)

```bash
pnpm db:migrate
```

This calls `drizzle-kit migrate` for each module in dependency order.

### Running migrations for one module

```bash
cd modules/places
pnpm drizzle-kit migrate
```

### Migration file naming

Migrations live in `modules/<x>/migrations/` and are numbered sequentially:

```
modules/places/migrations/
  0001_init.sql
  0002_add_provider_source.sql
  0003_search_index.sql
```

### Creating a new migration

```bash
cd modules/places
pnpm drizzle-kit generate
```

This creates the next numbered SQL file. Inspect and edit it before committing. Never use `drizzle-kit push`
in production.

### Migration safety rules

- Migrations must be **backwards-compatible** during the deploy window (blue-green or rolling restart).
- Adding a column: always add with a default or make it nullable first.
- Renaming a column: use a two-migration approach (add new, backfill, remove old) across separate deploys.
- Dropping a column: only after the code no longer references it.

---

## 5. Mobile Build — Expo EAS

The mobile app uses **Expo Application Services (EAS)** for builds and updates.

### Prerequisites

```bash
npm install -g eas-cli
eas login
```

### Build profiles (eas.json)

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_APP_ENV": "development" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "EXPO_PUBLIC_APP_ENV": "production" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "env": { "EXPO_PUBLIC_APP_ENV": "production" }
    }
  }
}
```

### Building a development APK

```bash
cd apps/mobile
eas build --profile development --platform android
```

### Building a release APK (preview)

```bash
cd apps/mobile
eas build --profile preview --platform android
```

### Building for Play Store submission

```bash
cd apps/mobile
eas build --profile production --platform android
```

### OTA updates (EAS Update)

Push a JS-only update without a full build:

```bash
cd apps/mobile
eas update --branch production --message "Fix search debounce"
```

### Local pre-check (no Android SDK required)

```bash
pnpm android:precheck
```

This runs `expo prebuild` and `expo export` to catch bundler errors without the full Android toolchain.

### Keystore management

The release keystore is stored as a GitHub Secret (`KEYSTORE_BASE64`). It is decoded at build time in
`build-apk.sh`. Never commit the keystore file to the repo.

---

## 6. Admin Panel Deploy

The admin panel (`apps/admin`) is a Vite React app. Build it and serve the `dist/` folder.

### Build

```bash
cd apps/admin
VITE_API_URL=https://api.iraqmaps.app VITE_ADMIN_KEY=$ADMIN_KEY pnpm build
```

### Serve with Nginx

```nginx
server {
    listen 443 ssl;
    server_name admin.iraqmaps.app;

    root /var/www/admin/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to avoid CORS issues in the admin panel
    location /api/ {
        proxy_pass http://localhost:3000/;
    }
}
```

### Access control

The admin panel itself is protected only by the `VITE_ADMIN_KEY`. For production, put it behind a VPN or
IP allowlist at the Nginx level.

---

## 7. Health Check Endpoints

### `GET /health`

The primary health check. Returns `200 ok` when the server, database, and Redis are reachable.

```json
{
  "status": "ok",
  "version": "1.0.0",
  "queues": {
    "messaging": { "waiting": 0, "active": 0, "failed": 0 }
  }
}
```

Use this in your load balancer health check:

```
# Nginx upstream
upstream api {
    server 127.0.0.1:3000;
}

location /health {
    proxy_pass http://api/health;
    access_log off;
}
```

### `GET /health/db`

Database-specific check. Returns `200` if PostGIS is reachable and the schema versions are current.

### `GET /health/queues`

BullMQ queue depths. Returns `200` unless any queue has more than 500 failed jobs.

---

## 8. Monitoring Setup

### Structured logging

The API uses `packages/observability` which wraps Pino. All log lines are JSON:

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "msg": "POST /v1/inquiries 201",
  "reqId": "req-abc123",
  "durationMs": 42
}
```

Sensitive fields (phone numbers, tokens, coordinates) are automatically redacted by the logger.

Ship logs to your preferred sink (stdout → Loki, Datadog, CloudWatch, etc.).

### Metrics

The API exposes Prometheus-compatible metrics at `/metrics` (gated by `ADMIN_KEY`):

| Metric                              | Type      | Description                                |
|-------------------------------------|-----------|--------------------------------------------|
| `http_requests_total`               | Counter   | Total HTTP requests by method, route, status |
| `http_request_duration_ms`          | Histogram | Request latency by route                   |
| `bullmq_queue_waiting`              | Gauge     | BullMQ waiting job count per queue         |
| `bullmq_queue_failed`               | Gauge     | BullMQ failed job count per queue          |
| `assistant_tokens_used_total`       | Counter   | Claude API tokens consumed                 |
| `whatsapp_messages_sent_total`      | Counter   | WhatsApp messages sent                     |

### Alerting recommendations

| Alert                        | Condition                                 | Severity |
|------------------------------|-------------------------------------------|----------|
| API down                     | `/health` fails for 2 consecutive checks  | Critical |
| High error rate              | 5xx rate > 1% over 5 minutes             | High     |
| Slow responses               | p99 latency > 3s over 5 minutes          | Medium   |
| Queue backed up              | `bullmq_queue_waiting` > 100             | Medium   |
| Failed jobs                  | `bullmq_queue_failed` increases          | High     |
| Database connections high    | pg_stat_activity count > 80% of max      | Medium   |

---

## 9. Secrets Management

### Development

Store secrets in `.env` (gitignored). Share with teammates through a password manager, not git.

### CI / GitHub Actions

Store secrets in GitHub repository Settings → Secrets and variables → Actions. Reference them in workflows
as `${{ secrets.MY_SECRET }}`. Never print them in logs.

### Production

Options (in order of preference):

1. **HashiCorp Vault** — inject secrets as environment variables at container start.
2. **AWS Secrets Manager / GCP Secret Manager** — read secrets at startup using the SDK in `packages/config`.
3. **Docker Secrets** — use `secrets:` in compose and `*_FILE` env vars where supported.
4. **`.env.prod` file** — acceptable for small deployments; restrict file permissions (`chmod 600`).

The `packages/config` package reads and validates all environment variables at startup. If a required
variable is missing, the server fails fast with a clear error message instead of silently behaving wrong.

---

## 10. Rollback Procedure

### API rollback

```bash
# Roll back to the previous image tag
API_IMAGE_TAG=<previous-tag> docker compose -f infra/docker-compose.prod.yml up -d api
```

### Database rollback

Drizzle does not auto-generate rollback scripts. To roll back a migration:

1. Write a manual rollback SQL file: `modules/<x>/migrations/000N_rollback_PREV.sql`.
2. Apply it: `psql $DATABASE_URL -f modules/<x>/migrations/000N_rollback_PREV.sql`
3. Remove the forward migration file.

This is why migrations must be backwards-compatible: they let you redeploy the old code before rolling back
the schema.

### Mobile rollback

- OTA update: publish a new EAS Update that reverts the JS changes.
- Build rollback: re-submit the previous `.aab` to the Play Store.
