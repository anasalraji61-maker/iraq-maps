import type { OtpSender } from '@iraq-maps/contracts';
import type { IdentityConfig } from './config';
import { randomCode } from './crypto';

export interface OtpDelivery {
  sender: OtpSender;
  makeCode: () => string;
}

const consoleSender: OtpSender = {
  kind: 'console',
  async send({ code }) {
    // The phone is deliberately not printed.
    console.info(`[identity] development OTP code: ${code}`);
  },
};

/**
 * An injected sender (tests) wins; otherwise OTP_SENDER picks one. `console` runs only with APP_ENV=development and
 * `fixed` only with APP_ENV=e2e. Production accepts nothing but an `sms` sender, which awaits a provider (MOCKS.md).
 */
export function otpDelivery(config: Pick<IdentityConfig, 'appEnv' | 'OTP_SENDER' | 'OTP_FIXED_CODE'>, injected?: OtpSender): OtpDelivery {
  const { appEnv, OTP_SENDER: kind, OTP_FIXED_CODE: fixedCode } = config;
  if (injected) {
    if (appEnv === 'production' && injected.kind !== 'sms') throw new Error(`identity: the '${injected.kind}' OTP sender is not allowed in production`);
    return { sender: injected, makeCode: randomCode };
  }
  if (kind === 'console' && appEnv === 'development') return { sender: consoleSender, makeCode: randomCode };
  if (kind === 'fixed' && appEnv === 'e2e' && fixedCode) return { sender: { kind: 'fixed', send: async () => {} }, makeCode: () => fixedCode };
  throw new Error(
    'identity: OTP_SENDER must be console (APP_ENV=development) or fixed with OTP_FIXED_CODE (APP_ENV=e2e); ' +
      'fake is injected by tests, and sms has no provider yet (docs/milestones/MOCKS.md)',
  );
}
