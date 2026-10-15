# Local Development Setup

This guide gets a new developer from zero to a running Iraq Smart Maps dev environment.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20 LTS | Use `nvm` or `fnm` to switch versions |
| pnpm | 9+ | `npm i -g pnpm` |
| Docker (optional) | 24+ | Only needed if you don't have a local Postgres/Redis |
| Android Studio | Ladybug+ | Required for Android emulator; SDK Platform 34 |
| Java | 17 | Set `JAVA_HOME`; required for the Android build |
| Git | 2.40+ | |

> **Iraq environment note**: if your internet connection is slow or intermittent, `pnpm install` may time out. Run `pnpm config set fetch-retry-mintimeout 20000 fetch-retry-maxtimeout 120000` once to increase timeouts.

---

## 1. Clone and install

```bash
git clone https://github.com/<org>/iraq-maps.git
cd iraq-maps
pnpm install
```

Turborepo caches build outputs. The first install and build will be slower than subsequent ones.

---

## 2. Environment variables

Copy the template and fill in **only** the variables you need for local work. Never commit real secrets.

```bash
cp .env.example .env
```

Key variables for local dev:

| Variable | Default / Mock value | Purpose |
|----------|---------------------|---------|
| `DATABASE_URL` | `postgres://iraq_maps:dev@localhost:5432/iraq_maps` | PostgreSQL with PostGIS |
| `REDIS_URL` | `redis://localhost:6379` | Cache and BullMQ queues |
| `OTP_SENDER` | `fixed` | Use a fixed OTP code instead of real SMS |
| `OTP_FIXED_CODE` | `123456` | The fixed code when `OTP_SENDER=fixed` |
| `ASSISTANT_MODEL` | `claude-3-haiku-20240307` | Claude model for the assistant (cheap for dev) |
| `ANTHROPIC_API_KEY` | *(your key)* | Required only if testing the real assistant |
| `S3_BUCKET` | `iraq-maps-dev` | Local MinIO bucket name |
| `S3_ENDPOINT` | `http://localhost:9000` | Local MinIO endpoint |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Local MinIO key |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Local MinIO secret |
| `ROUTING_ENGINE_URL` | `http://localhost:8002` | Valhalla instance |
| `GEOCODER_URL` | `http://localhost:2322` | Photon instance |
| `TILES_BASE_URL` | `http://localhost:8080` | PMTiles server |
| `API_PORT` | `3000` | NestJS HTTP port |
| `JWT_SECRET` | `dev-secret-change-in-prod` | Auth signing key (local only) |

See `.env.example` for the full list and comments.

---

## 3. Start local infrastructure

### Option A — Docker Compose (recommended)

```bash
pnpm infra:local up
```

This starts PostgreSQL 16 + PostGIS, Redis 7, MinIO, and a local PMTiles server.

```bash
pnpm infra:local down      # stop containers
pnpm infra:local logs      # tail all logs
```

### Option B — Native (no Docker)

Install PostgreSQL 16 with the PostGIS extension and Redis 7 directly on your machine, then update `DATABASE_URL` and `REDIS_URL` in `.env`.

---

## 4. Run database migrations

```bash
pnpm turbo run db:migrate
```

Each module applies its own migrations in `modules/<name>/migrations/`. Migrations are idempotent.

---

## 5. Start the API server

```bash
pnpm turbo run dev --filter=apps/api
# or
cd apps/api && pnpm dev
```

The API starts on `http://localhost:3000` (or `$API_PORT`). Health check: `GET /healthz`.

---

## 6. Start the mobile app

### iOS simulator (macOS only)

```bash
pnpm turbo run dev --filter=apps/mobile -- --ios
```

### Android emulator

Make sure an Android emulator is running in Android Studio, then:

```bash
pnpm turbo run dev --filter=apps/mobile -- --android
```

### Expo Go / physical device

```bash
pnpm turbo run dev --filter=apps/mobile
```

Scan the QR code with Expo Go. The app connects to `http://<your-LAN-IP>:3000` — update `EXPO_PUBLIC_API_BASE_URL` in `.env` if Expo doesn't detect your IP automatically.

> **RTL note**: Android emulators default to LTR. Set the emulator language to Arabic (`ar`) or Kurdish (`ckb`) in **Settings → General → Language** to test RTL layouts.

---

## 7. Run the test suite

```bash
pnpm gate                              # full closure gate (all checks)
pnpm turbo run lint typecheck test     # lint + type + tests only
pnpm turbo run test --filter=@iraq-maps/places   # one package
```

Tests run against a local PostGIS database (no Testcontainers). Ensure `DATABASE_URL` points at an accessible instance.

---

## 8. Useful dev commands

```bash
pnpm ownership:check          # verify your diff stays inside your milestone's owned paths
pnpm gitleaks                 # scan for accidentally committed secrets
pnpm depcruise                # check module boundary rules
pnpm android:precheck         # validate the Expo Android build without an Android SDK
```

---

## 9. Geo services (optional)

For full navigation and geocoding you need Valhalla (routing) and Photon (geocoding) running locally. These are resource-intensive; most feature work does not require them — the routing and geocoding ports have in-memory fakes that are used automatically when the real services are not configured.

```bash
# Start all geo services (requires 4 GB RAM minimum)
cd geo-services && docker-compose up
```

OSM extract for Iraq: download `iraq-latest.osm.pbf` from Geofabrik and place it in `geo-services/data/`. The tile-generation pipeline (`geo-services/tiles/`) converts it to PMTiles.

---

## 10. Admin panel

```bash
pnpm turbo run dev --filter=apps/admin
```

Opens on `http://localhost:3001`. Requires an API user with the `admin` role (set `roles = ['admin']` directly in the database for your dev account).

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `pnpm install` fails with network error | Slow/intermittent connection | Increase fetch timeouts (see §1) |
| `db:migrate` fails with "extension not found" | PostGIS not installed | `CREATE EXTENSION postgis;` as a superuser |
| Metro bundler can't connect | API not running or wrong IP | Check `EXPO_PUBLIC_API_BASE_URL` in `.env` |
| Android build fails | Wrong Java version | Ensure `JAVA_HOME` points to JDK 17 |
| `pnpm gate` fails on `gitleaks` | A secret crept into a file | Check the scan report; rotate the key immediately |
