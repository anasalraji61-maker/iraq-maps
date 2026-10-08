import { randomUUID } from 'node:crypto';
import type { Clock, IraqiPhone, Locale, PhoneVerificationPort } from '@iraq-maps/contracts';
import type { Logger } from '@iraq-maps/observability';
import type { Redis } from 'ioredis';
import { decrypt, encrypt, mac } from './crypto';
import type { OtpDelivery } from './senders';

const CODE_TTL_SEC = 5 * 60;
const MAX_ATTEMPTS = 5;
const WINDOW_SEC = 15 * 60;
const MAX_PER_PHONE = 5;
/** Higher than per phone: Iraqi carriers put many subscribers behind one CGNAT address. */
const MAX_PER_IP = 20;
export const RESEND_AFTER_SEC = 60;

export type OtpCheck = { status: 'ok'; data: string } | { status: 'invalid' | 'expired' | 'too_many_attempts' };

// Atomic: a match consumes the code; every miss is counted and the MAX_ATTEMPTS-th miss deletes the code.
const CHECK = `
local h = redis.call('HMGET', KEYS[1], 'code', 'data')
if not h[1] then return {'expired'} end
if h[1] == ARGV[1] then redis.call('DEL', KEYS[1]) return {'ok', h[2]} end
if redis.call('HINCRBY', KEYS[1], 'attempts', 1) >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) return {'too_many_attempts'} end
return {'invalid'}`;

/** One-time codes in Redis, stored as a keyed hash. `challenge` names what the code proves (a login, a verification). */
export class Otp {
  constructor(
    private readonly redis: Redis,
    private readonly delivery: OtpDelivery,
    private readonly hashKey: string,
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {}

  /** Sends a fresh code (replacing any previous one for `challenge`) and returns its expiry, or null when rate-limited. */
  async issue(challenge: string, to: { phone: IraqiPhone; locale: Locale }, data: string, ip?: string): Promise<Date | null> {
    const limits: [string, string, number][] = [['phone', mac(this.hashKey, to.phone), MAX_PER_PHONE]];
    if (ip) limits.push(['ip', ip, MAX_PER_IP]);
    for (const [scope, id, max] of limits) {
      const key = `identity:otp-rate:${scope}:${id}`;
      const [[, count] = []] = (await this.redis.multi().incr(key).expire(key, WINDOW_SEC, 'NX').exec()) ?? [];
      if (Number(count) > max) {
        this.log.warn({ scope }, 'otp rate limit hit');
        return null;
      }
    }
    const code = this.delivery.makeCode();
    const key = this.key(challenge);
    await this.redis.multi().hset(key, { code: mac(this.hashKey, `${key}:${code}`), data, attempts: 0 }).expire(key, CODE_TTL_SEC).exec();
    await this.delivery.sender.send({ ...to, code });
    return new Date(this.clock.now().getTime() + CODE_TTL_SEC * 1000);
  }

  async check(challenge: string, code: string): Promise<OtpCheck> {
    const key = this.key(challenge);
    const [status, data] = (await this.redis.eval(CHECK, 1, key, mac(this.hashKey, `${key}:${code}`), MAX_ATTEMPTS)) as [OtpCheck['status'], string];
    return status === 'ok' ? { status, data } : { status };
  }

  private key = (challenge: string) => `identity:otp:${challenge}`;
}

/** PhoneVerificationPort over the same codes; the phone waits in Redis encrypted. Throws 'otp_rate_limited' when limited. */
export function phoneVerification(otp: Otp, encryptionKey: Buffer): PhoneVerificationPort {
  return {
    async start({ phone, locale }) {
      const verificationId = randomUUID();
      const expiresAt = await otp.issue(`verify:${verificationId}`, { phone, locale }, encrypt(encryptionKey, phone));
      if (!expiresAt) throw new Error('otp_rate_limited');
      return { verificationId, expiresAt };
    },
    async confirm({ verificationId, code }) {
      const result = await otp.check(`verify:${verificationId}`, code);
      return result.status === 'ok'
        ? { verified: true, phone: decrypt(encryptionKey, result.data) as IraqiPhone }
        : { verified: false, reason: result.status };
    },
  };
}
