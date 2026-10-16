# Iraq Maps — Performance Architecture

This document records the performance decisions baked into the Iraq Maps API stack,
explains the caching strategy, and provides operational guidance for the monitoring dashboards.

---

## 1. Architecture decisions

### 1.1 Single-process Node.js API

The API runs as a single Fastify process per container rather than a cluster. Horizontal
scaling is handled at the infrastructure layer (Kubernetes replicas behind a load balancer).
This keeps shared state simple: there is no IPC, no shared-memory race conditions, and no
need to partition in-process caches across workers.

**Trade-off:** a GC pause or event loop block affects all requests on that instance. Mitigate
with the event-loop lag metric (`iraq_maps_event_loop_lag_ms`); page on-call when it
consistently exceeds 100 ms.

### 1.2 Connection pool sizing

| Parameter         | Value | Rationale                                                                              |
|-------------------|-------|----------------------------------------------------------------------------------------|
| `DB_POOL_MIN`     | 10    | Keep connections warm; avoids cold-start latency on the first request after idle time. |
| `DB_POOL_MAX`     | 50    | Matches recommended max for a standard Postgres instance (100 connections / 2 apps).  |
| `DB_IDLE_TIMEOUT_MS` | 30 000 | Release idle sockets before network devices drop them silently.               |
| `DB_ACQUIRE_TIMEOUT_MS` | 5 000 | Fail fast rather than queue infinitely when the pool is exhausted.        |

Pool utilization is exposed as `iraq_maps_db_pool_utilization_ratio`. Page when it exceeds
0.8 for more than 5 minutes; scale horizontally or increase `DB_POOL_MAX`.

### 1.3 Redis as cache + rate-limit store

Redis serves two purposes:

1. **Application cache** — per-entity TTL cache in front of PostGIS queries. See §2.
2. **Rate-limit store** — sliding-window counters for per-IP and per-user rate limiting.

These share the same Redis instance in development. In production they should use
separate Redis databases (database index 0 for cache, database index 1 for rate limiting)
or separate instances to avoid cache eviction starving the rate-limiter.

### 1.4 PostGIS for spatial queries

All geospatial queries use PostGIS functions (`ST_DWithin`, `ST_Distance`, `ST_MakePoint`).
Key rules:

- Always pass coordinates as `POINT(lng lat)` with SRID 4326.
- Use `ST_DWithin` instead of `ST_Distance < X` — the former uses a spatial index.
- `places` and `providers` tables carry a `location geography(POINT, 4326)` column with
  a GIST index.
- Bounding-box pre-filter with `ST_MakeEnvelope` before expensive `ST_DWithin` on large
  result sets (> 10 000 candidate rows).

### 1.5 HTTP keep-alive and connection reuse

Fastify is configured with `http2: false` and keep-alive enabled. All outbound calls to
external services (Claude API, WhatsApp Cloud) are made through a shared `fetch`-based
client that reuses connections. Never create a new HTTP client per request.

---

## 2. Caching strategy

### 2.1 Cache layers

```
Browser / CDN  →  API response cache (Cache-Control)  →  Redis  →  PostGIS
```

| Layer        | Owner           | Technology        | Purpose                                              |
|--------------|-----------------|-------------------|------------------------------------------------------|
| Browser      | Client          | Cache-Control     | Static assets; immutable tiles (1 year)             |
| CDN / proxy  | Infra           | Nginx / Cloudflare| Public API responses (place lists, search results)  |
| Redis        | API process     | ioredis + RedisCache | Per-entity, per-user, and hot-path query results |
| PostGIS      | DB              | GIST index        | Authoritative data; always consistent               |

### 2.2 TTL table

All TTLs are read from environment variables so they can be tuned per deployment without
a code change. The defaults below assume a development-scale deployment.

| Cache key pattern              | Default TTL | Env var override          | Notes                                      |
|-------------------------------|-------------|---------------------------|--------------------------------------------|
| `place:detail:{id}`           | 5 min       | `TTL_PLACE_DETAIL`        | Invalidated on provider update             |
| `place:nearby:{lat}:{lng}:{r}`| 2 min       | `TTL_PLACE_NEARBY`        | Rounded to 100 m grid to maximise hits     |
| `place:search:{q}:{city}`     | 10 min      | `TTL_PLACE_SEARCH`        | Query normalised before hashing            |
| `provider:profile:{id}`       | 5 min       | `TTL_PROVIDER_PROFILE`    | Invalidated on provider self-update        |
| `provider:menu:{id}`          | 15 min      | `TTL_PROVIDER_MENU`       | Menu changes are infrequent                |
| `insights:crowd:{placeId}`    | 1 min       | `TTL_INSIGHTS_CROWD`      | Crowding data is near-real-time            |
| `insights:price:{placeId}`    | 30 min      | `TTL_INSIGHTS_PRICE`      | Price data changes slowly                  |
| `routing:{from}:{to}:{mode}`  | 24 h        | `TTL_ROUTING`             | Routes change only when road data updates  |
| `geocode:{q}`                 | 24 h        | `TTL_GEOCODE`             | Geocoder results are stable                |
| `session:{token}`             | 7 days      | `TTL_SESSION`             | Sliding; refreshed on each request         |
| `otp:{phone}`                 | 5 min       | `TTL_OTP`                 | Hard limit; not sliding                    |

