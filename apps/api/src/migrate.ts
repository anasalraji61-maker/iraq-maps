import { defineModuleConfig } from '@iraq-maps/config';
import { ensureExtensions, platformMigrationsDir, runModuleMigrations } from '@iraq-maps/db-kit';
import { z } from 'zod';
import { moduleMigrations } from './app';

// Ensures postgis and pg_trgm, then applies the platform (outbox) migrations and every module's, to DATABASE_URL.
// Idempotent. A database without the extensions needs a superuser here, or an admin who provisioned them.
const { DATABASE_URL: url } = defineModuleConfig('migrate', { DATABASE_URL: z.string().url() });
await ensureExtensions(url);
for (const m of [{ schema: 'platform', migrationsDir: platformMigrationsDir }, ...moduleMigrations]) {
  await runModuleMigrations({ url, ...m });
}
