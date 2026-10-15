import type { Redis } from 'ioredis';

/** Sliding-window rate limiter backed by Redis sorted sets.
 * Returns `{ allowed: true }` when under the limit,
 * `{ allowed: false, retryAfterMs: number }` when over. */
export class SlidingWindowRateLimiter {
  constructor(
    private readonly redis: Redis,
    /** Requests allowed per window. */
    private readonly limit: number,
    /** Window duration in seconds. */
    private readonly windowSec: number,
  ) {}

  async check(key: string): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
    const now = Date.now();
    const windowStart = now - this.windowSec * 1000;
    const redisKey = `rl:${key}`;

    // Atomic: remove expired entries, count, conditionally add
    const [, count] = await this.redis
      .multi()
      .zremrangebyscore(redisKey, '-inf', windowStart)
      .zcard(redisKey)
      .exec() as [[null, number], [null, number]];

    const current = count![1];

    if (current >= this.limit) {
      // Find oldest entry to compute retry-after
      const oldest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const oldestTs = oldest.length > 1 ? Number(oldest[1]) : now;
      const retryAfterMs = oldestTs + this.windowSec * 1000 - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    await this.redis
      .multi()
      .zadd(redisKey, now, `${now}-${Math.random()}`)
      .expire(redisKey, this.windowSec + 1)
      .exec();

    return { allowed: true };
  }
}
