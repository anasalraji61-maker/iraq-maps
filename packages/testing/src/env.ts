import { randomBytes, randomInt } from 'node:crypto';
import type { IraqiPhone } from '@iraq-maps/contracts';

// Fresh phones and client IPs per test keep the shared Redis rate-limit counters from leaking between tests and runs.
export const randomPhone = () => `+9647${randomInt(1e9).toString().padStart(9, '0')}` as IraqiPhone;
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(256)}`;

const key = () => randomBytes(32).toString('base64');

/** APP_ENV=test and fresh identity secrets (each a base64 32-byte key, which satisfies every identity rule). */
export const identityTestEnv = () => ({
  APP_ENV: 'test',
  JWT_ACCESS_SECRET: key(),
  JWT_REFRESH_SECRET: key(),
  PHONE_ENCRYPTION_KEY: key(),
  PHONE_HASH_KEY: key(),
});
