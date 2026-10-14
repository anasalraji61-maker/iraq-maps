import type { CrowdLevel, InsightsPort, PlaceId, PlaceInsights, PriceLevel } from '@iraq-maps/contracts';
import type { Clock } from '@iraq-maps/contracts';

/** How long a crowded_now report influences the estimate (60 minutes). */
const CROWDED_DECAY_MS = 60 * 60 * 1000;

/**
 * In-memory insights store.
 * Each reported crowded_now entry decays after CROWDED_DECAY_MS.
 * Price reports are kept as-is; the most recent one wins.
 */
export class InsightsService implements InsightsPort {
  private readonly crowdedReports = new Map<string, Date[]>();
  private readonly priceReports = new Map<string, { level: PriceLevel; reportedAt: Date }>();

  constructor(private readonly clock: Clock) {}

  async getInsights(placeId: PlaceId): Promise<PlaceInsights> {
    const now = this.clock.now();

    // ── Crowding ──────────────────────────────────────────────────────────────
    const reports = (this.crowdedReports.get(placeId) ?? []).filter((d) => now.getTime() - d.getTime() < CROWDED_DECAY_MS);
    // Evict stale entries
    if (reports.length > 0) {
      this.crowdedReports.set(placeId, reports);
    } else {
      this.crowdedReports.delete(placeId);
    }

    // Confidence grows with report count (caps at 0.9); single report = 0.5.
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
}
