import { defineModuleConfig } from '@iraq-maps/config';
import { z } from 'zod';

export const phoneHashKey = z.string().min(32);

export function identityConfig(env?: Record<string, string | undefined>) {
  const config = defineModuleConfig(
    'identity',
    {
      JWT_ACCESS_SECRET: z.string().min(32),
      JWT_REFRESH_SECRET: z.string().min(32),
      PHONE_ENCRYPTION_KEY: z
        .string()
        .transform((s) => Buffer.from(s, 'base64'))
        .refine((key) => key.length === 32),
      PHONE_HASH_KEY: phoneHashKey,
      OTP_SENDER: z.enum(['sms', 'console', 'fixed', 'fake']).optional(),
      OTP_FIXED_CODE: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    },
    { env, productionForbidden: { OTP_SENDER: ['fake', 'fixed', 'console'] } },
  );
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) throw new Error('identity config: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  return config;
}

export type IdentityConfig = ReturnType<typeof identityConfig>;
