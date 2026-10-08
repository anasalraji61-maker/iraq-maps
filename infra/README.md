# infra

Local PostgreSQL 16 + PostGIS 3.4 and Redis for development and tests. There are no Testcontainers ([ADR-0004](../docs/adr/0004-local-postgis-instead-of-testcontainers.md)).

## Without Docker (agent environment, CI-like Linux boxes)

```sh
pnpm infra:local up       # idempotent
pnpm infra:local status   # exits non-zero if either service is down
pnpm infra:local down
```

`up` does the following:
- Starts the PostgreSQL 16 `main` cluster with `pg_ctlcluster`. It uses sudo when not root.
- Ensures the login role `iraqmaps`, with password `iraqmaps` and CREATEDB (not superuser).
- Ensures two databases, both UTF8 / `C.UTF-8` with `postgis` and `pg_trgm`, and with schema `public` owned by `postgres`, so `iraqmaps` can read it but not write to it:
  - `iraqmaps` for dev.
  - `iraqmaps_template`, the template that `createTestDatabase()` clones.
- Starts `redis-server --daemonize yes` on 127.0.0.1:6379 without persistence.

It needs a Debian-style `postgresql-16` + `postgresql-16-postgis-3` install and `redis-server`.

## With Docker (developer machines)

```sh
docker compose -f infra/docker-compose.yml up -d
```

This uses the same images as CI: `postgis/postgis:16-3.4` and `redis:7`. Ports are published on 127.0.0.1 only. Here the `iraqmaps` user is a superuser, so the first `createTestDatabase()` creates `iraqmaps_template` itself.

## Environment

The credentials are non-secret dev defaults, used only on local machines.

| Variable | Local value | Used by |
|---|---|---|
| `DATABASE_URL` | `postgres://iraqmaps:iraqmaps@localhost:5432/iraqmaps` | apps, migrations |
| `REDIS_URL` | `redis://localhost:6379` | rate limits, BullMQ, db-kit tests |
| `TEST_DATABASE_ADMIN_URL` | unset, which falls back to `DATABASE_URL` and then to the URL above | `createTestDatabase()` (`packages/db-kit`) |

In CI, point `TEST_DATABASE_ADMIN_URL` (or `DATABASE_URL`) at the postgis service container. Its user is a superuser, so the template is created on first use.
