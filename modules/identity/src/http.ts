import { authContract, meContract, type Locale } from '@iraq-maps/contracts';
import { Controller, Headers, Inject, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { mac } from './crypto';
import { RESEND_AFTER_SEC, type Otp } from './otp';
import type { Sessions } from './sessions';
import { toMe, type Profile, type Users } from './users';

export const INTERNALS = Symbol('identity internals');
export interface Internals {
  otp: Otp;
  sessions: Sessions;
  users: Users;
  phoneHashKey: string;
}

const problem = <S extends number>(status: S, code: string, title: string) => ({ status, body: { type: 'about:blank', title, status, code } });
const unauthorized = problem(401, 'unauthorized', 'Missing, invalid or revoked access token');

@Controller()
export class AuthController {
  constructor(@Inject(INTERNALS) private readonly internals: Internals) {}

  @TsRestHandler(authContract)
  handle(@Req() req: { ip: string }) {
    const { otp, sessions, users, phoneHashKey } = this.internals;
    const challenge = (phone: string) => `login:${mac(phoneHashKey, phone)}`;
    return tsRestHandler(authContract, {
      requestOtp: async ({ body }) => {
        const expiresAt = await otp.issue(challenge(body.phone), body, body.locale, req.ip);
        if (!expiresAt) return problem(429, 'otp_rate_limited', 'Too many code requests, try again later');
        return { status: 202, body: { expiresAt: expiresAt.toISOString(), resendAfterSec: RESEND_AFTER_SEC } };
      },
      verifyOtp: async ({ body }) => {
        const result = await otp.check(challenge(body.phone), body.code);
        if (result.status === 'too_many_attempts') return problem(429, 'otp_too_many_attempts', 'Too many wrong codes, request a new one');
        if (result.status !== 'ok') return problem(401, `otp_${result.status}`, 'Wrong or expired code');
        const { user, isNewUser } = await users.login(body.phone, result.data as Locale);
        return { status: 200, body: { ...(await sessions.start(user.id)), user: toMe(user), isNewUser } };
      },
      refresh: async ({ body }) => {
        const tokens = await sessions.rotate(body.refreshToken);
        return tokens ? { status: 200, body: tokens } : problem(401, 'refresh_invalid', 'Invalid or revoked refresh token');
      },
      logout: async ({ body }) => {
        await sessions.logout(body.refreshToken);
        return { status: 204, body: undefined };
      },
    });
  }
}

@Controller()
export class MeController {
  constructor(@Inject(INTERNALS) private readonly internals: Internals) {}

  @TsRestHandler(meContract)
  async handle(@Headers('authorization') authorization = '') {
    const { sessions, users } = this.internals;
    const principal = await sessions.verify(authorization.replace(/^Bearer /i, ''));
    const me = (user: Profile | null) => (user ? { status: 200 as const, body: toMe(user) } : unauthorized);
    return tsRestHandler(meContract, {
      get: async () => (principal ? me(await users.get(principal.userId)) : unauthorized),
      update: async ({ body }) => (principal ? me(await users.update(principal.userId, body)) : unauthorized),
      remove: async () => {
        if (!principal) return unauthorized;
        await users.remove(principal.userId);
        return { status: 204, body: undefined };
      },
    });
  }
}
