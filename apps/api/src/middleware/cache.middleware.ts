/**
 * Response caching middleware for Fastify GET endpoints.
 *
 * - Cache key: method + route pattern + sorted query params (normalized)
 * - TTL: per-route (via CACHE_TTL decorator metadata) or global default
 * - Authenticated requests skip the cache by default (opt-in via `cacheAuthenticated`)
 * - Mutations (non-GET) can trigger cache invalidation by tag
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CacheOptions {
  /** Default TTL in seconds when a route has no override. Default: 300 (5 min). */
  defaultTtlSeconds: number;
  /** Cache authenticated requests (those with a valid JWT). Default: false. */
  cacheAuthenticated?: boolean;
  /** Redis instance. */
  redis: CacheRedis;
  /** Key namespace prefix. Default: 'cache'. */
  prefix?: string;
  /** Routes to skip entirely (no caching). */
  skipRoutes?: readonly string[];
  /** Per-route TTL overrides: map of route-pattern prefix → seconds. */
  routeTtls?: Record<string, number>;
}

export interface CacheRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: 'EX', seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
}

// ── Key building ───────────────────────────────────────────────────────────

function buildCacheKey(prefix: string, req: FastifyRequest): string {
  const route = req.routeOptions?.url ?? req.url.split('?')[0];
  const params = req.query as Record<string, string | string[]>;
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.sort().join(',') : v}`)
    .join('&');
  const base = `${prefix}:GET:${route}`;
  return sortedParams ? `${base}?${sortedParams}` : base;
}

function isAuthenticated(req: FastifyRequest): boolean {
  const user = (req as FastifyRequest & { user?: unknown }).user;
  return user !== undefined && user !== null;
}

function resolveTtl(req: FastifyRequest, opts: CacheOptions): number {
  const route = req.routeOptions?.url ?? '';
  for (const [prefix, ttl] of Object.entries(opts.routeTtls ?? {})) {
    if (route.startsWith(prefix)) return ttl;
  }
  return opts.defaultTtlSeconds;
}

function shouldSkip(req: FastifyRequest, opts: CacheOptions): boolean {
  if (req.method.toUpperCase() !== 'GET') return true;
  const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? req.url;
  if (opts.skipRoutes?.some((r) => route.startsWith(r))) return true;
  if (!opts.cacheAuthenticated && isAuthenticated(req)) return true;
  return false;
}

// ── ResponseCache ──────────────────────────────────────────────────────────

export class ResponseCache {
  private readonly prefix: string;

  constructor(private readonly opts: CacheOptions) {
    this.prefix = opts.prefix ?? 'cache';
  }

  /**
   * Returns a pair of Fastify hooks that together implement cache read+write.
   *
   * Usage:
   *   const { onRequest, onSend } = responseCache.hooks();
   *   fastify.addHook('onRequest', onRequest);
   *   fastify.addHook('onSend', onSend);
   */
  hooks(): {
    onRequest: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    onSend: (req: FastifyRequest, reply: FastifyReply, payload: string) => Promise<string>;
  } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const cache = this;

    return {
      async onRequest(req, reply) {
        if (shouldSkip(req, cache.opts)) return;

        const key = buildCacheKey(cache.prefix, req);
        let cachedRaw: string | null;
        try {
          cachedRaw = await cache.opts.redis.get(key);
        } catch {
          // Redis unavailable — serve uncached
          return;
        }

        if (cachedRaw === null) return;

        let parsedEntry: { status: number; body: string; contentType: string } | null;
        try {
          parsedEntry = JSON.parse(cachedRaw) as { status: number; body: string; contentType: string };
        } catch {
          // Corrupted cache entry — ignore
          return;
        }

        void reply
          .status(parsedEntry.status)
          .header('content-type', parsedEntry.contentType)
          .header('X-Cache', 'HIT')
          .send(parsedEntry.body);
      },

      async onSend(req, _reply, payload) {
        if (shouldSkip(req, cache.opts)) return payload;

        const status = _reply.statusCode;
        // Only cache 200 responses
        if (status !== 200) return payload;

        const key = buildCacheKey(cache.prefix, req);
        const ttl = resolveTtl(req, cache.opts);
        const contentType = (_reply.getHeader('content-type') as string | undefined) ?? 'application/json';

        const entry = JSON.stringify({ status, body: payload, contentType });
        try {
          await cache.opts.redis.set(key, entry, 'EX', ttl);
        } catch {
          // Non-fatal — cache miss on next request
        }

        void _reply.header('X-Cache', 'MISS');
        return payload;
      },
    };
  }

  // ── Invalidation ─────────────────────────────────────────────────────

  /**
   * Invalidates all cache entries whose key contains `tag`.
   * Use route prefixes as tags, e.g. '/v1/places'.
   *
   * Note: Uses Redis KEYS which is O(N) on all keys. For production at scale,
   * prefer a tag→key index or switch to Redis Stack with JSON + FT.SEARCH.
   * Acceptable for our current dataset sizes.
   */
  async invalidateByTag(tag: string): Promise<number> {
    let keys: string[];
    try {
      keys = await this.opts.redis.keys(`${this.prefix}:*${tag}*`);
    } catch {
      return 0;
    }
    if (keys.length === 0) return 0;
    try {
      return await this.opts.redis.del(...keys);
    } catch {
      return 0;
    }
  }

  /**
   * Invalidates a single exact cache key.
   */
  async invalidate(req: FastifyRequest): Promise<void> {
    const key = buildCacheKey(this.prefix, req);
    try {
      await this.opts.redis.del(key);
    } catch {
      // Non-fatal
    }
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createResponseCache(redis: CacheRedis, defaultTtlSeconds = 300): ResponseCache {
  return new ResponseCache({
    redis,
    defaultTtlSeconds,
    cacheAuthenticated: false,
    routeTtls: {
      '/v1/places': 120,         // places change fairly often
      '/v1/discover': 60,         // social feed changes fast
      '/v1/insights': 300,        // insights are slower-moving
      '/health': 10,              // health check is cheap to serve fresh
    },
    skipRoutes: ['/internal/', '/v1/auth', '/v1/assistant', '/openapi.json'],
  });
}
