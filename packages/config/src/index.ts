import type { z } from 'zod';

export type AppEnv = 'development' | 'test' | 'e2e' | 'production';

export interface ModuleConfigOptions<S extends z.ZodRawShape> {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Values that must never be used when APP_ENV=production, e.g. { OTP_SENDER: ['fake', 'fixed', 'console'] }. */
  productionForbidden?: Partial<Record<keyof S, readonly string[]>>;
}

/**
 * Validates one module's env vars with zod. Throws at boot listing the missing/invalid variable NAMES only;
 * never prints a value. `appEnv` comes from APP_ENV (default 'development').
 */
export function defineModuleConfig<S extends z.ZodRawShape>(
  _module: string,
  _shape: S,
  _options?: ModuleConfigOptions<S>,
): z.infer<z.ZodObject<S>> & { appEnv: AppEnv } {
  throw new Error('not implemented');
}
