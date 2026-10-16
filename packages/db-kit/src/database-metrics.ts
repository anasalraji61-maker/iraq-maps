/**
 * Query-timing metrics collector for PostgreSQL.
 *
 * Usage:
 *   const metrics = new DatabaseMetrics();
 *   const end = metrics.startQuery('places', 'search');
 *   await db.execute(query);
 *   end();
 *
 * Metrics are reported via the observability package when METRICS_ENABLED=true.
 */

export interface QueryMetric {
  schema: string;
  operation: string;
  durationMs: number;
  ok: boolean;
  timestamp: Date;
}

export interface QueryStats {
  schema: string;
  operation: string;
  count: number;
  errorCount: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

const MAX_SAMPLES = 1000;

/**
 * In-memory ring buffer of query timing samples, with per-(schema, operation) percentile stats.
 * Thread-safe (single-threaded JS event loop); no external dependencies.
 */
export class DatabaseMetrics {
  private readonly samples: QueryMetric[] = [];
  private sampleIndex = 0;

  /**
   * Starts timing a query.
   * @returns A callback to call when the query finishes. Pass `ok = false` if it threw.
   */
  startQuery(schema: string, operation: string): (ok?: boolean) => void {
    const start = Date.now();
    return (ok = true) => {
      const metric: QueryMetric = {
        schema,
        operation,
        durationMs: Date.now() - start,
        ok,
        timestamp: new Date(),
      };
      if (this.samples.length < MAX_SAMPLES) {
        this.samples.push(metric);
      } else {
        this.samples[this.sampleIndex % MAX_SAMPLES] = metric;
        this.sampleIndex++;
      }
    };
  }

  /**
   * Wraps an async function, recording its duration automatically.
   */
  async wrap<T>(schema: string, operation: string, fn: () => Promise<T>): Promise<T> {
    const end = this.startQuery(schema, operation);
    try {
      const result = await fn();
      end(true);
      return result;
    } catch (err) {
      end(false);
      throw err;
    }
  }

  /**
   * Returns aggregated statistics for all tracked (schema, operation) pairs.
   */
  getStats(): QueryStats[] {
    type Bucket = {
      durations: number[];
      errorCount: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const s of this.samples) {
      const key = `${s.schema}:${s.operation}`;
      let b = buckets.get(key);
      if (!b) {
        b = { durations: [], errorCount: 0 };
        buckets.set(key, b);
      }
      b.durations.push(s.durationMs);
      if (!s.ok) b.errorCount++;
    }

    return Array.from(buckets.entries()).map(([key, b]) => {
      const [schema, operation] = key.split(':') as [string, string];
      const sorted = [...b.durations].sort((a, c) => a - c);
      const n = sorted.length;
      return {
        schema,
        operation,
        count: n,
        errorCount: b.errorCount,
        sumMs: sorted.reduce((acc, v) => acc + v, 0),
        minMs: sorted[0] ?? 0,
        maxMs: sorted[n - 1] ?? 0,
        p50Ms: percentile(sorted, 50),
        p95Ms: percentile(sorted, 95),
        p99Ms: percentile(sorted, 99),
      };
    });
  }

  /**
   * Exports all stats in Prometheus text exposition format.
   * The prefix is `db_query` to avoid collisions with app-level metrics.
   */
  toPrometheusText(): string {
    const stats = this.getStats();
    if (stats.length === 0) return '';

    const lines: string[] = [
      '# HELP db_query_duration_ms Database query duration in milliseconds',
      '# TYPE db_query_duration_ms summary',
      '# HELP db_query_total Total number of database queries',
      '# TYPE db_query_total counter',
      '# HELP db_query_errors_total Total number of failed database queries',
      '# TYPE db_query_errors_total counter',
    ];

    for (const s of stats) {
      const labels = `schema="${s.schema}",operation="${s.operation}"`;
      lines.push(`db_query_total{${labels}} ${s.count}`);
      lines.push(`db_query_errors_total{${labels}} ${s.errorCount}`);
      lines.push(`db_query_duration_ms{${labels},quantile="0.5"} ${s.p50Ms}`);
      lines.push(`db_query_duration_ms{${labels},quantile="0.95"} ${s.p95Ms}`);
      lines.push(`db_query_duration_ms{${labels},quantile="0.99"} ${s.p99Ms}`);
      lines.push(`db_query_duration_ms_sum{${labels}} ${s.sumMs}`);
      lines.push(`db_query_duration_ms_count{${labels}} ${s.count}`);
    }

    return lines.join('\n') + '\n';
  }

  /** Clears all collected samples. */
  reset(): void {
    this.samples.length = 0;
    this.sampleIndex = 0;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}
