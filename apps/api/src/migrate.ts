import { defineModuleConfig } from '@iraq-maps/config';
import { platformMigrationsDir, runModuleMigrations } from '@iraq-maps/db-kit';
import { z } from 'zod';
import { moduleMigrations } from './app';

// Applies the platform (outbox) migrations, then every module's, to DATABASE_URL. Idempotent.
const { DATABASE_URL: url } = defineModuleConfig('migrate', { DATABASE_URL: z.string().url() });
for (const m of [{ schema: 'platform', migrationsDir: platformMigrationsDir }, ...moduleMigrations]) {
  await runModuleMigrations({ url, ...m });
}
