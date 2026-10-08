import { randomUUID } from 'node:crypto';
import type { Clock, IraqiPhone, Locale, PhoneVerificationPort } from '@iraq-maps/contracts';
import type { Logger } from '@iraq-maps/observability';
import type { Redis } from 'ioredis';
import ipaddr from 'ipaddr.js';
import { decrypt, encrypt, mac } from './crypto';
import type { OtpDelivery } from './senders';

const CODE_TTL_SEC = 5 * 60;
const WINDOW_SEC = 15 * 60;
const DAY_SEC = 24 * 3600;
export const RESEND_AFTER_SEC = 60;
/** Wrong codes allowed per code, and per phone across codes in 24h before the phone is locked. */
const MAX_ATTEMPTS = 5;
const MAX_FAILURES_PER_DAY = 10;
/** Codes issued per phone (15 min, 24h) and per client network (15 min; higher because Iraqi carriers use CGNAT). */
const MAX_PER_PHONE = 5;
const MAX_PER_PHONE_DAY = 10;
const MAX_PER_IP = 20;

export type OtpRefusal = 'locked' | 'resend_too_soon' | 'rate_limited';
export type OtpCheck = { status: 'ok'; data: string } | { status: 'invalid' | 'expired' | 'too_many_attempts' | 'locked' };

const failKey = (phoneHash: string) => `identity:otp-fail:${phoneHash}`;

// Atomic: a match consumes the code. Every miss counts against the code and against the phone's 24h failure budget
// (ARGV[5] is the failure-key prefix, completed with the phone hash stored in the code's record).
const CHECK = `
local h = redis.call('HMGET', KEYS[1], 'code', 'data', 'phone')
if not h[1] then return {'expired'} end
local fails = ARGV[5] .. h[3]
if tonumber(redis.call('GET', fails) or '0') >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1]) return {'locked'} end
if h[1] == ARGV[1] then redis.call('DEL', KEYS[1]) return {'ok', h[2]} end
local failed = redis.call('INCR', fails)
if failed == 1 then redis.call('EXPIRE', fails, ARGV[4]) end
if failed >= tonumber(ARGV[3]) then redis.call('DEL', KEYS[1]) return {'locked'} end
if redis.call('HINCRBY', KEYS[1], 'attempts', 1) >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) return {'too_many_attempts'} end
return {'invalid'}`;

/** Rate-limit bucket: one IPv4 address (IPv4-mapped IPv6 included), or one IPv6 /64, which a single client can rotate through. */
export function ipBucket(ip: string): string {
  const addr = ipaddr.process(ip);
  return addr instanceof ipaddr.IPv6 ? `${addr.parts.slice(0, 4).map((part) => part.toString(16)).join(':')}::/64` : addr.toString();
}

/** One-time codes in Redis, stored as a keyed hash. `challenge` names what the code proves (a login, a verification). */
export class Otp {
  constructor(
    private readonly redis: Redis,
    private readonly delivery: OtpDelivery,
    private readonly hashKey: string,
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {}

  /** Sends a fresh code (replacing any previous one for `challenge`) and returns its expiry, or why it was refused. */
  async issue(challenge: string, to: { phone: IraqiPhone; locale: Locale }, data: string, ip?: string): Promise<Date | OtpRefusal> {
    const phone = mac(this.hashKey, to.phone);
    const refusal = await this.refusal(phone, ip);
    if (refusal) {
      this.log.warn({ refusal }, 'otp request refused');
      return refusal;
    }
    const code = this.delivery.makeCode();
    const key = this.key(challenge);
    await this.redis.multi().hset(key, { code: mac(this.hashKey, `${key}:${code}`), data, phone, attempts: 0 }).expire(key, CODE_TTL_SEC).exec();
    await this.delivery.sender.send({ ...to, code });
    return new Date(this.clock.now().getTime() + CODE_TTL_SEC * 1000);
  }

  async check(challenge: string, code: string): Promise<OtpCheck> {
    const key = this.key(challenge);
    const args = [mac(this.hashKey, `${key}:${code}`), MAX_ATTEMPTS, MAX_FAILURES_PER_DAY, DAY_SEC, failKey('')];
    const [status, data] = (await this.redis.eval(CHECK, 1, key, ...args)) as [OtpCheck['status'], string];
    return status === 'ok' ? { status, data } : { status };
  }

  private async refusal(phone: string, ip?: string): Promise<OtpRefusal | null> {
    if (Number(await this.redis.get(failKey(phone))) >= MAX_FAILURES_PER_DAY) return 'locked';
    if (!(await this.redis.set(`identity:otp-resend:${phone}`, 1, 'EX', RESEND_AFTER_SEC, 'NX'))) return 'resend_too_soon';
    const counters: [string, number, number][] = [
      [`phone:${phone}`, MAX_PER_PHONE, WINDOW_SEC],
      [`phone-day:${phone}`, MAX_PER_PHONE_DAY, DAY_SEC],
    ];
    if (ip) counters.push([`ip:${ipBucket(ip)}`, MAX_PER_IP, WINDOW_SEC]);
    for (const [id, max, windowSec] of counters) {
      const key = `identity:otp-rate:${id}`;
      const [[, count] = []] = (await this.redis.multi().incr(key).expire(key, windowSec, 'NX').exec()) ?? [];
      if (Number(count) > max) return 'rate_limited';
    }
    return null;
  }

  private key = (challenge: string) => `identity:otp:${challenge}`;
}

/** PhoneVerificationPort over the same codes; the phone waits in Redis encrypted. `start` throws `otp_<refusal>` when refused. */
export function phoneVerification(otp: Otp, encryptionKey: Buffer): PhoneVerificationPort {
  return {
    async start({ phone, locale }) {
      const verificationId = randomUUID();
      const expiresAt = await otp.issue(`verify:${verificationId}`, { phone, locale }, encrypt(encryptionKey, phone));
      if (!(expiresAt instanceof Date)) throw new Error(`otp_${expiresAt}`);
      return { verificationId, expiresAt };
    },
    async confirm({ verificationId, code }) {
      const result = await otp.check(`verify:${verificationId}`, code);
      return result.status === 'ok'
        ? { verified: true, phone: decrypt(encryptionKey, result.data) as IraqiPhone }
        : { verified: false, reason: result.status === 'locked' ? 'too_many_attempts' : result.status };
    },
  };
}
