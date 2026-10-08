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
/** Wrong codes per code, and per phone since its last lock. */
const MAX_ATTEMPTS = 5;
const MAX_FAILURES = 10;
/** Codes per phone and per client network in 15 minutes (the network limit is higher because Iraqi carriers use CGNAT). */
const MAX_PER_PHONE = 5;
const MAX_PER_IP = 20;
/** A phone that trips a limit is locked, escalating within 24h; the owner is back in at most 4 h, never a whole day. */
const LOCK_BACKOFF_SEC = [15 * 60, 3600, 4 * 3600];

export type OtpRefusal = 'locked' | 'resend_too_soon' | 'rate_limited';
export type OtpCheck = { status: 'ok'; data: string } | { status: 'invalid' | 'expired' | 'too_many_attempts' | 'locked' };

// Shared by both scripts. Per-phone keys are derived from the phone hash `p` inside the script (standalone Redis).
// lock(): the next backoff step (the level lives 24h), and a fresh start for the failure and request counters.
const LUA_LOCK = `
local function k(kind, p) return 'identity:otp-' .. kind .. ':' .. p end
local function count(key, ttl) local n = redis.call('INCR', key) if n == 1 then redis.call('EXPIRE', key, ttl) end return n end
local backoff = {${LOCK_BACKOFF_SEC.join(', ')}}
local function lock(p)
  local level = count(k('locks', p), ${DAY_SEC})
  redis.call('SET', k('lock', p), 1, 'EX', backoff[math.min(level, #backoff)])
  redis.call('DEL', k('fail', p), k('rate', p))
end`;

// ARGV: phone hash, client network ('' when unknown). Returns 'ok' or the refusal. The network is checked first, so a
// request it refuses never touches the phone's state: one network cannot lock other people's phones.
const ISSUE = `${LUA_LOCK}
local p = ARGV[1]
if ARGV[2] ~= '' and count('identity:otp-rate:ip:' .. ARGV[2], ${WINDOW_SEC}) > ${MAX_PER_IP} then return 'rate_limited' end
if redis.call('EXISTS', k('lock', p)) == 1 then return 'locked' end
if not redis.call('SET', k('resend', p), 1, 'NX', 'EX', ${RESEND_AFTER_SEC}) then return 'resend_too_soon' end
if count(k('rate', p), ${WINDOW_SEC}) > ${MAX_PER_PHONE} then lock(p) return 'rate_limited' end
return 'ok'`;

// KEYS[1]: the code's record; ARGV[1]: the hash of the presented code. A match consumes the code; every miss counts
// against the code and against the phone.
const CHECK = `${LUA_LOCK}
local h = redis.call('HMGET', KEYS[1], 'code', 'data', 'phone')
if not h[1] then return {'expired'} end
local p = h[3]
if redis.call('EXISTS', k('lock', p)) == 1 then redis.call('DEL', KEYS[1]) return {'locked'} end
if h[1] == ARGV[1] then redis.call('DEL', KEYS[1]) return {'ok', h[2]} end
if count(k('fail', p), ${DAY_SEC}) >= ${MAX_FAILURES} then lock(p) redis.call('DEL', KEYS[1]) return {'locked'} end
if redis.call('HINCRBY', KEYS[1], 'attempts', 1) >= ${MAX_ATTEMPTS} then redis.call('DEL', KEYS[1]) return {'too_many_attempts'} end
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
    const refusal = (await this.redis.eval(ISSUE, 0, phone, ip ? ipBucket(ip) : '')) as OtpRefusal | 'ok';
    if (refusal !== 'ok') {
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
    const [status, data] = (await this.redis.eval(CHECK, 1, key, mac(this.hashKey, `${key}:${code}`))) as [OtpCheck['status'], string];
    return status === 'ok' ? { status, data } : { status };
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
