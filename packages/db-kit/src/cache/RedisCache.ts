/**
 * Generic Redis cache wrapper for Iraq Maps.
 *
 * Features:
 *  - get / set / del / exists with type-safe JSON serialization
 *  - getOrSet  — cache-aside pattern
 *  - mget / mset — batch operations
 *  - invalidatePattern — delete keys matching a glob
 *  - withLock — distributed lock via SET NX PX
 *  - Transparent gzip compression for values > 1 KB
 *  - Key namespacing: every key is prefixed with 'iqmaps:'
 *  - Per-prefix hit/miss metrics (non-throwing)
 *  - Graceful fallback: Redis errors are caught and do not crash the app
 */

import { createGzip, createGunzip } from 'zlib';
import { Readable } from 'stream';

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal Redis interface; compatible with ioredis and FakeRedis. */
export interface RedisCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: 'EX', seconds: number): Promise<unknown>;
  set(key: string, value: string, options: { nx: boolean; px: number }): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  keys(pattern: string): Promise<string[]>;
}

export interface CacheMetrics {
  prefix: string;
  hits: number;
  misses: number;
  hitRatio: number;
  compressionSavings: number; // bytes saved by compression
}

export interface CacheEntry<T> {
  value: T;
  cachedAt: number; // unix ms
  compressed: boolean;
}

export type SetOptions = {
  /** TTL in seconds. Required for set(). */
  ttlSeconds: number;
  /** Skip compression even for large values. */
  noCompress?: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────

export const NAMESPACE = 'iqmaps';
const COMPRESS_THRESHOLD = 1024; // bytes
const LOCK_TTL_MS = 5_000;

// ── Compression helpers ────────────────────────────────────────────────────

async function gzip(data: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGzip();
    gz.on('data', (chunk: Buffer) => chunks.push(chunk));
    gz.on('end', () => resolve(Buffer.concat(chunks)));
    gz.on('error', reject);
    const readable = Readable.from([Buffer.from(data, 'utf8')]);
    readable.pipe(gz);
  });
}

async function gunzip(data: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gz = createGunzip();
    gz.on('data', (chunk: Buffer) => chunks.push(chunk));
    gz.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    gz.on('error', reject);
    const readable = Readable.from([data]);
    readable.pipe(gz);
  });
}

// ── RedisCache ─────────────────────────────────────────────────────────────

/**
 * Generic Redis cache wrapper with namespacing, compression and metrics.
 *
 * Usage:
 *   const cache = new RedisCache(redis);
 *   await cache.set('user:42', user, { ttlSeconds: 60 });
 *   const user = await cache.get<User>('user:42');
 */
export class RedisCache {
  private readonly metrics = new Map<string, { hits: number; misses: number; saved: number }>();

  constructor(
    private readonly redis: RedisCacheClient,
    /** Additional sub-namespace, e.g. 'places' or 'users'. Default: 'general'. */
    private readonly subNamespace = 'general',
  ) {}

  // ── Key building ─────────────────────────────────────────────────────────

  private key(rawKey: string): string {
    return `${NAMESPACE}:${this.subNamespace}:${rawKey}`;
  }

  private prefixOf(key: string): string {
    // extract the first segment after namespace:subns:
    const parts = key.split(':');
    return parts[2] ?? parts[0] ?? key;
  }

  private trackHit(prefix: string): void {
    const m = this.metrics.get(prefix) ?? { hits: 0, misses: 0, saved: 0 };
    m.hits++;
    this.metrics.set(prefix, m);
  }

  private trackMiss(prefix: string): void {
    const m = this.metrics.get(prefix) ?? { hits: 0, misses: 0, saved: 0 };
    m.misses++;
    this.metrics.set(prefix, m);
  }

