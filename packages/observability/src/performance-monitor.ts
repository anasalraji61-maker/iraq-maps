/**
 * API and infrastructure performance monitoring.
 *
 * Tracks:
 *   - HTTP response times per endpoint (histogram + percentiles)
 *   - DB query times (delegated to DatabaseMetrics in db-kit)
 *   - Cache hit/miss rates per cache name
 *
 * Exports Prometheus-compatible text exposition for a GET /metrics endpoint.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface HttpSample {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  timestamp: Date;
}

export interface CacheSample {
  cacheName: string;
  hit: boolean;
  timestamp: Date;
}

export interface HttpStats {
  route: string;
  method: string;
  count: number;
  errorCount: number;    // 5xx
  sumMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  countByStatus: Record<number, number>;
}

export interface CacheStats {
  cacheName: string;
  hits: number;
  misses: number;
  hitRatio: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

const MAX_HTTP_SAMPLES = 2000;
const MAX_CACHE_SAMPLES = 5000;

// ── PerformanceMonitor ─────────────────────────────────────────────────────

/**
 * In-process performance monitor for the API server.
 * Uses a fixed-size ring buffer per metric type so memory stays bounded.
 */
export class PerformanceMonitor {
  private readonly httpSamples: HttpSample[] = [];
  private httpIndex = 0;

  private readonly cacheSamples: CacheSample[] = [];
  private cacheIndex = 0;

  // ── HTTP ─────────────────────────────────────────────────────────────

  /**
   * Records a completed HTTP request.
   * Call this at the end of each request in the metrics middleware.
   */
  recordHttp(route: string, method: string, statusCode: number, durationMs: number): void {
    const sample: HttpSample = { route, method, statusCode, durationMs, timestamp: new Date() };
    if (this.httpSamples.length < MAX_HTTP_SAMPLES) {
      this.httpSamples.push(sample);
    } else {
      this.httpSamples[this.httpIndex % MAX_HTTP_SAMPLES] = sample;
      this.httpIndex++;
    }
  }

  /**
   * Starts a timer for an HTTP request.
   * @returns `done(statusCode)` — call it when the response is sent.
   */
  startHttp(route: string, method: string): (statusCode: number) => void {
    const start = Date.now();
    return (statusCode: number) => {
      this.recordHttp(route, method, statusCode, Date.now() - start);
    };
  }

  getHttpStats(): HttpStats[] {
    type Bucket = {
      durations: number[];
      errorCount: number;
      countByStatus: Map<number, number>;
    };

    const buckets = new Map<string, Bucket>();

    for (const s of this.httpSamples) {
      const key = `${s.method}:${s.route}`;
      let b = buckets.get(key);
      if (!b) {
        b = { durations: [], errorCount: 0, countByStatus: new Map() };
        buckets.set(key, b);
      }
      b.durations.push(s.durationMs);
      if (s.statusCode >= 500) b.errorCount++;
      b.countByStatus.set(s.statusCode, (b.countByStatus.get(s.statusCode) ?? 0) + 1);
    }

    return Array.from(buckets.entries()).map(([key, b]) => {
      const colonIdx = key.indexOf(':');
      const method = key.slice(0, colonIdx);
      const route = key.slice(colonIdx + 1);
      const sorted = [...b.durations].sort((a, c) => a - c);
      const n = sorted.length;
      return {
        route,
        method,
        count: n,
        errorCount: b.errorCount,
        sumMs: sorted.reduce((acc, v) => acc + v, 0),
        minMs: sorted[0] ?? 0,
        maxMs: sorted[n - 1] ?? 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
        countByStatus: Object.fromEntries(b.countByStatus),
      };
    });
  }

  // ── Cache ─────────────────────────────────────────────────────────────

  recordCache(cacheName: string, hit: boolean): void {
    const sample: CacheSample = { cacheName, hit, timestamp: new Date() };
    if (this.cacheSamples.length < MAX_CACHE_SAMPLES) {
      this.cacheSamples.push(sample);
    } else {
      this.cacheSamples[this.cacheIndex % MAX_CACHE_SAMPLES] = sample;
      this.cacheIndex++;
    }
  }

  getCacheStats(): CacheStats[] {
    const buckets = new Map<string, { hits: number; misses: number }>();
    for (const s of this.cacheSamples) {
      let b = buckets.get(s.cacheName);
      if (!b) {
        b = { hits: 0, misses: 0 };
        buckets.set(s.cacheName, b);
      }
      if (s.hit) b.hits++;
      else b.misses++;
    }
    return Array.from(buckets.entries()).map(([cacheName, b]) => ({
      cacheName,
      hits: b.hits,
      misses: b.misses,
      hitRatio: b.hits + b.misses === 0 ? 0 : b.hits / (b.hits + b.misses),
    }));
  }

  // ── Prometheus export ─────────────────────────────────────────────────

  /**
   * Returns all metrics in Prometheus text exposition format (version 0.0.4).
   * Safe to serve on GET /metrics (admin only).
   */
  toPrometheusText(): string {
    const lines: string[] = [];

    // ── HTTP metrics
    lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
    lines.push('# TYPE http_request_duration_ms summary');
    lines.push('# HELP http_requests_total Total HTTP requests');
    lines.push('# TYPE http_requests_total counter');
    lines.push('# HELP http_errors_total Total HTTP 5xx responses');
    lines.push('# TYPE http_errors_total counter');

    for (const s of this.getHttpStats()) {
      const lbl = `route="${escLabel(s.route)}",method="${s.method}"`;
      lines.push(`http_requests_total{${lbl}} ${s.count}`);
      lines.push(`http_errors_total{${lbl}} ${s.errorCount}`);
      lines.push(`http_request_duration_ms{${lbl},quantile="0.5"} ${s.p50Ms}`);
      lines.push(`http_request_duration_ms{${lbl},quantile="0.95"} ${s.p95Ms}`);
      lines.push(`http_request_duration_ms{${lbl},quantile="0.99"} ${s.p99Ms}`);
      lines.push(`http_request_duration_ms_sum{${lbl}} ${s.sumMs}`);
      lines.push(`http_request_duration_ms_count{${lbl}} ${s.count}`);
      for (const [code, cnt] of Object.entries(s.countByStatus)) {
        lines.push(`http_requests_by_status_total{${lbl},status="${code}"} ${cnt}`);
      }
    }

    // ── Cache metrics
    lines.push('# HELP cache_hits_total Cache hit count');
    lines.push('# TYPE cache_hits_total counter');
    lines.push('# HELP cache_misses_total Cache miss count');
    lines.push('# TYPE cache_misses_total counter');
    lines.push('# HELP cache_hit_ratio Cache hit ratio (0.0-1.0)');
    lines.push('# TYPE cache_hit_ratio gauge');

    for (const s of this.getCacheStats()) {
      const lbl = `cache="${escLabel(s.cacheName)}"`;
      lines.push(`cache_hits_total{${lbl}} ${s.hits}`);
      lines.push(`cache_misses_total{${lbl}} ${s.misses}`);
      lines.push(`cache_hit_ratio{${lbl}} ${s.hitRatio.toFixed(4)}`);
    }

    return lines.join('\n') + '\n';
  }

  reset(): void {
    this.httpSamples.length = 0;
    this.httpIndex = 0;
    this.cacheSamples.length = 0;
    this.cacheIndex = 0;
  }
}

function escLabel(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
