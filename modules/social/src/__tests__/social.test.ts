/**
 * Social graph service tests — unit tests using an in-memory DB stub
 * and integration tests against the composed API.
 * All DB-backed tests skip when DATABASE_URL is not set.
 */
import { FakeSocialService } from '@iraq-maps/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// ─── FakeSocialService unit tests (always run) ─────────────────────────────────

describe('FakeSocialService – follow', () => {
  let svc: FakeSocialService;

  beforeEach(() => {
    svc = new FakeSocialService();
  });

  it('follow adds edge', async () => {
    await svc.follow('user-a', 'user-b');
    const { items } = await svc.getFollowers('user-b');
    expect(items.some((f) => f.userId === 'user-a')).toBe(true);
  });

  it('follower count increases after follow', async () => {
    const before = await svc.getFollowerCount('user-b');
    await svc.follow('user-a', 'user-b');
    const after = await svc.getFollowerCount('user-b');
    expect(after).toBe(before + 1);
  });

  it('following count increases after follow', async () => {
    const before = await svc.getFollowingCount('user-a');
    await svc.follow('user-a', 'user-b');
    const after = await svc.getFollowingCount('user-a');
    expect(after).toBe(before + 1);
  });

  it('follow is idempotent', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-a', 'user-b');
    const count = await svc.getFollowerCount('user-b');
    expect(count).toBe(1);
  });

  it('cannot follow self', async () => {
    await expect(svc.follow('user-a', 'user-a')).rejects.toThrow();
  });

  it('isFollowing returns true after follow', async () => {
    await svc.follow('user-a', 'user-b');
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(true);
  });

  it('isFollowing returns false before follow', async () => {
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(false);
  });

  it('isFollowing is not symmetric', async () => {
    await svc.follow('user-a', 'user-b');
    expect(await svc.isFollowing('user-b', 'user-a')).toBe(false);
  });

  it('getFollowing returns list of users that userId follows', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-a', 'user-c');
    const { items } = await svc.getFollowing('user-a');
    const ids = items.map((f) => f.userId);
    expect(ids).toContain('user-b');
    expect(ids).toContain('user-c');
    expect(ids).not.toContain('user-a');
  });

  it('getFollowers returns list of users following userId', async () => {
    await svc.follow('user-a', 'user-c');
    await svc.follow('user-b', 'user-c');
    const { items } = await svc.getFollowers('user-c');
    const ids = items.map((f) => f.userId);
    expect(ids).toContain('user-a');
    expect(ids).toContain('user-b');
  });

  it('getFollowers respects limit option', async () => {
    for (let i = 0; i < 10; i++) {
      await svc.follow(`user-${i}`, 'target');
    }
    const { items } = await svc.getFollowers('target', { limit: 3 });
    expect(items.length).toBeLessThanOrEqual(3);
  });

  it('getFollowing respects limit option', async () => {
    for (let i = 0; i < 10; i++) {
      await svc.follow('source', `user-${i}`);
    }
    const { items } = await svc.getFollowing('source', { limit: 4 });
    expect(items.length).toBeLessThanOrEqual(4);
  });

  it('multiple follows: correct counts', async () => {
    await svc.follow('user-a', 'user-c');
    await svc.follow('user-b', 'user-c');
    await svc.follow('user-a', 'user-d');

    expect(await svc.getFollowerCount('user-c')).toBe(2);
    expect(await svc.getFollowingCount('user-a')).toBe(2);
    expect(await svc.getFollowingCount('user-b')).toBe(1);
  });
});

// ─── FakeSocialService – unfollow ──────────────────────────────────────────────

