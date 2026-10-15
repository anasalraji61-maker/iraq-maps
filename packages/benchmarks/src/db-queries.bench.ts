/**
 * Database query benchmarks — measure p50/p95/p99 for key read paths.
 * Skips automatically when DATABASE_URL is not set (CI without a real DB).
 *
 * Run with:  pnpm --filter @iraq-maps/benchmarks bench
 */
import { createTestDatabase, type TestDatabase } from '@iraq-maps/db-kit';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, bench, describe } from 'vitest';
import { moduleMigrations } from '@iraq-maps/api';

const skip = !process.env.DATABASE_URL;

let tdb: TestDatabase;

beforeAll(async () => {
  if (skip) return;
  tdb = await createTestDatabase({ modules: moduleMigrations });
});

afterAll(async () => {
  await tdb?.drop();
});

describe.skipIf(skip)('db connection and basic queries', () => {
  bench('SELECT 1 — raw connection round-trip', async () => {
    await tdb.db.execute(sql`SELECT 1`);
  });

  bench('SELECT NOW() — with timestamp parsing', async () => {
    await tdb.db.execute(sql`SELECT NOW()`);
  });
});

describe.skipIf(skip)('platform schema queries', () => {
  bench('count rows in platform.outbox (empty)', async () => {
    await tdb.db.execute(sql`SELECT COUNT(*) FROM platform.outbox`);
  });

  bench('SELECT from platform.outbox with limit', async () => {
    await tdb.db.execute(
      sql`SELECT id, event, created_at FROM platform.outbox ORDER BY created_at DESC LIMIT 20`,
    );
  });
});

describe.skipIf(skip)('identity schema queries', () => {
  bench('count users (empty table)', async () => {
    await tdb.db.execute(sql`SELECT COUNT(*) FROM identity.users`);
  });

  bench('look up user by phone hash (no rows)', async () => {
    await tdb.db.execute(
      sql`SELECT id FROM identity.users WHERE phone_hash = 'nonexistent_hash' LIMIT 1`,
    );
  });

  bench('look up refresh token by jti (no rows)', async () => {
    await tdb.db.execute(
      sql`SELECT user_id, family FROM identity.refresh_tokens WHERE jti = gen_random_uuid() LIMIT 1`,
    );
  });
});
