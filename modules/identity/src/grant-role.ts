import { defineModuleConfig } from '@iraq-maps/config';
import { Role } from '@iraq-maps/contracts';
import { createDb } from '@iraq-maps/db-kit';
import { z } from 'zod';
import { phoneHashKey } from './config';
import { grantRole } from './users';

// Usage: DATABASE_URL=... PHONE_HASH_KEY=... pnpm --filter @iraq-maps/identity grant-role <userId|+9647xxxxxxxxx> <role>
const [who, role] = process.argv.slice(2).filter((arg) => arg !== '--');
const parsedRole = Role.safeParse(role);
if (!who || !parsedRole.success) {
  console.error(`usage: grant-role <userId|+9647xxxxxxxxx> <${Role.options.join('|')}>`);
  process.exit(2);
}

const config = defineModuleConfig('identity', { DATABASE_URL: z.string(), PHONE_HASH_KEY: phoneHashKey });
const { db, close } = createDb(config.DATABASE_URL);
try {
  const granted = await grantRole(db, config.PHONE_HASH_KEY, who, parsedRole.data);
  console.info(granted ? `granted ${parsedRole.data}` : 'no such user');
  process.exitCode = granted ? 0 : 1;
} finally {
  await close();
}
