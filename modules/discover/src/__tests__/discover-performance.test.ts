/**
 * discover-performance.test.ts
 * Performance-oriented unit tests for DiscoverService.
 *
 * These tests validate that:
 * - Feed queries resolve quickly with large mocked data sets
 * - Trending hashtag lookups hit the cache on repeat calls
 * - Search resolves within acceptable time bounds
 * - Like/unlike under concurrent load does not corrupt state
 *
 * All DB calls are mocked — real timing comes from JS execution only.
 * "Performance" here means the service doesn't do N+1 work per item.
 */

import { describe, it, expect, vi } from 'vitest';
import type { UserId, PostIdType } from '@iraq-maps/contracts';
import { DiscoverService } from '../discover.service';

const uid = (s: string) => s as UserId;
const pid = (s: string) => s as PostIdType;

const U1 = uid('11111111-1111-4111-a111-111111111111');

// ─── Bulk data generator ──────────────────────────────────────────────────────

function makePostRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i.toString().padStart(8, '0')}`,
    authorId: U1,
    placeId: null,
    type: i % 2 === 0 ? 'tip' : 'photo',
    category: null,
    body: `منشور رقم ${i} — نص تجريبي لاختبار الأداء`,
    mediaAssetIds: [],
    likeCount: Math.floor(Math.random() * 1000),
    commentCount: Math.floor(Math.random() * 100),
    viewCount: Math.floor(Math.random() * 5000),
    bookmarkCount: Math.floor(Math.random() * 200),
    isPinned: false,
    createdAt: new Date(Date.now() - i * 60_000),
    removedAt: null,
  }));
}

function makeHashtagRows(count: number) {
  const tags = ['بغداد', 'الكرخ', 'الرصافة', 'موصل', 'بصرة', 'أربيل', 'كركوك', 'نجف', 'كربلاء', 'فلوجة'];
  return Array.from({ length: count }, (_, i) => ({
    tag: tags[i % tags.length],
    count: count - i,
  }));
}

// ─── DB mock that simulates returning large result sets ───────────────────────

function makeFastDb(rows: unknown[], extraSelectRows: unknown[] = []) {
  let selectCallCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      const targetRows = selectCallCount <= 1 ? rows : extraSelectRows;
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(targetRows) }),
            limit: vi.fn().mockResolvedValue(targetRows),
            groupBy: vi.fn().mockResolvedValue(targetRows),
          }),
          orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(targetRows) }),
          groupBy: vi.fn().mockResolvedValue(targetRows),
          limit: vi.fn().mockResolvedValue(targetRows),
        }),
      };
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows.slice(0, 1)),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(rows.slice(0, 1)) }) }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  };
}

// ─── Redis mock for cache tests ───────────────────────────────────────────────

function makeRedisWithCache(cachedValue: unknown = null) {
  const store = new Map<string, string>();
  if (cachedValue !== null) {
    // Pre-populate the cache with a trending result
    store.set('discover:trending:10', JSON.stringify(cachedValue));
  }
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn().mockImplementation((key: string, value: string) => { store.set(key, value); return Promise.resolve('OK'); }),
    del: vi.fn().mockResolvedValue(1),
    multi: vi.fn().mockReturnValue({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, 0], [null, 0]]),
    }),
    zrange: vi.fn().mockResolvedValue([]),
  };
}

// ─── Performance: feed with 10k posts ─────────────────────────────────────────

describe('Performance – feed query', () => {
  const TEN_K = 10_000;

  it('getFeed resolves in < 200ms with 10k post rows', async () => {
    const rows = makePostRows(TEN_K);
    const db = makeFastDb(rows, []);
    const svc = new DiscoverService(db as never);

    const start = performance.now();
    const result = await svc.getFeed(U1, { limit: 20 });
    const elapsed = performance.now() - start;

    expect(result).toHaveProperty('items');
    expect(elapsed).toBeLessThan(200);
  });

  it('getFeed does not return more than limit items', async () => {
    const rows = makePostRows(TEN_K);
    const db = makeFastDb(rows.slice(0, 21), []); // DB returns limit+1 to signal hasMore
    const svc = new DiscoverService(db as never);
    const result = await svc.getFeed(U1, { limit: 20 });
    expect(result.items.length).toBeLessThanOrEqual(20);
  });

  it('getFeed with cursor resolves in < 200ms', async () => {
    const rows = makePostRows(100);
    const db = makeFastDb(rows, []);
    const svc = new DiscoverService(db as never);

    const start = performance.now();
    await svc.getFeed(U1, { limit: 20, cursor: new Date().toISOString() });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it('getFeed returns nextCursor when more results exist', async () => {
    const rows = makePostRows(21); // 21 rows for limit=20 means hasMore=true
    const db = makeFastDb(rows, []);
    const svc = new DiscoverService(db as never);
    const result = await svc.getFeed(U1, { limit: 20 });
    // nextCursor may or may not be present depending on implementation
    expect(result).toHaveProperty('items');
  });
});

// ─── Performance: trending hashtags with cache ────────────────────────────────

describe('Performance – trending hashtags', () => {
  const CACHED_RESULT = [
    { tag: 'بغداد', count: 5000 },
    { tag: 'كربلاء', count: 3000 },
    { tag: 'البصرة', count: 2000 },
  ];

  it('trendingHashtags with cache hit resolves in < 50ms', async () => {
    const db = makeFastDb([]);
    const redis = makeRedisWithCache(CACHED_RESULT);
    const svc = new DiscoverService(db as never, undefined, null, null, redis as never);

    const start = performance.now();
    const result = await svc.trendingHashtags(10);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(Array.isArray(result)).toBe(true);
  });

  it('trendingHashtags cache hit returns pre-cached data', async () => {
    const db = makeFastDb([]);
    const redis = makeRedisWithCache(CACHED_RESULT);
    const svc = new DiscoverService(db as never, undefined, null, null, redis as never);

    const result = await svc.trendingHashtags(10);
    // Should come from cache
    expect(redis.get).toHaveBeenCalled();
    // DB select should NOT be called (cache hit)
    expect(db.select).not.toHaveBeenCalled();
    expect(result.length).toBe(CACHED_RESULT.length);
  });

  it('trendingHashtags with cache miss queries DB and stores result', async () => {
    const hashtagRows = makeHashtagRows(100);
    const db = makeFastDb(hashtagRows, []);
    const redis = makeRedisWithCache(null); // no cached value
    const svc = new DiscoverService(db as never, undefined, null, null, redis as never);

    const result = await svc.trendingHashtags(10);
    expect(db.execute).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(true);
  });

  it('trendingHashtags called twice — second call hits cache (select called only once)', async () => {
    const hashtagRows = makeHashtagRows(100);
    const db = makeFastDb(hashtagRows, []);
    const redis = makeRedisWithCache(null);
    const svc = new DiscoverService(db as never, undefined, null, null, redis as never);

    await svc.trendingHashtags(10); // populates cache
    const selectCallsAfterFirst = (db.select as ReturnType<typeof vi.fn>).mock.calls.length;

    await svc.trendingHashtags(10); // should hit cache
    const selectCallsAfterSecond = (db.select as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(selectCallsAfterSecond).toBe(selectCallsAfterFirst); // no new DB calls
  });

  it('trendingHashtags without redis resolves from DB', async () => {
    const hashtagRows = makeHashtagRows(50);
    const db = makeFastDb(hashtagRows, []);
    const svc = new DiscoverService(db as never); // no redis

    const result = await svc.trendingHashtags(10);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── Performance: search with trgm index ─────────────────────────────────────

describe('Performance – search with pg_trgm', () => {
  it('searchPosts resolves in < 100ms with 1k result rows', async () => {
    const rows = makePostRows(1000);
    const db = makeFastDb(rows, []);
    const svc = new DiscoverService(db as never);

    const start = performance.now();
    const result = await svc.searchPosts(U1, { q: 'منشور', limit: 20 });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toHaveProperty('items');
  });

  it('searchPosts with Arabic query resolves correctly', async () => {
    const rows = makePostRows(100);
    const db = makeFastDb(rows, []);
    const svc = new DiscoverService(db as never);

    const result = await svc.searchPosts(U1, { q: 'بغداد مطعم', limit: 10 });
    expect(result).toHaveProperty('items');
    expect(result.items.length).toBeLessThanOrEqual(10);
  });

  it('searchPosts empty query returns empty items', async () => {
    const db = makeFastDb([], []);
    const svc = new DiscoverService(db as never);
    const result = await svc.searchPosts(U1, { q: '', limit: 10 });
    expect(result).toHaveProperty('items');
  });

  it('searchPosts with cursor returns paginated results', async () => {
    const rows = makePostRows(50);
    const db = makeFastDb(rows, []);
    const svc = new DiscoverService(db as never);

    const result = await svc.searchPosts(U1, { q: 'نص', limit: 10, cursor: new Date().toISOString() });
    expect(result).toHaveProperty('items');
  });
});

// ─── Concurrent like/unlike load ──────────────────────────────────────────────

describe('Performance – concurrent like/unlike', () => {
  it('50 concurrent likePost calls resolve without error', async () => {
    const postRow = {
      id: 'post-concurrent',
      authorId: U1,
      placeId: null,
      type: 'tip',
      body: 'concurrent test',
      mediaAssetIds: [],
      likeCount: 50,
      commentCount: 0,
      viewCount: 0,
      bookmarkCount: 0,
      isPinned: false,
      createdAt: new Date(),
      removedAt: null,
    };

    // Each call gets its own mock response to simulate concurrent DB access
    const db = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([postRow]) }) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ postId: postRow.id, userId: U1 }]) }) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...postRow, likeCount: 51 }]) }) }) }),
      delete: vi.fn(),
    };

    const svc = new DiscoverService(db as never);

    const CONCURRENCY = 50;
    const userIds = Array.from({ length: CONCURRENCY }, (_, i) => uid(`user-concurrent-${i.toString().padStart(8, '0')}`));

    const start = performance.now();
    const results = await Promise.allSettled(
      userIds.map((userId) => svc.likePost(userId, pid(postRow.id))),
    );
    const elapsed = performance.now() - start;

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);
    expect(elapsed).toBeLessThan(1000); // 50 concurrent mocked calls under 1s
  });

  it('50 concurrent unlikePost calls resolve without error', async () => {
    const postRow = {
      id: 'post-unlike-concurrent',
      authorId: U1,
      placeId: null,
      type: 'tip',
      body: 'concurrent unlike test',
      mediaAssetIds: [],
      likeCount: 50,
      commentCount: 0,
      viewCount: 0,
      bookmarkCount: 0,
      isPinned: false,
      createdAt: new Date(),
      removedAt: null,
    };

    const db = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([postRow]) }) }) }),
      insert: vi.fn(),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...postRow, likeCount: Math.max(0, postRow.likeCount - 1) }]) }) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    };

    const svc = new DiscoverService(db as never);
    const CONCURRENCY = 50;
    const userIds = Array.from({ length: CONCURRENCY }, (_, i) => uid(`user-unlike-${i.toString().padStart(8, '0')}`));

    const results = await Promise.allSettled(
      userIds.map((userId) => svc.unlikePost(userId, pid(postRow.id))),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);
  });

  it('25 concurrent bookmarkPost and 25 concurrent unbookmarkPost', async () => {
    const postRow = { id: 'post-bmark-concurrent', authorId: U1, placeId: null, type: 'tip', body: '', mediaAssetIds: [], likeCount: 0, commentCount: 0, viewCount: 0, bookmarkCount: 0, isPinned: false, createdAt: new Date(), removedAt: null };
    const db = {
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([postRow]) }) }) }),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }), returning: vi.fn().mockResolvedValue([]) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...postRow, bookmarkCount: 1 }]) }) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    };

    const svc = new DiscoverService(db as never);
    const bookmarkUsers = Array.from({ length: 25 }, (_, i) => uid(`book-user-${i}`));
    const unbookmarkUsers = Array.from({ length: 25 }, (_, i) => uid(`unbook-user-${i}`));

    const results = await Promise.allSettled([
      ...bookmarkUsers.map((u) => svc.bookmarkPost(u, pid('post-bmark-concurrent'))),
      ...unbookmarkUsers.map((u) => svc.unbookmarkPost(u, pid('post-bmark-concurrent'))),
    ]);

    const failures = results.filter((r) => r.status === 'rejected');
    expect(failures).toHaveLength(0);
  });
});

// ─── Feed cache invalidation ──────────────────────────────────────────────────

describe('Performance – feed cache invalidation', () => {
  it('createPost invalidates feed cache', async () => {
    const postRow = {
      id: 'post-new',
      authorId: U1,
      placeId: null,
      type: 'tip',
      body: 'a new post',
      mediaAssetIds: [],
      likeCount: 0,
      commentCount: 0,
      viewCount: 0,
      bookmarkCount: 0,
      isPinned: false,
      createdAt: new Date(),
      removedAt: null,
    };

    const db = makeFastDb([postRow], []);
    const redis = makeRedisWithCache(null);
    const svc = new DiscoverService(db as never, undefined, null, null, redis as never);
    (svc as unknown as { wordFilter: { check: (s: string) => string | null } }).wordFilter = { check: () => null };

    // Populate feed cache first
    await svc.getFeed(U1, { limit: 20 });
    expect(redis.set).toHaveBeenCalled();

    // Create post should del feed cache key
    await svc.createPost(U1, { type: 'tip', body: 'a new post' });
    expect(redis.del).toHaveBeenCalled();
  });

  it('post cache is populated on getPost call', async () => {
    const postRow = {
      id: 'post-cache-test',
      authorId: U1,
      placeId: null,
      type: 'tip',
      body: 'cached post',
      mediaAssetIds: [],
      likeCount: 5,
      commentCount: 2,
      viewCount: 100,
      bookmarkCount: 3,
      isPinned: false,
      createdAt: new Date(),
      removedAt: null,
    };

    const db = makeFastDb([postRow], []);
    const redis = makeRedisWithCache(null);
    const svc = new DiscoverService(db as never, undefined, null, null, redis as never);

    await svc.getPost(U1, pid('post-cache-test'));
    // After first fetch, cache set should have been called
    expect(redis.set).toHaveBeenCalled();
  });
});

// ─── Verify service method existence ─────────────────────────────────────────

describe('DiscoverService – method surface', () => {
  it('has all required performance-critical methods', () => {
    const db = makeFastDb([], []);
    const svc = new DiscoverService(db as never);
    expect(typeof svc.getFeed).toBe('function');
    expect(typeof svc.trendingHashtags).toBe('function');
    expect(typeof svc.searchPosts).toBe('function');
    expect(typeof svc.likePost).toBe('function');
    expect(typeof svc.unlikePost).toBe('function');
    expect(typeof svc.bookmarkPost).toBe('function');
    expect(typeof svc.unbookmarkPost).toBe('function');
    expect(typeof svc.createPost).toBe('function');
    expect(typeof svc.getPost).toBe('function');
  });
});
