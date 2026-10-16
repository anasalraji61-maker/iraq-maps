import type { CrowdLevel, InsightsPort, InsightsSummary, PlaceId, PlaceInsights, PriceLevel } from '@iraq-maps/contracts';
import type { Clock } from '@iraq-maps/contracts';
import type { Estimate } from '@iraq-maps/contracts';

/** How long a crowded_now report influences the estimate (60 minutes). */
const CROWDED_DECAY_MS = 60 * 60 * 1000;
/** How long a price report is considered recent (7 days). */
const PRICE_RECENT_MS = 7 * 24 * 60 * 60 * 1000;
/** Max stored raw reports per place (ring buffer). */
const MAX_RAW_REPORTS = 500;

export interface CrowdingHistoryEntry {
  hour: number;
  dayOfWeek: number;
  level: CrowdLevel;
  observedAt: string;
  confidence: number;
}

export interface PriceReport {
  item: string;
  priceIqd: number;
  observedAt: string;
  userId: string;
  confidence: number;
}

export interface PriceHistoryEntry {
  item: string;
  priceIqd: number;
  observedAt: string;
  confidence: number;
}

export interface PeakHoursData {
  /** hour 0–23 → average crowd score 0–100 */
  byHour: number[];
  /** dayOfWeek 0(Sun)–6(Sat) → average crowd score 0–100 */
  byDay: number[];
  /** Recommended hour range: [start, end] inclusive */
  bestTimeHour: [number, number];
  /** Worst hour of the day */
  peakHour: number;
  estimatedWaitMinutes: number;
}

export interface InsightStats {
  placeId: PlaceId;
  visitCount: number;
  avgRating: number | null;
  crowdingTrend: 'increasing' | 'stable' | 'decreasing';
  crowdingNow: Estimate<CrowdLevel> | null;
  priceLevel: Estimate<PriceLevel> | null;
  reportCount: number;
  lastActivityAt: string | null;
}

export interface PriceSuggestion {
  item: string;
  /** Approximate IQD range */
  minIqd: number;
  maxIqd: number;
  avgIqd: number;
  reportCount: number;
}

/** Raw crowd report stored in memory. */
interface RawCrowdReport {
  userId: string;
  placeId: string;
  level: CrowdLevel;
  count: number;
  reportedAt: Date;
}

/** Raw price report stored in memory. */
interface RawPriceReport {
  userId: string;
  placeId: string;
  item: string;
  priceIqd: number;
  reportedAt: Date;
}

/**
 * In-memory insights store.
 * Each reported crowded_now entry decays after CROWDED_DECAY_MS.
 * Price reports are kept as-is; the most recent one wins for the summary.
 */
export class InsightsService implements InsightsPort {
  private readonly crowdedReports = new Map<string, Date[]>();
  private readonly priceReports = new Map<string, { level: PriceLevel; reportedAt: Date }>();

  /** Raw crowd reports for history queries */
  private readonly rawCrowdReports: RawCrowdReport[] = [];
  /** Raw price reports for history queries */
  private readonly rawPriceReports: RawPriceReport[] = [];
  /** Aggregated peak hours per place */
  private readonly peakHoursCache = new Map<string, PeakHoursData>();
  /** Visit counts per place (incremented on each getInsights call) */
  private readonly visitCounts = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  async getInsights(placeId: PlaceId): Promise<PlaceInsights> {
    const now = this.clock.now();

    // Increment visit tracking
    this.visitCounts.set(placeId, (this.visitCounts.get(placeId) ?? 0) + 1);

    // ── Crowding ──────────────────────────────────────────────────────────────
    const reports = (this.crowdedReports.get(placeId) ?? []).filter(
      (d) => now.getTime() - d.getTime() < CROWDED_DECAY_MS,
    );
    if (reports.length > 0) {
      this.crowdedReports.set(placeId, reports);
    } else {
      this.crowdedReports.delete(placeId);
    }

    const crowding =
      reports.length > 0
        ? ({
            value: (reports.length >= 3 ? 'high' : 'medium') as CrowdLevel,
            source: 'user_report' as const,
            observedAt: reports[reports.length - 1]!.toISOString(),
            confidence: Math.min(0.5 + reports.length * 0.1, 0.9),
          } as const)
        : null;

    // ── Price level ───────────────────────────────────────────────────────────
    const priceReport = this.priceReports.get(placeId);
    const priceLevel = priceReport
      ? ({
          value: priceReport.level,
          source: 'user_report' as const,
          observedAt: priceReport.reportedAt.toISOString(),
          confidence: 0.6,
        } as const)
      : null;

    return { placeId, crowding, priceLevel };
  }