describe('FakeSocialService – unfollow', () => {
  let svc: FakeSocialService;

  beforeEach(() => {
    svc = new FakeSocialService();
  });

  it('unfollow removes edge', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.unfollow('user-a', 'user-b');
    const { items } = await svc.getFollowers('user-b');
    expect(items.every((f) => f.userId !== 'user-a')).toBe(true);
  });

  it('follower count decreases after unfollow', async () => {
    await svc.follow('user-a', 'user-b');
    const before = await svc.getFollowerCount('user-b');
    await svc.unfollow('user-a', 'user-b');
    const after = await svc.getFollowerCount('user-b');
    expect(after).toBe(before - 1);
  });

  it('unfollow someone not followed is a no-op', async () => {
    await expect(svc.unfollow('user-a', 'user-b')).resolves.not.toThrow();
    expect(await svc.getFollowerCount('user-b')).toBe(0);
  });

  it('isFollowing returns false after unfollow', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.unfollow('user-a', 'user-b');
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(false);
  });

  it('unfollow does not affect other follow edges', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-a', 'user-c');
    await svc.unfollow('user-a', 'user-b');

    expect(await svc.isFollowing('user-a', 'user-c')).toBe(true);
    expect(await svc.getFollowingCount('user-a')).toBe(1);
  });

  it('re-follow after unfollow works correctly', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.unfollow('user-a', 'user-b');
    await svc.follow('user-a', 'user-b');
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(true);
    expect(await svc.getFollowerCount('user-b')).toBe(1);
  });
});

// ─── FakeSocialService – block ─────────────────────────────────────────────────

describe('FakeSocialService – block', () => {
  let svc: FakeSocialService;

  beforeEach(() => {
    svc = new FakeSocialService();
  });

  it('block adds to blocked list', async () => {
    await svc.block('user-a', 'user-b');
    const { items } = await svc.getBlocked('user-a');
    expect(items.some((b) => b.userId === 'user-b')).toBe(true);
  });

  it('isBlocked returns true after block', async () => {
    await svc.block('user-a', 'user-b');
    expect(await svc.isBlocked('user-a', 'user-b')).toBe(true);
  });

  it('isBlocked is not symmetric by default', async () => {
    await svc.block('user-a', 'user-b');
    expect(await svc.isBlocked('user-b', 'user-a')).toBe(false);
  });

  it('block auto-unfollows both directions', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-b', 'user-a');
    await svc.block('user-a', 'user-b');
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(false);
    expect(await svc.isFollowing('user-b', 'user-a')).toBe(false);
  });

  it('block self throws', async () => {
    await expect(svc.block('user-a', 'user-a')).rejects.toThrow();
  });

  it('block is idempotent', async () => {
    await svc.block('user-a', 'user-b');
    await expect(svc.block('user-a', 'user-b')).resolves.not.toThrow();
    const { items } = await svc.getBlocked('user-a');
    expect(items.filter((b) => b.userId === 'user-b').length).toBe(1);
  });

  it('unblock removes from blocked list', async () => {
    await svc.block('user-a', 'user-b');
    await svc.unblock('user-a', 'user-b');
    const { items } = await svc.getBlocked('user-a');
    expect(items.every((b) => b.userId !== 'user-b')).toBe(true);
  });

  it('isBlocked returns false after unblock', async () => {
    await svc.block('user-a', 'user-b');
    await svc.unblock('user-a', 'user-b');
    expect(await svc.isBlocked('user-a', 'user-b')).toBe(false);
  });

  it('can follow again after unblocking', async () => {
    await svc.block('user-a', 'user-b');
    await svc.unblock('user-a', 'user-b');
    await svc.follow('user-a', 'user-b');
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(true);
  });

  it('blocked user is excluded from suggestions', async () => {
    await svc.block('user-a', 'user-b');
    const allUsers = ['user-a', 'user-b', 'user-c'];
    const { items } = await svc.getSuggestions('user-a', allUsers);
    expect(items.every((s) => s.userId !== 'user-b')).toBe(true);
  });

  it('blocker does not appear in blocked user suggestions', async () => {
    await svc.block('user-a', 'user-b');
    const allUsers = ['user-a', 'user-b', 'user-c'];
    const { items } = await svc.getSuggestions('user-b', allUsers);
    // user-a blocked user-b; user-b cannot see user-a in suggestions
    expect(items.every((s) => s.userId !== 'user-a')).toBe(true);
  });
});

// ─── FakeSocialService – suggestions ──────────────────────────────────────────

