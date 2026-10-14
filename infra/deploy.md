# Deployment — staging

## Prerequisites

- Docker 24+ with Compose v2
- A `.env` file in the repo root (copy `.env.example` and fill all required values)

## Required env vars

| Variable | Notes |
|---|---|
| `APP_ENV` | Set to `production` |
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` |
| `REDIS_URL` | `redis://host:6379` |
| `JWT_ACCESS_SECRET` | Random 64-char string |
| `JWT_REFRESH_SECRET` | Random 64-char string |
| `PHONE_ENCRYPTION_KEY` | Base64 32-byte AES-GCM key |
| `PHONE_HASH_KEY` | HMAC key for phone lookup |
| `API_PORT` | Default `3000` |
| `TRUST_PROXY` | Set to hop count or proxy CIDRs if behind a reverse proxy |
| `ANTHROPIC_API_KEY` | Required for the AI assistant |
| `ASSISTANT_MODEL` | e.g. `claude-3-5-haiku-20241022` |

Optional but needed for full functionality: `WHATSAPP_*`, `S3_*`, `VALHALLA_URL`, `PHOTON_URL`, `TILES_SOURCE`, `GLYPHS_SOURCE`, `FCM_SERVICE_ACCOUNT_JSON_PATH`.

## Build the image

```bash
# Run from the repo root
docker build -f apps/api/Dockerfile -t iraq-maps-api:staging .
```

## Start staging stack

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.staging.yml \
  up -d
```

## Run database migrations

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.staging.yml \
  run --rm api \
  tsx --tsconfig apps/api/tsconfig.run.json apps/api/src/migrate.ts
```

## Stop

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.staging.yml \
  down
```

## Notes

- Secrets come from `.env` only — never baked into the image (repo is public).
- The API runs as non-root user `appuser` (UID 1001).
- tsx compiles TypeScript at runtime using `tsconfig.run.json`, which pulls in `modules/*/src` and `packages/*/src` directly — no separate build step needed.
- The healthcheck hits `GET /health`; ensure the API module registers that route.