  async reportCrowded(placeId: PlaceId, reportedAt: Date): Promise<void> {
    const existing = this.crowdedReports.get(placeId) ?? [];
    this.crowdedReports.set(placeId, [...existing, reportedAt]);
  }

  async reportPrice(placeId: PlaceId, priceLevel: PriceLevel, reportedAt: Date): Promise<void> {
    this.priceReports.set(placeId, { level: priceLevel, reportedAt });
  }

  // ── Extended Methods ──────────────────────────────────────────────────────

  /**
   * Returns historical crowding entries for a place over the last `days` days.
   * Each entry carries hour/dayOfWeek so the client can build a heat-map.
   */
  getCrowdingHistory(placeId: PlaceId, days: number): CrowdingHistoryEntry[] {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return this.rawCrowdReports
      .filter((r) => r.placeId === placeId && r.reportedAt >= cutoff)
      .map((r) => ({
        hour: r.reportedAt.getHours(),
        dayOfWeek: r.reportedAt.getDay(),
        level: r.level,
        observedAt: r.reportedAt.toISOString(),
        confidence: Math.min(0.4 + r.count * 0.05, 0.85),
      }));
  }

  /**
   * Computes or retrieves peak hours for a place from historical data.
   * Returns 24-slot hourly distribution and per-day distribution.
   */
  getPeakHours(placeId: PlaceId): PeakHoursData {
    const cached = this.peakHoursCache.get(placeId);
    if (cached) return cached;

    const history = this.getCrowdingHistory(placeId, 90);
    const byHourSum = new Array<number>(24).fill(0);
    const byHourCount = new Array<number>(24).fill(0);
    const byDaySum = new Array<number>(7).fill(0);
    const byDayCount = new Array<number>(7).fill(0);

    for (const entry of history) {
      const score = entry.level === 'high' ? 90 : entry.level === 'medium' ? 50 : 15;
      byHourSum[entry.hour]! += score;
      byHourCount[entry.hour]! += 1;
      byDaySum[entry.dayOfWeek]! += score;
      byDayCount[entry.dayOfWeek]! += 1;
    }

    const byHour = byHourSum.map((s, i) => (byHourCount[i]! > 0 ? Math.round(s / byHourCount[i]!) : 0));
    const byDay = byDaySum.map((s, i) => (byDayCount[i]! > 0 ? Math.round(s / byDayCount[i]!) : 0));

    // Best time = consecutive 2-hour window with lowest average
    let bestTimeHour: [number, number] = [8, 10];
    let minScore = Infinity;
    for (let h = 6; h <= 20; h++) {
      const avg = ((byHour[h] ?? 0) + (byHour[h + 1] ?? 0)) / 2;
      if (avg < minScore) {
        minScore = avg;
        bestTimeHour = [h, h + 1];
      }
    }

    const peakHour = byHour.reduce((maxH, v, h) => (v > (byHour[maxH] ?? 0) ? h : maxH), 0);
    const peakScore = byHour[peakHour] ?? 0;
    const estimatedWaitMinutes = peakScore > 70 ? 15 : peakScore > 40 ? 7 : 2;

    const data: PeakHoursData = { byHour, byDay, bestTimeHour, peakHour, estimatedWaitMinutes };
    this.peakHoursCache.set(placeId, data);
    return data;
  }

