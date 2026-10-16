/**
 * Redis sliding-window rate limiter for Fastify.
 *
 * Three overlapping strategies:
 *   1. Per-authenticated-user (JWT sub → userId), for all routes
 *   2. Per-IP, for unauthenticated requests
 *   3. Per-route override, for high-traffic or sensitive endpoints
 *
 * Returns 429 with Retry-After and X-RateLimit-* headers on breach.
 * Whitelisted IPs and admin routes are exempt.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Sliding-window duration in seconds. Default: 60. */
  windowSeconds: number;
  /** Max allowed requests in the window. Default: 100. */
  maxRequests: number;
}

export interface RouteOverride extends RateLimitConfig {
  /** Route pattern prefix, e.g. '/v1/auth'. */
  routePrefix: string;
}

export interface RateLimiterOptions {
  global: RateLimitConfig;
  /** Per-route overrides, checked first. */
  routeOverrides?: RouteOverride[];
  /** IPs that bypass all limits (loopback, internal probes, etc.). */
  whitelistIps?: readonly string[];
  /** Route prefixes that bypass all limits. */
  whitelistRoutes?: readonly string[];
  /** Redis instance. Must already be connected. */
  redis: RedisLike;
  /** Key prefix for Redis keys. Default: 'rl'. */
  keyPrefix?: string;
}

/** Minimal Redis interface; compatible with ioredis. */
export interface RedisLike {
  eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
}

// ── Lua sliding-window script ──────────────────────────────────────────────

/**
 * Atomic sliding-window counter via a sorted set.
 * KEYS[1] = rate limit key
 * ARGV[1] = current time (ms as string)
 * ARGV[2] = window size (ms as string)
 * ARGV[3] = max allowed
 * ARGV[4] = unique member ID (timestamp + random)
 * Returns: [current_count, ttl_ms_until_oldest_expires]
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
local cutoff = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local count = redis.call('ZCARD', key)
if count < max then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  count = count + 1
  return {count, 0}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestTs = tonumber(oldest[2]) or now
  local retryAfterMs = oldestTs + window - now
  return {count, retryAfterMs}
end
`.trim();

// ── Helpers ────────────────────────────────────────────────────────────────

function extractUserId(req: FastifyRequest): string | null {
  // The auth guard puts the decoded JWT payload at req.user; check for sub.
  const user = (req as FastifyRequest & { user?: { sub?: string; id?: string } }).user;
  return user?.sub ?? user?.id ?? null;
}

function resolveConfig(route: string, opts: RateLimiterOptions): RateLimitConfig {
  for (const override of opts.routeOverrides ?? []) {
    if (route.startsWith(override.routePrefix)) return override;
  }
  return opts.global;
}

function isWhitelisted(req: FastifyRequest, opts: RateLimiterOptions): boolean {
  const ip = req.ip;
  if (opts.whitelistIps?.includes(ip)) return true;
  const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? req.url;
  if (opts.whitelistRoutes?.some((prefix) => route.startsWith(prefix))) return true;
  return false;
}

function uniqueMember(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── RateLimiter ────────────────────────────────────────────────────────────

export class RateLimiter {
  private readonly prefix: string;

  constructor(private readonly opts: RateLimiterOptions) {
    this.prefix = opts.keyPrefix ?? 'rl';
  }

  /**
   * Checks the rate limit for a request.
   * Returns `null` if allowed, or a `{ retryAfterMs, limit, current }` if blocked.
   */
  async check(req: FastifyRequest): Promise<{ retryAfterMs: number; limit: number; current: number } | null> {
    if (isWhitelisted(req, this.opts)) return null;

    const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? '';
    const config = resolveConfig(route, this.opts);
    const windowMs = config.windowSeconds * 1000;

    const userId = extractUserId(req);
    const identifier = userId
      ? `user:${userId}`
      : `ip:${req.ip}`;

    const key = `${this.prefix}:${identifier}:${Math.floor(Date.now() / (windowMs / 2))}`;

    let result: unknown;
    try {
      result = await this.opts.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        String(Date.now()),
        String(windowMs),
        String(config.maxRequests),
        uniqueMember(),
      );
    } catch {
      // Redis unavailable → fail open (allow request)
      return null;
    }

    const [current, retryAfterMs] = result as [number, number];

    if (current > config.maxRequests) {
      return { retryAfterMs, limit: config.maxRequests, current };
    }

    return null;
  }

  /**
   * Fastify `onRequest` hook — call `fastify.addHook('onRequest', rateLimiter.hook())`.
   */
  hook() {
    return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const blocked = await this.check(req);
      if (!blocked) return;

      const retryAfterSec = Math.ceil(blocked.retryAfterMs / 1000);
      void reply
        .status(429)
        .header('Retry-After', String(retryAfterSec))
        .header('X-RateLimit-Limit', String(blocked.limit))
        .header('X-RateLimit-Remaining', '0')
        .header('X-RateLimit-Reset', String(Math.ceil((Date.now() + blocked.retryAfterMs) / 1000)))
        .send({
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          code: 'rate_limit_exceeded',
          retryAfterSeconds: retryAfterSec,
        });
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates a RateLimiter with sensible defaults drawn from environment-sourced config.
 *
 * @param redis         - Connected ioredis (or compatible) instance
 * @param windowSeconds - Sliding window in seconds (default: 60)
 * @param maxRequests   - Max requests per window (default: 100)
 */
export function createRateLimiter(
  redis: RedisLike,
  windowSeconds = 60,
  maxRequests = 100,
): RateLimiter {
  return new RateLimiter({
    redis,
    global: { windowSeconds, maxRequests },
    routeOverrides: [
      // Auth endpoints are tighter to prevent brute-force
      { routePrefix: '/v1/auth/otp/request', windowSeconds: 60, maxRequests: 5 },
      { routePrefix: '/v1/auth/otp/verify', windowSeconds: 60, maxRequests: 10 },
      // AI assistant is expensive — lower limit
      { routePrefix: '/v1/assistant', windowSeconds: 60, maxRequests: 20 },
    ],
    whitelistRoutes: ['/internal/', '/health', '/openapi.json'],
    whitelistIps: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
  });
}