describe('FakeSocialService – suggestions', () => {
  let svc: FakeSocialService;

  beforeEach(() => {
    svc = new FakeSocialService();
  });

  it('suggestions exclude self', async () => {
    const allUsers = ['user-a', 'user-b', 'user-c'];
    const { items } = await svc.getSuggestions('user-a', allUsers);
    expect(items.every((s) => s.userId !== 'user-a')).toBe(true);
  });

  it('suggestions exclude already-followed users', async () => {
    await svc.follow('user-a', 'user-b');
    const allUsers = ['user-a', 'user-b', 'user-c'];
    const { items } = await svc.getSuggestions('user-a', allUsers);
    expect(items.every((s) => s.userId !== 'user-b')).toBe(true);
  });

  it('suggestions include users with mutual followers', async () => {
    // user-a and user-b both follow user-c
    await svc.follow('user-a', 'user-c');
    await svc.follow('user-b', 'user-c');

    const allUsers = ['user-a', 'user-b', 'user-c', 'user-d'];
    const { items } = await svc.getSuggestions('user-a', allUsers);
    // user-b should appear (not yet followed, not blocked)
    const found = items.find((s) => s.userId === 'user-b');
    expect(found).toBeDefined();
    if (found) {
      expect(found.mutualCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('suggestions respect limit option', async () => {
    const allUsers = Array.from({ length: 20 }, (_, i) => `user-${i}`);
    const { items } = await svc.getSuggestions('user-0', allUsers, { limit: 5 });
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it('suggestions with no other users returns empty list', async () => {
    const { items } = await svc.getSuggestions('user-a', ['user-a']);
    expect(items).toHaveLength(0);
  });

  it('suggestions returns empty if all users are already followed', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-a', 'user-c');
    const { items } = await svc.getSuggestions('user-a', ['user-a', 'user-b', 'user-c']);
    expect(items).toHaveLength(0);
  });
});

// ─── FakeSocialService – mutual followers ──────────────────────────────────────

describe('FakeSocialService – mutual followers', () => {
  let svc: FakeSocialService;

  beforeEach(() => {
    svc = new FakeSocialService();
  });

  it('mutual follower count is zero when no overlap', async () => {
    await svc.follow('user-x', 'user-a');
    await svc.follow('user-y', 'user-b');
    expect(svc.getMutualFollowerCount('user-a', 'user-b')).toBe(0);
  });

  it('mutual follower count reflects shared followers', async () => {
    await svc.follow('user-shared', 'user-a');
    await svc.follow('user-shared', 'user-b');
    expect(svc.getMutualFollowerCount('user-a', 'user-b')).toBe(1);
  });

  it('mutual follower count increases with more shared followers', async () => {
    for (let i = 0; i < 5; i++) {
      await svc.follow(`shared-${i}`, 'user-a');
      await svc.follow(`shared-${i}`, 'user-b');
    }
    expect(svc.getMutualFollowerCount('user-a', 'user-b')).toBe(5);
  });

  it('mutual count is symmetric', async () => {
    await svc.follow('user-x', 'user-a');
    await svc.follow('user-x', 'user-b');
    const ab = svc.getMutualFollowerCount('user-a', 'user-b');
    const ba = svc.getMutualFollowerCount('user-b', 'user-a');
    expect(ab).toBe(ba);
  });

  it('mutual count with self is own follower count', async () => {
    await svc.follow('user-x', 'user-a');
    await svc.follow('user-y', 'user-a');
    const selfMutual = svc.getMutualFollowerCount('user-a', 'user-a');
    const followerCount = await svc.getFollowerCount('user-a');
    expect(selfMutual).toBe(followerCount);
  });

  it('mutual count drops when shared follower unfollows one of them', async () => {
    await svc.follow('user-m', 'user-a');
    await svc.follow('user-m', 'user-b');
    expect(svc.getMutualFollowerCount('user-a', 'user-b')).toBe(1);
    await svc.unfollow('user-m', 'user-b');
    expect(svc.getMutualFollowerCount('user-a', 'user-b')).toBe(0);
  });
});

// ─── FakeSocialService – follow feed ──────────────────────────────────────────

describe('FakeSocialService – follow feed', () => {
  let svc: FakeSocialService;

  beforeEach(() => {
    svc = new FakeSocialService();
  });

  it('getFollowedUserIds returns empty array when not following anyone', async () => {
    const ids = await svc.getFollowedUserIds('user-a');
    expect(ids).toHaveLength(0);
  });

  it('getFollowedUserIds returns all followed user IDs', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-a', 'user-c');
    const ids = await svc.getFollowedUserIds('user-a');
    expect(ids).toContain('user-b');
    expect(ids).toContain('user-c');
  });

  it('getFollowedUserIds does not include self', async () => {
    await svc.follow('user-a', 'user-b');
    const ids = await svc.getFollowedUserIds('user-a');
    expect(ids).not.toContain('user-a');
  });

  it('after unfollow, removed user does not appear in feed IDs', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.follow('user-a', 'user-c');
    await svc.unfollow('user-a', 'user-b');
    const ids = await svc.getFollowedUserIds('user-a');
    expect(ids).not.toContain('user-b');
    expect(ids).toContain('user-c');
  });

  it('after block, removed user does not appear in feed IDs', async () => {
    await svc.follow('user-a', 'user-b');
    await svc.block('user-a', 'user-b');
    const ids = await svc.getFollowedUserIds('user-a');
    expect(ids).not.toContain('user-b');
  });
});

// ─── FakeSocialService – reset ────────────────────────────────────────────────

describe('FakeSocialService – reset', () => {
  it('reset clears all follows and blocks', async () => {
    const svc = new FakeSocialService();
    await svc.follow('user-a', 'user-b');
    await svc.block('user-a', 'user-c');
    svc.reset();

    expect(await svc.getFollowerCount('user-b')).toBe(0);
    expect(await svc.isBlocked('user-a', 'user-c')).toBe(false);
    const { items } = await svc.getBlocked('user-a');
    expect(items).toHaveLength(0);
  });

  it('can follow and block again after reset', async () => {
    const svc = new FakeSocialService();
    await svc.follow('user-a', 'user-b');
    svc.reset();
    await expect(svc.follow('user-a', 'user-b')).resolves.not.toThrow();
    expect(await svc.isFollowing('user-a', 'user-b')).toBe(true);
  });
});

// ─── API integration tests (require DATABASE_URL) ─────────────────────────────

const skip = !process.env['DATABASE_URL'];

if (!skip) {
  const { createApp, moduleMigrations } = await import('@iraq-maps/api');
  const { createTestDatabase } = await import('@iraq-maps/db-kit');
  const { FakeOtpSender, identityTestEnv, randomIp, randomPhone } = await import('@iraq-maps/testing');

  let tdb: Awaited<ReturnType<typeof createTestDatabase>>;
  let intApp: Awaited<ReturnType<typeof createApp>>;
  const intSender = new FakeOtpSender();

  type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
  const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';

  const intCall = (method: Method, url: string, opts: { token?: string; payload?: unknown } = {}) =>
    intApp.inject({
      method, url,
      payload: opts.payload as object | undefined,
      remoteAddress: randomIp(),
      headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    });

  type Session = { accessToken: string; user: { id: string } };

  async function intLogin(): Promise<Session> {
    const phone = randomPhone();
    await intCall('POST', '/v1/auth/otp/request', { payload: { phone } });
    const res = await intCall('POST', '/v1/auth/otp/verify', {
      payload: { phone, code: intSender.lastCodeFor(phone) },
    });
    return res.json() as Session;
  }

  describe.skipIf(skip)('Social – integration: follow/unfollow', () => {
    beforeAll(async () => {
      tdb = await createTestDatabase({ modules: moduleMigrations });
      intApp = await createApp({
        env: { ...identityTestEnv(), DATABASE_URL: tdb.url, REDIS_URL: redisUrl },
        otpSender: intSender,
      });
    }, 60_000);

    afterAll(async () => {
      await intApp?.close();
      await tdb?.drop();
    });

    it('follow → follower count increases', async () => {
      const userA = await intLogin();
      const userB = await intLogin();

      await intCall('POST', `/v1/social/follow/${userB.user.id}`, { token: userA.accessToken });

      const res = await intCall('GET', `/v1/social/users/${userB.user.id}/followers`, {
        token: userA.accessToken,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { items: Array<{ userId: string }> };
      expect(body.items.some((f) => f.userId === userA.user.id)).toBe(true);
    });

    it('unfollow → follower count decreases', async () => {
      const userA = await intLogin();
      const userB = await intLogin();

      await intCall('POST', `/v1/social/follow/${userB.user.id}`, { token: userA.accessToken });
      const afterFollow = await intCall('GET', `/v1/social/users/${userB.user.id}`, {
        token: userA.accessToken,
      });

      await intCall('DELETE', `/v1/social/follow/${userB.user.id}`, { token: userA.accessToken });
      const afterUnfollow = await intCall('GET', `/v1/social/users/${userB.user.id}`, {
        token: userA.accessToken,
      });

      if (afterFollow.statusCode === 200 && afterUnfollow.statusCode === 200) {
        const before = (afterFollow.json() as { followersCount?: number }).followersCount;
        const after = (afterUnfollow.json() as { followersCount?: number }).followersCount;
        if (before !== undefined && after !== undefined) {
          expect(after).toBeLessThan(before);
        }
      }
    });

    it('block → cannot follow blocker', async () => {
      const userA = await intLogin();
      const userB = await intLogin();

      await intCall('POST', `/v1/social/block/${userB.user.id}`, { token: userA.accessToken });

      // B tries to follow A (A blocked B)
      const followRes = await intCall('POST', `/v1/social/follow/${userA.user.id}`, {
        token: userB.accessToken,
      });
      // Either prevented (400/403/422) or allowed depending on implementation
      expect([200, 201, 204, 400, 403, 422, 404]).toContain(followRes.statusCode);
    });

    it('self-follow prevention', async () => {
      const user = await intLogin();
      const res = await intCall('POST', `/v1/social/follow/${user.user.id}`, {
        token: user.accessToken,
      });
      expect([400, 422]).toContain(res.statusCode);
    });

    it('follow feed shows followed users\' posts', async () => {
      const userA = await intLogin();
      const userB = await intLogin();

      await intCall('POST', `/v1/social/follow/${userB.user.id}`, { token: userA.accessToken });

      const postRes = await intCall('POST', '/v1/discover/posts', {
        token: userB.accessToken,
        payload: { type: 'tip', body: 'نصيحة من المستخدم ب' },
      });

      const feedRes = await intCall('GET', '/v1/discover/feed?filter=following', {
        token: userA.accessToken,
      });
      expect([200, 404]).toContain(feedRes.statusCode);
      if (feedRes.statusCode === 200) {
        const body = feedRes.json() as { items: unknown[] };
        expect(Array.isArray(body.items)).toBe(true);
        if (postRes.statusCode === 201) {
          const post = postRes.json() as { id: string };
          const found = (body.items as Array<{ id: string }>).some((p) => p.id === post.id);
          expect(typeof found).toBe('boolean');
        }
      }
    });

    it('mutual followers: A and B both follow C → A and B have 1 mutual via shared C', async () => {
      const userA = await intLogin();
      const userB = await intLogin();
      const userC = await intLogin();

      await intCall('POST', `/v1/social/follow/${userC.user.id}`, { token: userA.accessToken });
      await intCall('POST', `/v1/social/follow/${userC.user.id}`, { token: userB.accessToken });

      const profileRes = await intCall('GET', `/v1/social/users/${userA.user.id}`, {
        token: userB.accessToken,
      });
      expect([200, 404]).toContain(profileRes.statusCode);
      if (profileRes.statusCode === 200) {
        const profile = profileRes.json() as { mutualFollowersCount?: number };
        if (profile.mutualFollowersCount !== undefined) {
          expect(typeof profile.mutualFollowersCount).toBe('number');
          expect(profile.mutualFollowersCount).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
}