  /**
   * User submits a crowding report with optional observed-count.
   * Evicts peak-hours cache for the place.
   */
  submitCrowdingReport(userId: string, placeId: PlaceId, level: CrowdLevel, count: number): void {
    const now = this.clock.now();
    // Maintain ring buffer
    if (this.rawCrowdReports.length >= MAX_RAW_REPORTS) {
      this.rawCrowdReports.splice(0, 1);
    }
    this.rawCrowdReports.push({ userId, placeId, level, count, reportedAt: now });
    // Also update legacy map for getInsights compatibility
    const existing = this.crowdedReports.get(placeId) ?? [];
    this.crowdedReports.set(placeId, [...existing, now]);
    // Evict cache
    this.peakHoursCache.delete(placeId);
  }

  /**
   * Returns price history for a place, optionally filtered by item category.
   */
  getPriceHistory(placeId: PlaceId, category?: string): PriceHistoryEntry[] {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - PRICE_RECENT_MS);
    return this.rawPriceReports
      .filter(
        (r) =>
          r.placeId === placeId &&
          r.reportedAt >= cutoff &&
          (category === undefined || r.item.toLowerCase().includes(category.toLowerCase())),
      )
      .map((r) => ({
        item: r.item,
        priceIqd: r.priceIqd,
        observedAt: r.reportedAt.toISOString(),
        confidence: 0.65,
      }))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  }

  /**
   * User submits a price report for a specific item.
   */
  submitPriceReport(userId: string, placeId: PlaceId, item: string, priceIqd: number): void {
    const now = this.clock.now();
    if (this.rawPriceReports.length >= MAX_RAW_REPORTS) {
      this.rawPriceReports.splice(0, 1);
    }
    this.rawPriceReports.push({ userId, placeId, item: item.trim(), priceIqd, reportedAt: now });
    // Map a price level bucket for legacy compatibility
    const level: PriceLevel =
      priceIqd < 5000 ? 'budget' : priceIqd < 20000 ? 'mid_range' : priceIqd < 60000 ? 'expensive' : 'luxury';
    this.priceReports.set(placeId, { level, reportedAt: now });
  }

  /**
   * Combined stats for a place: visits, avg rating placeholder, crowding trend, report count.
   */
  getInsightStats(placeId: PlaceId): InsightStats {
    const now = this.clock.now();

    // Crowding now
    const activeCrowd = (this.crowdedReports.get(placeId) ?? []).filter(
      (d) => now.getTime() - d.getTime() < CROWDED_DECAY_MS,
    );
    const crowdingNow: Estimate<CrowdLevel> | null =
      activeCrowd.length > 0
        ? {
            value: activeCrowd.length >= 3 ? 'high' : 'medium',
            source: 'user_report',
            observedAt: activeCrowd[activeCrowd.length - 1]!.toISOString(),
            confidence: Math.min(0.5 + activeCrowd.length * 0.1, 0.9),
          }
        : null;

    // Price
    const priceReport = this.priceReports.get(placeId);
    const priceLevel: Estimate<PriceLevel> | null = priceReport
      ? { value: priceReport.level, source: 'user_report', observedAt: priceReport.reportedAt.toISOString(), confidence: 0.6 }
      : null;

    // Trend: compare reports in last 2h vs 2h before that
    const cutoff2h = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const cutoff4h = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const recentCount = this.rawCrowdReports.filter(
      (r) => r.placeId === placeId && r.reportedAt >= cutoff2h,
    ).length;
    const olderCount = this.rawCrowdReports.filter(
      (r) => r.placeId === placeId && r.reportedAt >= cutoff4h && r.reportedAt < cutoff2h,
    ).length;
    const crowdingTrend: 'increasing' | 'stable' | 'decreasing' =
      recentCount > olderCount + 1 ? 'increasing' : olderCount > recentCount + 1 ? 'decreasing' : 'stable';

    // All reports combined
    const allReports = this.rawCrowdReports.filter((r) => r.placeId === placeId);
    const allPriceReports = this.rawPriceReports.filter((r) => r.placeId === placeId);
    const reportCount = allReports.length + allPriceReports.length;

    // Last activity
    const lastCrowd = allReports[allReports.length - 1]?.reportedAt;
    const lastPrice = allPriceReports[allPriceReports.length - 1]?.reportedAt;
    let lastActivityAt: string | null = null;
    if (lastCrowd && lastPrice) {
      lastActivityAt = lastCrowd > lastPrice ? lastCrowd.toISOString() : lastPrice.toISOString();
    } else if (lastCrowd) {
      lastActivityAt = lastCrowd.toISOString();
    } else if (lastPrice) {
      lastActivityAt = lastPrice.toISOString();
    }

    return {
      placeId,
      visitCount: this.visitCounts.get(placeId) ?? 0,
      avgRating: null,
      crowdingTrend,
      crowdingNow,
      priceLevel,
      reportCount,
      lastActivityAt,
    };
  }

  /**
   * Returns price suggestions (aggregated ranges) for common items at a place.
   */
  getPriceSuggestions(placeId: PlaceId): PriceSuggestion[] {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - PRICE_RECENT_MS);
    const relevant = this.rawPriceReports.filter(
      (r) => r.placeId === placeId && r.reportedAt >= cutoff,
    );
    const byItem = new Map<string, number[]>();
    for (const r of relevant) {
      const arr = byItem.get(r.item) ?? [];
      arr.push(r.priceIqd);
      byItem.set(r.item, arr);
    }
    return [...byItem.entries()]
      .map(([item, prices]) => {
        const sorted = [...prices].sort((a, b) => a - b);
        const sum = sorted.reduce((s, p) => s + p, 0);
        return {
          item,
          minIqd: sorted[0]!,
          maxIqd: sorted[sorted.length - 1]!,
          avgIqd: Math.round(sum / sorted.length),
          reportCount: sorted.length,
        };
      })
      .sort((a, b) => b.reportCount - a.reportCount);
  }

  /**
   * Hourly aggregation job: recomputes peak-hours for all places with recent data.
   * Called by a scheduler; returns how many places were updated.
   */
  aggregateInsights(): number {
    this.peakHoursCache.clear();
    const placesWithData = new Set([
      ...this.rawCrowdReports.map((r) => r.placeId),
    ]);
    for (const placeId of placesWithData) {
      // Warm the cache
      this.getPeakHours(placeId as PlaceId);
    }
    return placesWithData.size;
  }

  /** Returns a summary suitable for the admin panel. */
  getSummary(): InsightsSummary {
    const now = this.clock.now();

    const recentPriceReports = [...this.priceReports.entries()]
      .filter(([, v]) => now.getTime() - v.reportedAt.getTime() < 24 * 60 * 60 * 1000)
      .map(([placeId, v]) => ({ placeId: placeId as PlaceId, priceLevel: v.level, observedAt: v.reportedAt.toISOString() }))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .slice(0, 20);

    const recentCrowdingReports = [...this.crowdedReports.entries()]
      .map(([placeId, dates]) => {
        const active = dates.filter((d) => now.getTime() - d.getTime() < CROWDED_DECAY_MS);
        if (active.length === 0) return null;
        return {
          placeId: placeId as PlaceId,
          reportCount: active.length,
          lastObservedAt: active[active.length - 1]!.toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.reportCount - a.reportCount)
      .slice(0, 20);

    const mostReportedCategories: { category: string; count: number }[] = [];
    return { mostReportedCategories, recentPriceReports, recentCrowdingReports };
  }
}
