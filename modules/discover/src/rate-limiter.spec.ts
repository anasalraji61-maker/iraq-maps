import { describe, it, expect, vi } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limiter';

function makeRedis(zcard: number) {
  const chain = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, 0], [null, zcard]]),
  };
  const redis = {
    multi: vi.fn().mockReturnValue(chain),
    zrange: vi.fn().mockResolvedValue([]),
  };
  return redis as unknown as import('ioredis').Redis;
}

describe('SlidingWindowRateLimiter', () => {
  it('allows when under limit', async () => {
    const limiter = new SlidingWindowRateLimiter(makeRedis(3), 10, 60);
    const result = await limiter.check('user-1');
    expect(result.allowed).toBe(true);
  });

  it('blocks when at limit', async () => {
    const redis = makeRedis(10);
    // Override zrange for retry-after calculation
    (redis as unknown as { zrange: ReturnType<typeof vi.fn> }).zrange = vi.fn().mockResolvedValue(['entry', String(Date.now() - 5000)]);
    const limiter = new SlidingWindowRateLimiter(redis, 10, 60);
    const result = await limiter.check('user-2');
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});
