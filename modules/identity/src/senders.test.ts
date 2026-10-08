import type { IraqiPhone } from '@iraq-maps/contracts';
import { FakeOtpSender, identityTestEnv, otpSenderConformance } from '@iraq-maps/testing';
import { describe, expect, it, vi } from 'vitest';
import { identityConfig } from './config';
import { otpDelivery } from './senders';

type Selection = Parameters<typeof otpDelivery>[0];
const env = { ...identityTestEnv(), APP_ENV: 'production' };

otpSenderConformance('console (development)', () => otpDelivery({ appEnv: 'development', OTP_SENDER: 'console' }).sender);
otpSenderConformance('fixed (e2e)', () => otpDelivery({ appEnv: 'e2e', OTP_SENDER: 'fixed', OTP_FIXED_CODE: '246810' }).sender);

describe('OTP sender selection and config', () => {
  it('console prints the code but never the phone', async () => {
    const print = vi.spyOn(console, 'info').mockImplementation(() => {});
    await otpDelivery({ appEnv: 'development', OTP_SENDER: 'console' }).sender.send({ phone: '+9647701234567' as IraqiPhone, code: '135790', locale: 'ar' });
    expect(print.mock.calls.flat().join(' ')).toContain('135790');
    expect(print.mock.calls.flat().join(' ')).not.toMatch(/7701234567/);
    print.mockRestore();
  });

  it('fixed issues OTP_FIXED_CODE; other senders issue random 6-digit codes', () => {
    expect(otpDelivery({ appEnv: 'e2e', OTP_SENDER: 'fixed', OTP_FIXED_CODE: '246810' }).makeCode()).toBe('246810');
    expect(otpDelivery({ appEnv: 'test' }, new FakeOtpSender()).makeCode()).toMatch(/^\d{6}$/);
  });

  it('refuses console outside development, fixed outside e2e or without a code, env fake, sms and no sender', () => {
    const refused: Selection[] = [
      { appEnv: 'test', OTP_SENDER: 'console' },
      { appEnv: 'e2e', OTP_SENDER: 'console' },
      { appEnv: 'development', OTP_SENDER: 'fixed', OTP_FIXED_CODE: '246810' },
      { appEnv: 'e2e', OTP_SENDER: 'fixed' },
      { appEnv: 'test', OTP_SENDER: 'fake' },
      { appEnv: 'development', OTP_SENDER: 'sms' },
      { appEnv: 'development' },
    ];
    for (const selection of refused) expect(() => otpDelivery(selection)).toThrow(/OTP_SENDER/);
  });

  it('production refuses every test sender, from OTP_SENDER or injected', () => {
    for (const sender of ['fake', 'fixed', 'console']) {
      expect(() => identityConfig({ ...env, OTP_SENDER: sender, OTP_FIXED_CODE: '246810' })).toThrow(/not allowed in production.*OTP_SENDER/);
    }
    expect(() => otpDelivery({ appEnv: 'production' }, new FakeOtpSender())).toThrow(/not allowed in production/);
    expect(identityConfig({ ...env, OTP_SENDER: 'sms' }).PHONE_ENCRYPTION_KEY).toHaveLength(32);
  });

  it('refuses equal JWT secrets at boot, naming the variables only', () => {
    expect(() => identityConfig({ ...env, APP_ENV: 'test', JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET })).toThrow(
      /^identity config: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ$/,
    );
  });
});
