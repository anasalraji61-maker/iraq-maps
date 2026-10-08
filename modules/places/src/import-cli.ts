import { parseArgs } from 'node:util';
import { defineModuleConfig } from '@iraq-maps/config';
import { createDb, runModuleMigrations } from '@iraq-maps/db-kit';
import { z } from 'zod';
import { importFiles } from './import';
import { placesMigrationsDir } from './index';

// Usage (CliContracts.placesImport): APP_ENV=... DATABASE_URL=... pnpm --filter @iraq-maps/places run import --city /abs/city.json --input /abs/places.ndjson
const { values } = parseArgs({ args: process.argv.slice(2).filter((arg) => arg !== '--'), options: { city: { type: 'string' }, input: { type: 'string' } } });
if (!values.city || !values.input) {
  console.error('usage: import --city <city.json> --input <places.ndjson>');
  process.exit(2);
}

const { DATABASE_URL: url } = defineModuleConfig('places', { DATABASE_URL: z.string() });
await runModuleMigrations({ url, schema: 'places', migrationsDir: placesMigrationsDir });
const { db, close } = createDb(url);
try {
  console.info(JSON.stringify(await importFiles(db, { city: values.city, input: values.input })));
} finally {
  await close();
}
