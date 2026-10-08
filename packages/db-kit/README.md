# @iraq-maps/db-kit

Drizzle (node-postgres) access, per-schema migrations, isolated test databases, and the transactional outbox.

- **Provides:** `OutboxPublisher<DbTx>`, `startOutboxRelay` (which delivers to an `EventBus` or to BullMQ), and `createInProcessEventBus`.
- **Consumes:** `EventBus`, through the relay target.

## API

| Export | Use |
|---|---|
| `createDb(url)` | Returns `{ db, close }` over a `pg.Pool`. |
| `runModuleMigrations({ url, schema, migrationsDir })` | Creates `schema`, then applies the `*.sql` files in name order, each once. |
| `platformMigrationsDir` | Migrations of schema `platform`, the outbox. Run them with `schema: 'platform'` before any module that publishes events. |
| `createTestDatabase({ modules? })` | Returns `{ url, db, drop }`: a fresh database cloned from `iraqmaps_template`, with `platform` and the given modules' migrations applied. |
| `createOutboxPublisher(db)` | `publish(event, tx?)` validates the event against `packages/contracts` and inserts it into `platform.outbox` inside `tx`. |
| `startOutboxRelay({ db, target, pollIntervalMs? })` | Polls every `pollIntervalMs` (default 1000). Returns `{ drainOnce, stop }`. |
| `createInProcessEventBus()` | An `EventBus` for the relay's in-process target. It awaits handlers one after another, and unsubscribing twice is a no-op. |

### Migrations

`runModuleMigrations` records applied files in `<schema>._migrations`. All pending files run in one transaction, under a per-schema advisory lock, with `search_path = <schema>, public`:
- Unqualified creates land in the module's own schema.
- `public` only provides extension types and functions, such as `geometry` and `gin_trgm_ops`.
- `pnpm infra:local up` gives `public` to `postgres`, so the dev role can read it but not write to it.

**Boundary check.** This is a simple lexical guardrail against mistakes in our own reviewed migrations. It is not a sandbox. **Separate database roles per module, for production, are deferred to M7.** Until then, the migrating role can technically reach every schema, and in CI and docker-compose it is a superuser.

A file is rejected when:
- **Anywhere in the raw file, comments included:**
  - a `$`, which also covers dollar quoting;
  - an `E'...'` string;
  - a `U&` escape, which could spell any identifier;
  - `search_path`, `set_config` or `pg_settings`.
- **Outside comments, with string literals still checked because they can be function bodies:**
  - **SCHEMA clauses:** any `SCHEMA` keyword, such as `DROP`/`ALTER`/`CREATE SCHEMA`, `SET SCHEMA` or `IN SCHEMA`.
  - **Dynamic SQL:** `EXECUTE`, which also rules out triggers' `EXECUTE FUNCTION` for now.
  - **Cross-schema ownership commands:** `DROP OWNED`, `REASSIGN OWNED` and `DEFAULT PRIVILEGES`.
  - **Extension DDL:** `CREATE`, `ALTER` and `DROP EXTENSION`. Extensions live in the template only, but a column may still be named `extension`.
  - **Session statements:** a statement starting with `DO`, `SET`, `RESET` or `DISCARD`.
  - **Qualifiers:** any `.` outside a number whose left side is not the module's schema. This rejects `other.t`, `public.t`, `"other"."t"`, three-part names, table aliases such as `u.id`, and dotted text such as `'v1.2'` in literals.

So write column references unqualified. A rejected file fails the whole run, and nothing is applied. `src/db.test.ts` holds the regression cases from the M0 security audit.

### Test databases

The admin URL is the first one set of:
1. `TEST_DATABASE_ADMIN_URL`
2. `DATABASE_URL`
3. `postgres://iraqmaps:iraqmaps@localhost:5432/iraqmaps`, the default from `pnpm infra:local up`.

`pnpm infra:local up` creates the template. If it is missing, the first call creates it (UTF8, `C.UTF-8`, postgis, pg_trgm), which needs a superuser, as in the CI service container. Each test file creates its own database in `beforeAll` and calls `drop()` in `afterAll`.

```ts
import { createTestDatabase } from '@iraq-maps/db-kit';
import { identityMigrationsDir } from '../src';
const tdb = await createTestDatabase({ modules: [{ schema: 'identity', migrationsDir: identityMigrationsDir }] });
```

### Outbox

There is one shared table, `platform.outbox (seq, id uuid unique, event jsonb, created_at, published_at)`, rather than one table per module:
- The publisher needs no schema argument.
- A single relay serves every module.
- Modules write to it only through `createOutboxPublisher`, never with SQL.

The relay delivers each event exactly once:
1. It claims the oldest pending row with `FOR UPDATE SKIP LOCKED`.
2. It delivers the event.
3. It sets `published_at` in the same transaction.

Concurrent relays therefore never deliver the same event. If delivery throws, the transaction rolls back and the event stays pending until a later drain.

Delivery is in `seq` order only with a single relay, where a failing event blocks the ones after it. With concurrent relays, one relay can deliver seq+1 while another still holds or has failed seq.

The BullMQ target (default queue `domain-events`) adds the job `{ name: event.name, data: event, jobId: event.id }`, with completed jobs kept for 24 hours:
- The jobId dedupes a re-delivery after a crash between enqueue and commit.
- Consumers should run `parseEvent(job.data)` from `@iraq-maps/contracts`.

This package uses BullMQ 5.x, which bundles ioredis and accepts `connection: { url }`. The ESM build of 6.x needs a hand-made client instead.

## Env

| Variable | Used by |
|---|---|
| `TEST_DATABASE_ADMIN_URL`, `DATABASE_URL` | `createTestDatabase()` |
| `REDIS_URL` | the tests of this package (default `redis://localhost:6379`) |

The tests need `pnpm infra:local up`.
