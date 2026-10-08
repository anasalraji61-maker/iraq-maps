import { randomUUID } from 'node:crypto';
import type { AuthPrincipal, Clock, TokenPair, UserId } from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import type { Logger } from '@iraq-maps/observability';
import { and, eq, isNull } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { sessions, users } from './schema';

const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 3_600_000;

interface Claims {
  sub: UserId;
  sid: string;
  gen: number;
}
type Audience = 'access' | 'refresh';

/**
 * A session is a refresh-token family. Refresh tokens are JWTs carrying the session id and a generation; only the
 * current generation rotates. A validly signed older one is a reuse and revokes the family. Access tokens carry the
 * session id, so revoking a session (logout, reuse, account deletion) also rejects its access tokens.
 * The two kinds have separate secrets and a checked `aud`, so neither is accepted as the other.
 */
export class Sessions {
  private readonly keys: Record<Audience, Uint8Array>;

  constructor(
    private readonly db: Db,
    secrets: { JWT_ACCESS_SECRET: string; JWT_REFRESH_SECRET: string },
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {
    const encode = (secret: string) => new TextEncoder().encode(secret);
    this.keys = { access: encode(secrets.JWT_ACCESS_SECRET), refresh: encode(secrets.JWT_REFRESH_SECRET) };
  }

  async start(userId: UserId): Promise<TokenPair> {
    const id = randomUUID();
    await this.db.insert(sessions).values({ id, userId, generation: 0 });
    return this.tokens({ sub: userId, sid: id, gen: 0 });
  }

  async rotate(refreshToken: string): Promise<TokenPair | null> {
    const claims = await this.read(refreshToken, 'refresh');
    if (!claims) return null;
    const { sid, gen } = claims;
    const [current] = await this.db
      .update(sessions)
      .set({ generation: gen + 1 })
      .where(and(eq(sessions.id, sid), eq(sessions.generation, gen), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (current) return this.tokens({ ...claims, gen: gen + 1 });
    if (await this.revoke(sid)) this.log.warn({ sessionId: sid, userId: claims.sub }, 'refresh token reuse: session revoked');
    return null;
  }

  async logout(refreshToken: string): Promise<void> {
    const claims = await this.read(refreshToken, 'refresh');
    if (claims) await this.revoke(claims.sid);
  }

  async verify(accessToken: string): Promise<AuthPrincipal | null> {
    const claims = await this.read(accessToken, 'access');
    if (!claims) return null;
    const [live] = await this.db
      .select({ roles: users.roles })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, claims.sid), isNull(sessions.revokedAt)));
    return live ? { userId: claims.sub, roles: live.roles } : null;
  }

  private async revoke(id: string): Promise<boolean> {
    const revoked = await this.db
      .update(sessions)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length > 0;
  }

  private async tokens({ sub, sid, gen }: Claims): Promise<TokenPair> {
    const now = this.clock.now();
    const sign = (claims: object, audience: Audience, ttlMs: number) =>
      new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setAudience(audience)
        .setIssuedAt(now)
        .setExpirationTime(new Date(now.getTime() + ttlMs))
        .sign(this.keys[audience]);
    return {
      accessToken: await sign({ sid }, 'access', ACCESS_TTL_MS),
      refreshToken: await sign({ sid, gen }, 'refresh', REFRESH_TTL_MS),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_MS).toISOString(),
    };
  }

  private async read(token: string, audience: Audience): Promise<Claims | null> {
    try {
      const { payload } = await jwtVerify(token, this.keys[audience], { algorithms: ['HS256'], audience, currentDate: this.clock.now() });
      return payload as unknown as Claims;
    } catch {
      return null;
    }
  }
}