### 2.3 Cache key construction

All keys are built by `QueryCache` in `packages/db-kit`. Rules:

- Normalise Arabic text before hashing (via `packages/i18n`'s Arabic normaliser).
- Truncate free-text components to 64 characters before hashing to cap key length.
- Never include user ID in spatial cache keys; spatial results are public. Per-user
  personalisation sits in a separate personalisation layer applied after cache lookup.
- Round coordinates to 4 decimal places (~11 m) before including in a cache key.

### 2.4 Cache invalidation

Invalidation is event-driven. When an entity changes, the module that owns it publishes
an event through the transactional outbox. A listener in the cache layer calls
`RedisCache.del(pattern)`. This ensures invalidation is durable even if the API restarts
between the write and the invalidation.

Do not use `FLUSHDB`. Use pattern-based `SCAN` + `DEL` scoped to the affected key prefix.

### 2.5 Compression

`RedisCache` compresses values larger than 1 KB with `zlib.gzip`. This is transparent to
callers. The compression savings are tracked in `iraq_maps_cache_hits_total` / `iraq_maps_cache_misses_total`
and visible on the Grafana dashboard.

---

## 3. DB query optimisation guidelines

### 3.1 Indexes

Every `SELECT … WHERE` clause that is not a primary-key lookup must have a supporting index
created in the migration for that module. Required indexes for the MVP:

| Table           | Index columns                | Type  | Notes                          |
|-----------------|------------------------------|-------|--------------------------------|
| `places`        | `location`                   | GIST  | PostGIS spatial index          |
| `places`        | `city_id, status`            | BTree | City browse / filter           |
| `places`        | `name gin_trgm_ops`          | GIN   | Arabic trigram search          |
| `providers`     | `user_id`                    | BTree | Provider auth lookup           |
| `providers`     | `place_id`                   | BTree | Place → provider join          |
| `insights`      | `place_id, observed_at`      | BTree | Crowding/price time series     |
| `messages`      | `thread_id, created_at`      | BTree | Thread history pagination      |
| `outbox`        | `status, created_at`         | BTree | Relay polling                  |

### 3.2 Query rules

1. **Avoid `SELECT *`** — list only the columns the feature needs. Reduces row size and
   disables PostGIS's heavy geometry serialisation when location is not needed.
2. **Paginate all list queries** — use cursor-based pagination from `CursorPagination` in
   `packages/db-kit`. Never use `OFFSET` beyond page 5 (performance degrades linearly).
3. **Parameterise always** — all values are bound parameters, never interpolated. This
   is enforced by the Drizzle query builder; never fall back to raw `sql.raw(userInput)`.
4. **Prefer `LIMIT 1` over `.find()`** — when you only need one row, add `LIMIT 1` so
   Postgres can stop scanning after the first match.
5. **Use `EXPLAIN ANALYSE` in staging** — run it for every new query during code review.
   Add the output as a comment in the PR. Alert if `actual rows` differs from `rows`
   estimate by more than 10×.
6. **Transaction scope** — keep transactions short. Do not include HTTP calls, AI inference
   or slow I/O inside a DB transaction.

### 3.3 Slow query log

Any query exceeding `SLOW_QUERY_MS` (default 500 ms) is logged as a `warn` entry by
`ManagedPool`. The log includes the query label (not the SQL text or parameters), the
duration, and the pool name. Aggregate these in your log sink to find regressions.

---

## 4. Pagination best practices

### 4.1 Cursor-based pagination

All list endpoints use opaque cursors (base-64-encoded, HMAC-signed JSON) rather than
`LIMIT/OFFSET`. Reasons:

- Stable under concurrent inserts/deletes (no skipped or duplicated rows).
- O(log N) instead of O(N) for deep pages.
- Cursor tokens are safe to expose to clients; they carry no sensitive data.

`encodeCursor` / `decodeCursor` in `packages/db-kit` handle serialisation and validation.
The HMAC key is `CURSOR_SECRET` from environment.

### 4.2 Page size limits

| Endpoint category          | Default page size | Max page size |
|---------------------------|-------------------|---------------|
| Place search / nearby     | 20                | 50            |
| Provider listing          | 20                | 50            |
| Message thread            | 30                | 100           |
| Discover feed             | 20                | 50            |
| Activity log              | 50                | 200           |

Requests that ask for more than the max are silently capped, not rejected, to avoid
breaking clients that send a large value.

### 4.3 Total count

Avoid `SELECT COUNT(*)` on large tables — it causes a full scan even with a WHERE clause
unless the planner can use an index-only scan. For public-facing counts, prefer:

- A pre-computed counter maintained by triggers or events.
- An approximate count from `pg_class.reltuples` for informational displays.
- Omit the total count from the response and use `hasNextPage` / cursor instead.

---

## 5. WebSocket connection limits

The API exposes a real-time WebSocket endpoint at `/ws` for the Discover feed and live
crowding updates.

| Parameter                    | Default | Env var             |
|-----------------------------|---------|---------------------|
| Max connections per instance | 10 000  | `WS_MAX_CONNECTIONS`|
| Idle ping interval           | 30 s    | `WS_PING_INTERVAL_MS`|
| Max message size             | 64 KB   | `WS_MAX_MSG_BYTES`  |
| Reconnect back-off (client)  | 1–30 s  | —                   |

Connections are tracked in `iraq_maps_ws_connections_active`. Alert when it exceeds 80% of
`WS_MAX_CONNECTIONS`. Scale horizontally and ensure the load balancer uses sticky sessions
or that the subscription state is stored in Redis (pub/sub) so clients can reconnect to any replica.

---

## 6. Rate limiting strategy

Rate limiting uses a Redis sliding-window algorithm (Lua script, atomic).

### 6.1 Limits by endpoint class

| Endpoint class             | Window  | Max requests | Key          |
|---------------------------|---------|--------------|--------------|
| Default (all routes)       | 60 s    | 100          | Per IP or user |
| Auth OTP request           | 60 s    | 5            | Per IP       |
| Auth OTP verify            | 60 s    | 10           | Per IP       |
| AI assistant               | 60 s    | 20           | Per user     |
| Search                     | 60 s    | 30           | Per user/IP  |
| Admin / internal           | Exempt  | —            | —            |
| Health / metrics           | Exempt  | —            | —            |

Limits are configurable without code changes:

```bash
RATE_LIMIT_WINDOW_S=60
RATE_LIMIT_MAX=100
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_SEARCH_MAX=30
RATE_LIMIT_ASSISTANT_MAX=20
```

### 6.2 Response on breach

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1730000000

{
  "type": "about:blank",
  "title": "Too Many Requests",
  "status": 429,
  "code": "rate_limit_exceeded",
  "retryAfterSeconds": 42
}
```

### 6.3 Fail-open policy

If Redis is unreachable, the rate limiter fails open (allows the request). This avoids
a Redis outage taking down the entire API. The tradeoff is that rate limiting is disabled
until Redis recovers. Alert on Redis unavailability via the health endpoint.

---

## 7. Monitoring dashboards guide

### 7.1 Key metrics

| Metric                                  | Type      | Alert threshold               |
|----------------------------------------|-----------|-------------------------------|
| `iraq_maps_http_request_duration_ms`    | Histogram | p99 > 2 000 ms for 5 min      |
| `iraq_maps_db_pool_utilization_ratio`   | Gauge     | > 0.8 for 5 min               |
| `iraq_maps_db_pool_connections_waiting` | Gauge     | > 5 for 1 min                 |
| `iraq_maps_cache_hits_total`            | Counter   | Hit ratio < 0.5 (custom alert)|
| `iraq_maps_ws_connections_active`       | Gauge     | > 8 000                       |
| `iraq_maps_bullmq_jobs_total` (failed)  | Counter   | > 100 failed in 10 min        |
| `iraq_maps_event_loop_lag_ms`           | Gauge     | > 100 ms for 5 min            |
| `iraq_maps_process_heap_bytes`          | Gauge     | > 512 MB                      |

### 7.2 Health endpoints

```
GET /health         → { status: 'ok'|'degraded'|'down', checks: [...] }
GET /health/ready   → 200 / 503
GET /health/live    → 200 always (until SIGTERM)
GET /metrics        → Prometheus text (X-Admin-Key required)
```

Use `/health/ready` as the Kubernetes `readinessProbe`. Use `/health/live` as the
`livenessProbe` with `failureThreshold: 1` (a failing liveness probe restarts the pod).

### 7.3 Grafana dashboard setup

1. Add a Prometheus data source pointing to your scrape endpoint.
2. Import the Iraq Maps dashboard JSON from `infra/grafana/dashboards/api.json`.
3. The dashboard includes panels for:
   - Request rate and error rate (by status class)
   - p50/p95/p99 latency heatmap
   - DB pool utilization over time
   - Cache hit ratio per prefix
   - WebSocket connections
   - BullMQ job states
   - Event loop lag
   - Heap and RSS memory

### 7.4 Scrape configuration (Prometheus)

```yaml
scrape_configs:
  - job_name: iraq-maps-api
    scrape_interval: 15s
    static_configs:
      - targets: ['api:3000']
    metrics_path: /metrics
    authorization:
      type: Bearer          # not Bearer — use a custom header
    # X-Admin-Key header is not natively supported in Prometheus basic_auth;
    # use a reverse proxy that injects the header, or expose metrics on a
    # separate internal port without the admin key requirement.
```

Recommended: run a lightweight metrics proxy (e.g. nginx with `proxy_set_header X-Admin-Key $secret;`)
on the pod's internal network that forwards `/metrics` to the API.
