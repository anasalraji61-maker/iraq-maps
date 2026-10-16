# Iraq Smart Maps — Deployment Guide

> Version: 1.0 · Last updated: 2026-10-16
> Covers self-hosted VPS / bare metal deployment. Cloud-managed databases work too.

---

## Table of Contents

1. [Infrastructure Requirements](#1-infrastructure-requirements)
2. [Environment Variables](#2-environment-variables-reference)
3. [Database Setup (PostgreSQL + PostGIS)](#3-database-setup)
4. [Redis Setup](#4-redis-setup)
5. [S3-Compatible Storage Setup](#5-s3-compatible-storage)
6. [Geo Services Setup](#6-geo-services-setup)
7. [Initial OSM Data Import](#7-initial-osm-data-import)
8. [First Run Checklist](#8-first-run-checklist)
9. [Health Checks](#9-health-checks)
10. [Monitoring Setup](#10-monitoring-setup)
11. [Backup Strategy](#11-backup-strategy)
12. [Rollback Procedure](#12-rollback-procedure)

---

## 1. Infrastructure Requirements

### Minimum (development / staging)

| Component      | Spec                                          |
|----------------|-----------------------------------------------|
| API server     | 2 vCPU, 4 GB RAM, 40 GB SSD                  |
| Database       | PostgreSQL 16 + PostGIS 3 (same host or RDS)  |
| Redis          | 512 MB RAM (same host is fine for staging)    |
| Object storage | Any S3-compatible (Cloudflare R2 recommended) |
| Geo services   | Valhalla + Photon on a separate 4 GB RAM host |

### Recommended (production, Mosul MVP)

| Component      | Spec                                                  |
|----------------|-------------------------------------------------------|
| API server     | 4 vCPU, 8 GB RAM, 100 GB NVMe SSD                    |
| Database       | Managed PostgreSQL 16 (e.g. Neon, Supabase, RDS), 20 GB |
| Redis          | 1 GB RAM (Upstash or self-hosted Redis 7)             |
| Object storage | Cloudflare R2 (zero egress fees, IQ-region)           |
| Tile CDN       | Cloudflare Pages or R2 public bucket for PMTiles file |
| Geo services   | Separate 2 vCPU, 4 GB VM for Valhalla                 |
| Monitoring     | Grafana Cloud free tier or self-hosted                |

### Ports to expose

| Port  | Service             | Expose to         |
|-------|---------------------|-------------------|
| 3000  | NestJS API          | Nginx / proxy     |
| 5432  | PostgreSQL          | API server only   |
| 6379  | Redis               | API server only   |
| 8002  | Valhalla HTTP       | API server only   |
| 2322  | Photon HTTP         | API server only   |

---

## 2. Environment Variables Reference

Copy `.env.example` to `.env`. Never commit `.env`.

### Core

| Variable                    | Required   | Default        | Description                                                          |
|-----------------------------|------------|----------------|----------------------------------------------------------------------|
| `APP_ENV`                   | Yes        | —              | `development` \| `test` \| `e2e` \| `production`                   |
| `API_PORT`                  | No         | `3000`         | Port the NestJS server listens on                                    |
| `LOG_LEVEL`                 | No         | `info`         | `debug` \| `info` \| `warn` \| `error`                             |
| `DATABASE_URL`              | Yes        | —              | PostgreSQL app role URL (DML only, no DDL)                          |
| `REDIS_URL`                 | Yes        | —              | Redis connection URL for BullMQ + session cache                     |
| `TRUST_PROXY`               | No         | `false`        | Hop count or CIDR list when behind reverse proxy. `true` refused in prod |
| `ADMIN_KEY`                 | No         | —              | Secret for `X-Admin-Key` header. Leave empty to disable admin routes |
| `REQUEST_SIGNING_SECRET`    | No         | —              | ≥32-char HMAC secret for `X-Request-Signature` mobile signing       |
| `TEST_DATABASE_ADMIN_URL`   | test only  | DATABASE_URL   | Admin-role DB URL for test setup                                    |

### Per-schema Migration URLs

These are used by `drizzle-kit migrate` per module. In local dev, leave blank to reuse `DATABASE_URL`.

| Variable                    | Schema       |
|-----------------------------|--------------|
| `DB_MIGRATE_URL_IDENTITY`   | identity     |
| `DB_MIGRATE_URL_PROVIDERS`  | providers    |
| `DB_MIGRATE_URL_PLACES`     | places       |
| `DB_MIGRATE_URL_MEDIA`      | media        |
| `DB_MIGRATE_URL_MESSAGING`  | messaging    |
| `DB_MIGRATE_URL_ASSISTANT`  | assistant    |
| `DB_MIGRATE_URL_DISCOVER`   | discover     |
| `DB_MIGRATE_URL_ACTIVITY`   | activity     |
| `DB_MIGRATE_URL_NOTIFICATIONS` | notifications |

### Identity / Auth

| Variable               | Required | Description                                          |
|------------------------|----------|------------------------------------------------------|
| `JWT_ACCESS_SECRET`    | Yes      | HS256 signing secret for access tokens (≥32 chars)  |
| `JWT_REFRESH_SECRET`   | Yes      | HS256 signing secret for refresh tokens (≥32 chars) |
| `PHONE_ENCRYPTION_KEY` | Yes      | Base64-encoded 32-byte AES-GCM key                  |
| `PHONE_HASH_KEY`       | Yes      | HMAC key for phone lookup hash                      |
| `OTP_SENDER`           | Yes      | `sms` \| `console` \| `fixed` \| `fake`            |
| `OTP_FIXED_CODE`       | e2e only | OTP code for e2e tests                              |
| `SMS_PROVIDER_API_KEY` | prod     | SMS gateway API key                                 |

Generate the encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Messaging (WhatsApp)

| Variable                         | Required | Description                               |
|----------------------------------|----------|-------------------------------------------|
| `MESSAGING_DAILY_LIMIT_PER_USER` | No       | Max inquiries/user/day (default: 10)      |
| `WHATSAPP_ACCESS_TOKEN`          | No       | WhatsApp Cloud API access token           |
| `WHATSAPP_PHONE_NUMBER_ID`       | No       | WhatsApp sender phone number ID           |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`  | No       | Webhook verification token (GET)          |
| `WHATSAPP_APP_SECRET`            | No       | Inbound webhook HMAC validation           |
| `WHATSAPP_TEMPLATE_NAME`         | No       | Approved message template name            |

### AI Assistant

| Variable                          | Required | Description                                    |
|-----------------------------------|----------|------------------------------------------------|
| `ANTHROPIC_API_KEY`               | Yes      | Claude API key                                 |
| `ASSISTANT_MODEL`                 | Yes      | e.g. `claude-3-5-haiku-20241022`               |
| `ASSISTANT_DAILY_LIMIT_PER_USER`  | No       | Max messages/user/day (default: 20)            |

### Media / Storage

| Variable               | Required | Description                               |
|------------------------|----------|-------------------------------------------|
| `STORAGE_TYPE`         | No       | `file` (dev) or `s3` (prod)              |
| `S3_ENDPOINT`          | s3 only  | e.g. `https://your-account.r2.cloudflarestorage.com` |
| `S3_BUCKET`            | s3 only  | Bucket name                               |
| `S3_ACCESS_KEY_ID`     | s3 only  | Access key                                |
| `S3_SECRET_ACCESS_KEY` | s3 only  | Secret key                                |
| `S3_REGION`            | No       | Default: `auto` (Cloudflare R2)           |
| `MEDIA_SIGNING_SECRET` | dev      | HMAC secret for local signed URLs         |
| `MEDIA_MAX_BYTES`      | No       | Upload size limit (default: 10485760)     |

### Geo Services

| Variable       | Required | Description                                             |
|----------------|----------|---------------------------------------------------------|
| `VALHALLA_URL` | No       | Valhalla HTTP endpoint (fake routing if unset)          |
| `PHOTON_URL`   | No       | Photon geocoding endpoint (PostGIS fallback if unset)   |
| `TILES_SOURCE` | No       | PMTiles file path or URL; `{city}` = city slug         |
| `GLYPHS_SOURCE`| No       | Glyph server path or URL for map label font rendering   |

### Push Notifications

| Variable                       | Required | Description                                   |
|--------------------------------|----------|-----------------------------------------------|
| `PUSH_PROVIDER`                | No       | `fake` (default) or `fcm`                    |
| `FCM_SERVICE_ACCOUNT_JSON_PATH`| fcm only | Absolute path to service account JSON file    |

### Mobile (Public — ships in APK binary)

| Variable               | Required | Description                                           |
|------------------------|----------|-------------------------------------------------------|
| `EXPO_PUBLIC_APP_ENV`  | Yes      | `development` \| `e2e` \| `production`               |
| `EXPO_PUBLIC_API_URL`  | Yes      | Backend API URL, e.g. `https://api.iraqsmartmaps.app` |
| `EXPO_PUBLIC_TILES_URL`| Yes      | PMTiles CDN URL, e.g. `https://tiles.iraqsmartmaps.app/mosul.pmtiles` |

**Warning:** `EXPO_PUBLIC_*` variables ship inside the app binary. Never put secrets here.

### Android Release Signing (GitHub Secrets)

| Variable           | Description                                          |
|--------------------|------------------------------------------------------|
| `KEYSTORE_BASE64`  | base64-encoded JKS/PKCS12 keystore                  |
| `KEYSTORE_ALIAS`   | Key alias inside the keystore                        |
| `KEYSTORE_PASSWORD`| Keystore password                                   |
| `KEY_PASSWORD`     | Key password (may equal KEYSTORE_PASSWORD)           |

### Admin Panel

| Variable       | Required | Description                                   |
|----------------|----------|-----------------------------------------------|
| `VITE_API_URL` | Yes      | Backend URL for admin panel                   |
| `VITE_ADMIN_KEY`| Yes     | `X-Admin-Key` value for admin panel calls      |

### Open Graph / Sharing

| Variable         | Required | Description                                            |
|------------------|----------|--------------------------------------------------------|
| `OG_IMAGE_BASE_URL` | No    | Base URL for OG image generation                       |
| `APP_BASE_URL`   | No       | Public app URL for deep link web fallbacks             |

---

## 3. Database Setup

### Install PostgreSQL 16 + PostGIS 3

```bash
# Ubuntu 24.04
apt install -y postgresql-16 postgresql-16-postgis-3 postgresql-16-pgtrgm

# Fedora / RHEL
dnf install -y postgresql16-server postgis36_16
```

### Create database and roles

```sql
-- As postgres superuser:
CREATE DATABASE iraqmaps;

-- App role (DML only — no DDL)
CREATE ROLE iraqmaps_app LOGIN PASSWORD 'change-me-in-production';
GRANT CONNECT ON DATABASE iraqmaps TO iraqmaps_app;

-- Migrator roles (DDL per schema, no cross-schema access)
CREATE ROLE iraqmaps_migrate_identity LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_providers LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_places LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_media LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_messaging LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_assistant LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_discover LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_activity LOGIN PASSWORD 'change-me';
CREATE ROLE iraqmaps_migrate_notifications LOGIN PASSWORD 'change-me';
```

### Enable required extensions

```sql
\c iraqmaps
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### Run migrations

```bash
# Run all module migrations (development: uses DATABASE_URL for all)
pnpm run db:migrate

# Or per module:
pnpm --filter @iraq-maps/identity run db:migrate
pnpm --filter @iraq-maps/places run db:migrate
# ... etc
```

### Performance tuning (production)

Add to `postgresql.conf`:
```
shared_buffers = 2GB              # 25% of RAM
effective_cache_size = 6GB        # 75% of RAM
work_mem = 64MB                   # for spatial sort/hash
maintenance_work_mem = 512MB      # for index builds
max_connections = 100             # adjust for connection pooler
random_page_cost = 1.1            # SSD
wal_compression = on
```

---

## 4. Redis Setup

### Install Redis 7

```bash
# Ubuntu
apt install -y redis-server

# Or use Upstash (managed, serverless Redis)
```

### Configuration (`redis.conf`)

```
maxmemory 1gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
appendonly no   # BullMQ does not require AOF; LRU eviction preferred
```

### Connection URL format

```
REDIS_URL=redis://:password@host:6379/0
# Or with TLS:
REDIS_URL=rediss://:password@host:6380/0
```

---

## 5. S3-Compatible Storage

### Cloudflare R2 (recommended for Iraq — zero egress)

1. Create R2 bucket in Cloudflare dashboard
2. Enable "Public Access" or use pre-signed URLs
3. Create API token with R2 Object Read & Write permissions
4. Configure CORS for the bucket:
```json
[{
  "AllowedOrigins": ["https://iraqsmartmaps.app", "http://localhost:3000"],
  "AllowedMethods": ["GET", "PUT", "DELETE"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```

### MinIO (self-hosted)

```bash
docker run -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=changeme \
  minio/minio server /data --console-address ":9001"
```

Set `S3_ENDPOINT=http://localhost:9000`, `S3_REGION=us-east-1`.

---

## 6. Geo Services Setup

### Valhalla (routing engine)

```bash
# Using Docker:
docker run -d --name valhalla \
  -p 8002:8002 \
  -v $(pwd)/geo-services/valhalla/tiles:/custom_files \
  ghcr.io/valhalla/valhalla:latest
```

Build tiles for Iraq:
```bash
cd geo-services/routing
./build-tiles.sh iraq.osm.pbf
# Tiles written to geo-services/valhalla/tiles/
```

Verify: `curl http://localhost:8002/status` should return `{"version": "3.x.x"}`.

### Photon (geocoding — optional, PostGIS used if absent)

```bash
# Download pre-built Photon jar and Iraq nominatim extract
wget https://github.com/komoot/photon/releases/download/0.5.1/photon-0.5.1.jar
java -jar photon-0.5.1.jar -nominatim-import -host localhost -port 5432 \
  -database nominatim -user nominatim -password change-me -languages ar,en

# Start server:
java -jar photon-0.5.1.jar
```

### PMTiles (vector tiles)

Vector tiles are generated from OSM data with Planetiler and served as a single `.pmtiles` file.

```bash
cd geo-services/tiles
./generate-tiles.sh mosul.osm.pbf
# Output: mosul-2026-10-08.pmtiles

# Upload to R2:
aws s3 cp mosul-2026-10-08.pmtiles s3://iraq-maps-tiles/ \
  --endpoint-url https://your.r2.endpoint

# Set EXPO_PUBLIC_TILES_URL to the public URL of this file
```

Alternatively, tiles are available as a GitHub Actions artifact (ADR-0008). Download and host on
your CDN.

---

## 7. Initial OSM Data Import

Run once after database setup to populate `places.osm_places`.

### 1. Download Iraq OSM extract

```bash
# From Geofabrik (ODbL licensed)
wget https://download.geofabrik.de/asia/iraq-latest.osm.pbf
```

### 2. Extract target city (optional, for MVP)

```bash
# Install osmium-tool
apt install -y osmium-tool

# Extract Mosul bounding box
osmium extract --bbox 43.0,36.2,43.3,36.5 \
  iraq-latest.osm.pbf -o mosul.osm.pbf
```

### 3. Run the import

```bash
# From monorepo root:
pnpm --filter @iraq-maps/places run import -- \
  --file ./mosul.osm.pbf \
  --city mosul \
  --dry-run         # remove --dry-run for actual import

# Expected output:
# Processed 14,832 nodes
# Inserted 8,241 places
# Skipped 6,591 (no amenity/shop tag)
# Import complete in 45s
```

### 4. Verify import

```sql
SELECT COUNT(*) FROM places.osm_places WHERE city_id = 'mosul';
-- Expected: ~8000 rows

SELECT category, COUNT(*) FROM places.osm_places
WHERE city_id = 'mosul' GROUP BY category ORDER BY 2 DESC LIMIT 10;
```

---

## 8. First Run Checklist

Before going live, verify each item:

### Infrastructure

- [ ] `DATABASE_URL` connects to PostgreSQL 16+ with PostGIS 3 enabled
- [ ] All DB migrations ran successfully (`SELECT * FROM drizzle.__drizzle_migrations`)
- [ ] `REDIS_URL` connects, `redis-cli ping` returns `PONG`
- [ ] S3 bucket accessible, test upload succeeds
- [ ] `VALHALLA_URL` reachable: `curl $VALHALLA_URL/status`

### Security

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are ≥32 chars and not the example values
- [ ] `PHONE_ENCRYPTION_KEY` is a freshly generated 32-byte base64 key
- [ ] `ADMIN_KEY` is set to a strong random string if admin routes are needed
- [ ] `APP_ENV=production` (not development)
- [ ] `TRUST_PROXY` is set to hop count or CIDR, never `true`
- [ ] `OTP_SENDER=sms` (not console or fake)
- [ ] No `.env` file in Git (`git status` shows clean)
- [ ] `pnpm gitleaks` passes

### Functional

- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] OTP request and verify flow works end-to-end with a real phone number
- [ ] Place search returns results: `GET /v1/places/search?q=مطعم&lat=36.34&lng=43.13&r=2000`
- [ ] Map tiles load in the mobile app
- [ ] AI assistant responds (check `ANTHROPIC_API_KEY` is valid)

### Mobile

- [ ] `EXPO_PUBLIC_API_URL` points to the production API
- [ ] `EXPO_PUBLIC_TILES_URL` points to the hosted PMTiles file
- [ ] Push notifications work (send a test FCM message from Firebase console)
- [ ] Deep links open the correct screens

---

## 9. Health Checks

### API health endpoint

```
GET /health
```

Returns:
```json
{
  "status": "ok",
  "version": "1.2.3",
  "queues": {
    "domain-events": { "waiting": 0, "active": 1, "failed": 0 },
    "notifications": { "waiting": 3, "active": 0, "failed": 0 }
  }
}
```

Returns 503 if PostgreSQL or Redis is unreachable.

### Suggested uptime monitor checks

| Check              | URL / command                                | Expected result       |
|--------------------|----------------------------------------------|-----------------------|
| API liveness       | `GET /health`                                | HTTP 200, status: ok  |
| DB connectivity    | `pg_isready -h $DB_HOST -U iraqmaps_app`     | accepting connections |
| Redis              | `redis-cli -u $REDIS_URL ping`               | PONG                  |
| Valhalla           | `GET $VALHALLA_URL/status`                   | HTTP 200              |
| Queue depth        | `GET /health` → queues.*.failed == 0         | No failed jobs        |

---

## 10. Monitoring Setup

### Structured logging

The API outputs JSON logs via Pino. Pipe to your log aggregator:

```bash
# Local dev
node dist/main.js | pino-pretty

# Production (pipe to Loki / Datadog / Logtail)
node dist/main.js | loki-client \
  --labels 'app=iraqmaps,env=production'
```

### Metrics (Prometheus-compatible)

The API exposes Prometheus metrics at `/metrics` (requires `ADMIN_KEY` header or internal network only).

Key metrics to alert on:
- `http_request_duration_seconds_p99` > 2s
- `bullmq_failed_jobs_total` increasing
- `http_requests_total{status="5xx"}` > 0.1%
- `assistant_daily_limit_reached_total` (user experience signal)

### Grafana dashboard

Import the community NestJS + BullMQ dashboard (ID: 14565) for queue metrics.
Add a PostGIS panel tracking `pg_stat_user_tables` row counts for osm_places.

### Error tracking

Set `SENTRY_DSN` (in `adapters/errors-sentry`) to capture unhandled exceptions. Sentry is
optional — the app runs fine without it; errors appear in logs.

---

## 11. Backup Strategy

### PostgreSQL

```bash
# Daily automated backup (add to cron):
pg_dump -Fc iraqmaps > /backups/iraqmaps-$(date +%Y%m%d).dump

# Restore:
pg_restore -d iraqmaps /backups/iraqmaps-20261016.dump
```

Recommended: enable WAL archiving for point-in-time recovery in production.
Point-in-time recovery requires `wal_level = replica` and an archive command.

Retention policy:
- Daily backups: keep 7 days
- Weekly backups: keep 4 weeks
- Monthly backups: keep 12 months

### Redis

Redis is used for ephemeral state (sessions, rate limits, OTP). Full backup is not critical.
If Redis is lost, users may need to log in again (refresh tokens in Redis are lost).

To back up if needed:
```bash
redis-cli -u $REDIS_URL BGSAVE
# Then copy /var/lib/redis/dump.rdb
```

### S3 / Media

Enable R2 or S3 versioning on the media bucket. For disaster recovery, enable cross-region
replication to a second bucket.

### PMTiles

The PMTiles file is generated from OSM data and can be regenerated from the planet dump at any
time. Keep the latest generated file in at least 2 locations (CDN + local archive).

---

## 12. Rollback Procedure

### API server rollback

```bash
# Docker / systemd: restart previous image tag
docker run -d ... iraqmaps/api:v1.2.2   # previous tag

# Or with systemd:
systemctl stop iraqmaps-api
# Deploy previous build artifact
systemctl start iraqmaps-api
```

### Database migration rollback

Drizzle does not auto-generate down migrations. To roll back a schema change:

1. Identify the migration file: `modules/<x>/migrations/00N_<name>.sql`
2. Write a manual rollback SQL: `modules/<x>/migrations/00N_<name>_down.sql`
3. Apply: `psql $DATABASE_URL -f modules/<x>/migrations/00N_<name>_down.sql`
4. Remove the migration record: `DELETE FROM drizzle.__drizzle_migrations WHERE hash = '...'`

**For this reason: always test migrations on staging before production.**

### Mobile app rollback

Android: use Google Play Console to roll back to a previous APK release track.
For emergency rollback, use Firebase App Distribution to push a previous build to testers.

---

*End of deployment guide. For local development setup see `docs/LOCAL_DEV.md`.*