  private trackSaved(prefix: string, bytes: number): void {
    const m = this.metrics.get(prefix) ?? { hits: 0, misses: 0, saved: 0 };
    m.saved += bytes;
    this.metrics.set(prefix, m);
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  private async serialize<T>(value: T, noCompress?: boolean): Promise<{ raw: string; compressed: boolean }> {
    const json = JSON.stringify(value);
    if (!noCompress && json.length > COMPRESS_THRESHOLD) {
      const buf = await gzip(json);
      // Store as base64 to keep it as a plain Redis string
      return { raw: `gz:${buf.toString('base64')}`, compressed: true };
    }
    return { raw: `js:${json}`, compressed: false };
  }

  private async deserialize<T>(raw: string): Promise<T> {
    if (raw.startsWith('gz:')) {
      const buf = Buffer.from(raw.slice(3), 'base64');
      const json = await gunzip(buf);
      return JSON.parse(json) as T;
    }
    if (raw.startsWith('js:')) {
      return JSON.parse(raw.slice(3)) as T;
    }
    // Legacy or plain JSON (backward compat)
    return JSON.parse(raw) as T;
  }

  // ── Core operations ───────────────────────────────────────────────────────

  /**
   * Get a cached value. Returns `null` on miss or error.
   */
  async get<T>(rawKey: string): Promise<T | null> {
    const k = this.key(rawKey);
    const prefix = this.prefixOf(k);
    try {
      const raw = await this.redis.get(k);
      if (raw === null) {
        this.trackMiss(prefix);
        return null;
      }
      const value = await this.deserialize<T>(raw);
      this.trackHit(prefix);
      return value;
    } catch {
      this.trackMiss(prefix);
      return null;
    }
  }

  /**
   * Set a value with a TTL. Values are compressed if > 1 KB (JSON).
   */
  async set<T>(rawKey: string, value: T, opts: SetOptions): Promise<void> {
    const k = this.key(rawKey);
    const prefix = this.prefixOf(k);
    try {
      const { raw, compressed } = await this.serialize(value, opts.noCompress);
      if (compressed) {
        const uncompressedLen = JSON.stringify(value).length;
        this.trackSaved(prefix, uncompressedLen - raw.length);
      }
      await this.redis.set(k, raw, 'EX', opts.ttlSeconds);
    } catch {
      // Non-fatal: app continues without cache
    }
  }

  /**
   * Delete a key.
   */
  async del(rawKey: string): Promise<void> {
    try {
      await this.redis.del(this.key(rawKey));
    } catch {
      // Non-fatal
    }
  }

  /**
   * Check if a key exists.
   */
  async exists(rawKey: string): Promise<boolean> {
    try {
      const count = await this.redis.exists(this.key(rawKey));
      return count > 0;
    } catch {
      return false;
    }
  }

  // ── Cache-aside pattern ───────────────────────────────────────────────────

  /**
   * Get from cache; if missing, call `fn`, store the result and return it.
   *
   * @param rawKey     Cache key (un-namespaced)
   * @param fn         Async function that produces the value on cache miss
   * @param ttlSeconds TTL for the stored entry
   */
  async getOrSet<T>(rawKey: string, fn: () => Promise<T>, ttlSeconds: number): Promise<T> {
    const cached = await this.get<T>(rawKey);
    if (cached !== null) return cached;

    const value = await fn();
    await this.set(rawKey, value, { ttlSeconds });
    return value;
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  /**
   * Fetch multiple keys in a single round-trip (MGET).
   * Returns an array in the same order; missing keys are `null`.
   */
  async mget<T>(rawKeys: string[]): Promise<(T | null)[]> {
    if (rawKeys.length === 0) return [];
    try {
      const keys = rawKeys.map((k) => this.key(k));
      const raws = await this.redis.mget(...keys);
      return Promise.all(
        raws.map(async (raw, i) => {
          const prefix = this.prefixOf(keys[i] ?? '');
          if (raw === null) {
            this.trackMiss(prefix);
            return null;
          }
          try {
            const value = await this.deserialize<T>(raw);
            this.trackHit(prefix);
            return value;
          } catch {
            this.trackMiss(prefix);
            return null;
          }
        }),
      );
    } catch {
      return rawKeys.map(() => null);
    }
  }

  /**
   * Set multiple entries in a pipeline-style loop.
   * Redis has no native MSET with per-key TTL; we use individual SETs.
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttlSeconds: number }>): Promise<void> {
    await Promise.allSettled(
      entries.map(({ key, value, ttlSeconds }) => this.set(key, value, { ttlSeconds })),
    );
  }

  // ── Pattern invalidation ──────────────────────────────────────────────────

  /**
   * Delete all keys matching a glob pattern (uses Redis KEYS — O(N)).
   * Pattern is automatically namespaced.
   * Example: invalidatePattern('place:42:*') deletes iqmaps:general:place:42:*
   *
   * NOTE: Use sparingly in production. For high-scale use a tag-index approach.
   */
  async invalidatePattern(rawPattern: string): Promise<number> {
    try {
      const pattern = `${NAMESPACE}:${this.subNamespace}:${rawPattern}`;
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.redis.del(...keys);
    } catch {
      return 0;
    }
  }

  // ── Distributed lock ──────────────────────────────────────────────────────

  /**
   * Acquire a distributed lock for `timeoutMs`, execute `fn`, then release.
   *
   * If the lock is already held, this call returns immediately (non-blocking).
   * Returns `null` if the lock could not be acquired.
   *
   * @param rawKey    Lock name (un-namespaced)
   * @param fn        Work to do while holding the lock
   * @param timeoutMs Maximum lock duration in ms (default: 5 000)
   */
  async withLock<T>(rawKey: string, fn: () => Promise<T>, timeoutMs = LOCK_TTL_MS): Promise<T | null> {
    const lockKey = this.key(`lock:${rawKey}`);
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    let acquired: string | null;
    try {
      acquired = await this.redis.set(lockKey, token, { nx: true, px: timeoutMs });
    } catch {
      return null;
    }

    if (acquired === null) return null; // Lock already held

    try {
      return await fn();
    } finally {
      // Only delete if we still own the lock (token matches)
      try {
        const current = await this.redis.get(lockKey);
        if (current === token) {
          await this.redis.del(lockKey);
        }
      } catch {
        // Best-effort release
      }
    }
  }

  // ── Metrics ───────────────────────────────────────────────────────────────

  /** Returns per-prefix hit/miss/compression metrics. */
  getMetrics(): CacheMetrics[] {
    return Array.from(this.metrics.entries()).map(([prefix, m]) => ({
      prefix,
      hits: m.hits,
      misses: m.misses,
      hitRatio: m.hits + m.misses === 0 ? 0 : m.hits / (m.hits + m.misses),
      compressionSavings: m.saved,
    }));
  }

  /** Reset all in-process metric counters. */
  resetMetrics(): void {
    this.metrics.clear();
  }
}

// ── FakeRedisCache ─────────────────────────────────────────────────────────

/**
 * In-memory Redis stub for unit tests.
 * Does NOT support pattern operations with glob wildcards beyond prefix matching.
 */
export class FakeRedisClient implements RedisCacheClient {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  private alive(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.alive(key) ? (this.store.get(key)?.value ?? null) : null;
  }

  async set(key: string, value: string, modeOrOpts: 'EX' | { nx: boolean; px: number }, secondsOrUndef?: number): Promise<string | null> {
    if (modeOrOpts === 'EX') {
      const seconds = secondsOrUndef ?? 0;
      this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
      return 'OK';
    } else {
      const opts = modeOrOpts as { nx: boolean; px: number };
      if (opts.nx && this.alive(key)) return null;
      this.store.set(key, { value, expiresAt: Date.now() + opts.px });
      return 'OK';
    }
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.filter((k) => this.alive(k)).length;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => (this.alive(k) ? (this.store.get(k)?.value ?? null) : null));
  }

  async keys(pattern: string): Promise<string[]> {
    // Convert simple Redis glob to regex: * → .*, ? → .
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    const re = new RegExp(`^${escaped}$`);
    return Array.from(this.store.keys()).filter((k) => this.alive(k) && re.test(k));
  }

  /** Test helper: flush everything. */
  flush(): void {
    this.store.clear();
  }

  /** Test helper: peek raw store size. */
  size(): number {
    return this.store.size;
  }
}
