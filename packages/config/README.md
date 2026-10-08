# @iraq-maps/config

`defineModuleConfig(module, shape, { env?, productionForbidden? })` validates one module's env vars with a zod shape at boot. It returns the parsed values plus `appEnv`.

- `APP_ENV` is one of `development | test | e2e | production`. The default is `development`.
- Empty strings count as unset, so blank lines copied from `.env.example` fall back to defaults or fail as missing.
- A failure throws one error that lists only the missing or invalid variable **names**. Values are never printed, and no zod error is attached as `cause`.
- When `APP_ENV=production`, any value listed in `productionForbidden` is rejected the same way.

```ts
export const identityConfig = () =>
  defineModuleConfig('identity', {
    OTP_SENDER: z.enum(['sms', 'console', 'fixed', 'fake']),
    JWT_ACCESS_SECRET: z.string().min(32),
  }, { productionForbidden: { OTP_SENDER: ['fake', 'fixed', 'console'] } });
```

**Env:** `APP_ENV`, plus whatever each module's shape declares.
