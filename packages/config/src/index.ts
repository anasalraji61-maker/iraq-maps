import { z } from 'zod';

export type AppEnv = 'development' | 'test' | 'e2e' | 'production';

export interface ModuleConfigOptions<S extends z.ZodRawShape> {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Values that must never be used when APP_ENV=production, e.g. { OTP_SENDER: ['fake', 'fixed', 'console'] }. */
  productionForbidden?: Partial<Record<keyof S, readonly string[]>>;
}

const AppEnvSchema = z.enum(['development', 'test', 'e2e', 'production']);

/**
 * Validates one module's env vars with zod. Throws at boot listing the missing/invalid variable NAMES only;
 * never prints a value. `appEnv` comes from APP_ENV, which is required: there is no default, so a deployment that forgets it
 * fails at boot instead of running as development. Empty strings count as unset.
 */
export function defineModuleConfig<S extends z.ZodRawShape>(
  module: string,
  shape: S,
  options: ModuleConfigOptions<S> = {},
): z.infer<z.ZodObject<S>> & { appEnv: AppEnv } {
  const env = Object.fromEntries(Object.entries(options.env ?? process.env).filter(([, v]) => v !== ''));
  const parsed = z.object({ ...shape, APP_ENV: AppEnvSchema }).safeParse(env);
  // Only issue paths (variable names) are reported: zod messages and `cause` can echo the received value.
  if (!parsed.success) throw new Error(`${module} config: missing or invalid env vars: ${names(parsed.error.issues.map((i) => i.path[0]))}`);
  const { APP_ENV: appEnv, ...values } = parsed.data as Record<string, unknown> & { APP_ENV: AppEnv };
  if (appEnv === 'production') {
    const forbidden = Object.entries(options.productionForbidden ?? {}) as [string, readonly unknown[]][];
    const used = forbidden.filter(([key, banned]) => banned.includes(values[key])).map(([key]) => key);
    if (used.length) throw new Error(`${module} config: values not allowed in production for env vars: ${names(used)}`);
  }
  return { ...values, appEnv } as z.infer<z.ZodObject<S>> & { appEnv: AppEnv };
}

const names = (keys: unknown[]) => [...new Set(keys.map(String))].join(', ');
