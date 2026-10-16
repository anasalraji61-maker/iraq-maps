/**
 * Application-level metrics for the Iraq Maps API.
 *
 * Tracks:
 *  - Cache hit/miss rate per prefix (from RedisCache.getMetrics())
 *  - Query duration histogram (p50/p95/p99 per label)
 *  - Rate limit breach counter per route
 *  - Active WebSocket connections gauge
 *
 * All counters are in-process and reset on restart; use the Prometheus export
 * to scrape them into a time-series store.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CacheHitMetric {
  prefix: string;
  hits: number;
  misses: number;
  hitRatio: number;
  compressionSavingsBytes: number;
}

export interface QueryDurationSample {
  label: string; // e.g. 'places.search', 'providers.getById'
  durationMs: number;
  timestamp: Date;
}

export interface QueryDurationStats {
  label: string;
  count: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface RateLimitBreach {
  route: string;
  count: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_QUERY_SAMPLES = 5_000;

// ── Percentile helper (shared) ─────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

// ── AppMetrics ─────────────────────────────────────────────────────────────

/**
 * Singleton-style metrics collector for the API process.
 *
 * Thread-safety: single-process Node.js; no locking needed.
 */
export class AppMetrics {
  // ── Cache metrics (pushed from RedisCache instances) ────────────────────

  private readonly cacheCounters = new Map<string, { hits: number; misses: number; saved: number }>();

  /** Called by RedisCache (or any cache) to record a hit. */
  recordCacheHit(prefix: string): void {
    const m = this.cacheCounters.get(prefix) ?? { hits: 0, misses: 0, saved: 0 };
    m.hits++;
    this.cacheCounters.set(prefix, m);
  }

  /** Called by RedisCache (or any cache) to record a miss. */
  recordCacheMiss(prefix: string): void {
    const m = this.cacheCounters.get(prefix) ?? { hits: 0, misses: 0, saved: 0 };
    m.misses++;
    this.cacheCounters.set(prefix, m);
  }

  /** Record bytes saved by compression for a given prefix. */
  recordCompressionSaving(prefix: string, bytes: number): void {
    const m = this.cacheCounters.get(prefix) ?? { hits: 0, misses: 0, saved: 0 };
    m.saved += bytes;
    this.cacheCounters.set(prefix, m);
  }

  /** Merge metrics exported by a RedisCache instance. */
  mergeCacheMetrics(metrics: Array<{ prefix: string; hits: number; misses: number; compressionSavings: number }>): void {
    for (const m of metrics) {
      const existing = this.cacheCounters.get(m.prefix) ?? { hits: 0, misses: 0, saved: 0 };
      existing.hits += m.hits;
      existing.misses += m.misses;
      existing.saved += m.compressionSavings;
      this.cacheCounters.set(m.prefix, existing);
    }
  }

  getCacheHitMetrics(): CacheHitMetric[] {
    return Array.from(this.cacheCounters.entries()).map(([prefix, m]) => ({
      prefix,
      hits: m.hits,
      misses: m.misses,
      hitRatio: m.hits + m.misses === 0 ? 0 : m.hits / (m.hits + m.misses),
      compressionSavingsBytes: m.saved,
    }));
  }

  // ── Query duration histogram ─────────────────────────────────────────────

  private readonly querySamples: QueryDurationSample[] = [];
  private queryIndex = 0;

  /** Record a DB or service query duration. */
  recordQueryDuration(label: string, durationMs: number): void {
    const sample: QueryDurationSample = { label, durationMs, timestamp: new Date() };
    if (this.querySamples.length < MAX_QUERY_SAMPLES) {
      this.querySamples.push(sample);
    } else {
      this.querySamples[this.queryIndex % MAX_QUERY_SAMPLES] = sample;
      this.queryIndex++;
    }
  }

  /** Returns a timer. Call `done()` when the query finishes. */
  startQueryTimer(label: string): () => void {
    const start = Date.now();
    return () => this.recordQueryDuration(label, Date.now() - start);
  }

