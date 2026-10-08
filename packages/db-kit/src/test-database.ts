import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createDb, withClient, type Db } from './db';
import { platformMigrationsDir, runModuleMigrations } from './migrations';

export interface TestDatabase {
  url: string;
  db: Db;
  drop(): Promise<void>;
}

const TEMPLATE = 'iraqmaps_template';
const LOCAL_ADMIN_URL = 'postgres://iraqmaps:iraqmaps@localhost:5432/iraqmaps'; // `pnpm infra:local up` dev defaults

const withDatabase = (url: string, database: string) => Object.assign(new URL(url), { pathname: `/${database}` }).toString();

/**
 * Normally created by `pnpm infra:local up`; created here when missing, which needs a superuser (e.g. a CI service container).
 * UTF8 + C.UTF-8 everywhere, so Arabic trigram matching and text ordering are identical locally and in CI.
 */
async function createTemplate(admin: pg.Client, adminUrl: string): Promise<void> {
  await admin.query(`CREATE DATABASE ${TEMPLATE} ENCODING 'UTF8' LOCALE 'C.UTF-8' TEMPLATE template0`);
  try {
    await withClient(withDatabase(adminUrl, TEMPLATE), (c) => c.query('CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pg_trgm'));
    await admin.query(`ALTER DATABASE ${TEMPLATE} IS_TEMPLATE true`);
  } catch (error) {
    await admin.query(`DROP DATABASE ${TEMPLATE}`);
    throw new Error(`cannot create ${TEMPLATE} with postgis and pg_trgm: run \`pnpm infra:local up\` or use a superuser admin URL`, { cause: error });
  }
}

/**
 * Clones an isolated database from a template with postgis + pg_trgm on the local PostgreSQL 16 (no Testcontainers),
 * then applies the `platform` migrations (outbox) and the given modules' migrations.
 * Admin connection: TEST_DATABASE_ADMIN_URL, else DATABASE_URL, else the `pnpm infra:local up` defaults.
 */
export async function createTestDatabase(opts: { modules?: { schema: string; migrationsDir: string }[] } = {}): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL || process.env.DATABASE_URL || LOCAL_ADMIN_URL;
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  await withClient(adminUrl, async (admin) => {
    // Serializes template creation and cloning: CREATE DATABASE fails while another session is connected to the template.
    await admin.query('SELECT pg_advisory_lock(hashtext($1))', [TEMPLATE]);
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEMPLATE]);
    if (!rowCount) await createTemplate(admin, adminUrl);
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE}`);
  });
  const url = withDatabase(adminUrl, name);
  for (const module of [{ schema: 'platform', migrationsDir: platformMigrationsDir }, ...(opts.modules ?? [])]) {
    await runModuleMigrations({ url, ...module });
  }
  const { db, close } = createDb(url);
  return {
    url,
    db,
    async drop() {
      await close();
      await withClient(adminUrl, (admin) => admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}
