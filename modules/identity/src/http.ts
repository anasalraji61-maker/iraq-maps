import { authContract, meContract, PortTokens, type AuthPrincipal, type IdentityPort, type Locale } from '@iraq-maps/contracts';
import { Controller, HttpException, Inject, Injectable, Req, type CanActivate, type ExecutionContext } from '@nestjs/common';
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

/** What IdentityAuthGuard leaves on every request it lets through to a protected route. */
export interface AuthenticatedRequest {
  principal: AuthPrincipal;
}

const PUBLIC_ROUTE = /^\/(health$|v1\/auth\/)/;

/**
 * The one auth check: bind it as APP_GUARD. Every route needs a valid, unrevoked access token except /health and
 * /v1/auth/*; it sets `req.principal` or answers the 401 Problem. Public routes are matched on the registered route
 * pattern, so the query string and URL spelling do not matter.
 */
@Injectable()
export class IdentityAuthGuard implements CanActivate {
  constructor(@Inject(PortTokens.IdentityPort) private readonly identity: IdentityPort) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ routeOptions: { url?: string }; headers: { authorization?: string } } & Partial<AuthenticatedRequest>>();
    if (PUBLIC_ROUTE.test(req.routeOptions.url ?? '')) return true;
    const principal = await this.identity.verifyAccessToken((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
    if (!principal) throw new HttpException(unauthorized.body, 401);
    req.principal = principal;
    return true;
  }
}

@Controller()
export class AuthController {
  constructor(@Inject(INTERNALS) private readonly internals: Internals) {}

  @TsRestHandler(authContract)
  handle(@Req() req: { ip: string }) {
    const { otp, sessions, users, phoneHashKey } = this.internals;
    const challenge = (phone: string) => `login:${mac(phoneHashKey, phone)}`;
    return tsRestHandler(authContract, {
      requestOtp: async ({ body }) => {
        const issued = await otp.issue(challenge(body.phone), body, body.locale, req.ip);
        if (!(issued instanceof Date)) return problem(429, `otp_${issued}`, 'Code request refused, try again later');
        return { status: 202, body: { expiresAt: issued.toISOString(), resendAfterSec: RESEND_AFTER_SEC } };
      },
      verifyOtp: async ({ body }) => {
        const result = await otp.check(challenge(body.phone), body.code);
        if (result.status === 'too_many_attempts' || result.status === 'locked') return problem(429, `otp_${result.status}`, 'Too many wrong codes');
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

  /** Authenticated by IdentityAuthGuard; a user deleted since then gets the same 401. */
  @TsRestHandler(meContract)
  handle(@Req() { principal: { userId } }: AuthenticatedRequest) {
    const { users } = this.internals;
    const me = (user: Profile | null) => (user ? { status: 200 as const, body: toMe(user) } : unauthorized);
    return tsRestHandler(meContract, {
      get: async () => me(await users.get(userId)),
      update: async ({ body }) => me(await users.update(userId, body)),
      remove: async () => {
        await users.remove(userId);
        return { status: 204, body: undefined };
      },
    });
  }
}