  getQueryStats(): QueryDurationStats[] {
    const buckets = new Map<string, number[]>();
    for (const s of this.querySamples) {
      const arr = buckets.get(s.label) ?? [];
      arr.push(s.durationMs);
      buckets.set(s.label, arr);
    }
    return Array.from(buckets.entries()).map(([label, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const n = sorted.length;
      return {
        label,
        count: n,
        sumMs: sorted.reduce((acc, v) => acc + v, 0),
        minMs: sorted[0] ?? 0,
        maxMs: sorted[n - 1] ?? 0,
        p50Ms: pct(sorted, 50),
        p95Ms: pct(sorted, 95),
        p99Ms: pct(sorted, 99),
      };
    });
  }

  // ── Rate limit breaches ──────────────────────────────────────────────────

  private readonly rateLimitBreaches = new Map<string, number>();

  /** Record that a request was rate-limited on the given route. */
  recordRateLimitBreach(route: string): void {
    this.rateLimitBreaches.set(route, (this.rateLimitBreaches.get(route) ?? 0) + 1);
  }

  getRateLimitBreaches(): RateLimitBreach[] {
    return Array.from(this.rateLimitBreaches.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ── Active WebSocket connections ─────────────────────────────────────────

  private wsConnections = 0;

  /** Call when a WebSocket connection is established. */
  wsConnected(): void {
    this.wsConnections++;
  }

  /** Call when a WebSocket connection closes. */
  wsDisconnected(): void {
    this.wsConnections = Math.max(0, this.wsConnections - 1);
  }

  /** Current active WebSocket connection count. */
  getWsConnections(): number {
    return this.wsConnections;
  }

  // ── Prometheus export ─────────────────────────────────────────────────────

  /** Serialize all metrics to Prometheus text exposition format v0.0.4. */
  toPrometheusText(): string {
    const lines: string[] = [];

    // Cache metrics
    lines.push('# HELP app_cache_hits_total Total cache hits by prefix');
    lines.push('# TYPE app_cache_hits_total counter');
    lines.push('# HELP app_cache_misses_total Total cache misses by prefix');
    lines.push('# TYPE app_cache_misses_total counter');
    lines.push('# HELP app_cache_hit_ratio Cache hit ratio (0.0–1.0) by prefix');
    lines.push('# TYPE app_cache_hit_ratio gauge');
    lines.push('# HELP app_cache_compression_savings_bytes Bytes saved by gzip compression');
    lines.push('# TYPE app_cache_compression_savings_bytes counter');

    for (const m of this.getCacheHitMetrics()) {
      const lbl = `prefix="${esc(m.prefix)}"`;
      lines.push(`app_cache_hits_total{${lbl}} ${m.hits}`);
      lines.push(`app_cache_misses_total{${lbl}} ${m.misses}`);
      lines.push(`app_cache_hit_ratio{${lbl}} ${m.hitRatio.toFixed(4)}`);
      lines.push(`app_cache_compression_savings_bytes{${lbl}} ${m.compressionSavingsBytes}`);
    }

    // Query duration histogram
    lines.push('# HELP app_query_duration_ms DB/service query duration in ms');
    lines.push('# TYPE app_query_duration_ms summary');

    for (const s of this.getQueryStats()) {
      const lbl = `query="${esc(s.label)}"`;
      lines.push(`app_query_duration_ms{${lbl},quantile="0.5"} ${s.p50Ms}`);
      lines.push(`app_query_duration_ms{${lbl},quantile="0.95"} ${s.p95Ms}`);
      lines.push(`app_query_duration_ms{${lbl},quantile="0.99"} ${s.p99Ms}`);
      lines.push(`app_query_duration_ms_sum{${lbl}} ${s.sumMs}`);
      lines.push(`app_query_duration_ms_count{${lbl}} ${s.count}`);
    }

    // Rate limit breaches
    lines.push('# HELP app_rate_limit_breaches_total Rate limit rejections by route');
    lines.push('# TYPE app_rate_limit_breaches_total counter');
    for (const b of this.getRateLimitBreaches()) {
      lines.push(`app_rate_limit_breaches_total{route="${esc(b.route)}"} ${b.count}`);
    }

    // WebSocket gauge
    lines.push('# HELP app_ws_connections_active Active WebSocket connections');
    lines.push('# TYPE app_ws_connections_active gauge');
    lines.push(`app_ws_connections_active ${this.wsConnections}`);

    return lines.join('\n') + '\n';
  }

  // ── Reset ─────────────────────────────────────────────────────────────────

  reset(): void {
    this.cacheCounters.clear();
    this.querySamples.length = 0;
    this.queryIndex = 0;
    this.rateLimitBreaches.clear();
    this.wsConnections = 0;
  }
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// ── Singleton ─────────────────────────────────────────────────────────────

/** Process-global AppMetrics instance. Import this in API middleware. */
export const appMetrics = new AppMetrics();
