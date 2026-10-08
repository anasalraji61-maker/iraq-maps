import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineModuleConfig } from './index';

const SECRET = 'super-secret-value-that-must-not-leak';
const shape = {
  JWT_SECRET: z.string().min(64),
  API_PORT: z.coerce.number().int().default(3000),
  OTP_SENDER: z.enum(['sms', 'console', 'fixed', 'fake']),
};
const productionForbidden = { OTP_SENDER: ['fake', 'fixed', 'console'] } as const;
const load = (env: Record<string, string | undefined>) => defineModuleConfig('identity', shape, { env, productionForbidden });
const errorOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected a throw');
};

describe('defineModuleConfig', () => {
  it('parses and coerces values and returns appEnv', () => {
    const cfg = load({ JWT_SECRET: 'x'.repeat(64), API_PORT: '8080', OTP_SENDER: 'console', APP_ENV: 'development' });
    expect(cfg).toEqual({ JWT_SECRET: 'x'.repeat(64), API_PORT: 8080, OTP_SENDER: 'console', appEnv: 'development' });
  });

  it('treats empty strings as unset, so defaults apply', () => {
    expect(load({ JWT_SECRET: 'x'.repeat(64), API_PORT: '', OTP_SENDER: 'fake', APP_ENV: 'test' })).toMatchObject({ API_PORT: 3000, appEnv: 'test' });
  });

  it('requires APP_ENV: unset or empty fails boot even when NODE_ENV=production, so a test sender never runs by default', () => {
    for (const APP_ENV of [undefined, '']) {
      const message = errorOf(() => load({ JWT_SECRET: 'x'.repeat(64), OTP_SENDER: 'console', NODE_ENV: 'production', APP_ENV }));
      expect(message).toBe('identity config: missing or invalid env vars: APP_ENV');
    }
  });

  it('fails boot naming every missing or invalid variable, never its value', () => {
    const message = errorOf(() => load({ JWT_SECRET: SECRET, APP_ENV: 'staging-secret-env' }));
    expect(message).toContain('identity');
    expect(message).toMatch(/JWT_SECRET/);
    expect(message).toMatch(/OTP_SENDER/);
    expect(message).toMatch(/APP_ENV/);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain('staging-secret-env');
  });

  it('rejects test-only values in production without printing them', () => {
    for (const sender of ['fake', 'fixed', 'console']) {
      const message = errorOf(() => load({ JWT_SECRET: 'y'.repeat(64), OTP_SENDER: sender, APP_ENV: 'production' }));
      expect(message).toMatch(/production.*OTP_SENDER/);
      expect(message).not.toContain(sender);
      expect(message).not.toContain('y'.repeat(64));
    }
  });

  it('allows those values outside production and real ones in production', () => {
    expect(load({ JWT_SECRET: 'z'.repeat(64), OTP_SENDER: 'fixed', APP_ENV: 'e2e' }).appEnv).toBe('e2e');
    expect(load({ JWT_SECRET: 'z'.repeat(64), OTP_SENDER: 'sms', APP_ENV: 'production' })).toMatchObject({ OTP_SENDER: 'sms', appEnv: 'production' });
  });

  it('reads process.env by default', () => {
    Object.assign(process.env, { CONFIG_TEST_VAR: 'from-process', APP_ENV: 'test' });
    expect(defineModuleConfig('test', { CONFIG_TEST_VAR: z.string() })).toEqual({ CONFIG_TEST_VAR: 'from-process', appEnv: 'test' });
    delete process.env.CONFIG_TEST_VAR;
    delete process.env.APP_ENV;
  });
});
