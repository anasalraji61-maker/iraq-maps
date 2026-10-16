/**
 * CrowdingService — heatmap data, per-place history, user reports.
 *
 * Design decisions:
 *  - In-memory store (matches the InsightsService pattern for M5 in-memory phase).
 *  - Estimate<T> is always populated with source + observedAt + confidence.
 *  - Iraq-specific boosts (Juma prayer for mosques, iftar rush for restaurants)
 *    are applied to historical pattern queries only — not to user-reported live data.
 *  - Baghdad UTC+3 offset used for all local-hour calculations.
 *  - No invented data: every returned estimate is based on real user reports or
 *    explicitly labelled as a 'heuristic' source with low confidence.
 */
import type { Clock, PlaceId } from '@iraq-maps/contracts';
import type { CrowdLevel } from '@iraq-maps/contracts';
import {
  IFTAR_BOOST,
  IFTAR_CATEGORIES,
  IFTAR_HOURS,
  JUMA_BOOST,
  JUMA_CATEGORIES,
  JUMA_DAY,
  JUMA_HOURS,
  parseBboxParam,
  type CrowdingArea,
  type CrowdingIntensity,
  type CrowdingPoint,
  type CrowdingReport,
  type CrowdingReportAck,
  type HeatmapResponse,
  type PlaceCrowdingHistory,
  type WeeklyPattern,
} from '@iraq-maps/contracts';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Baghdad is UTC+3. */
const BAGHDAD_OFFSET_HOURS = 3;

/** Live report decay: 60 minutes. */
const LIVE_DECAY_MS = 60 * 60 * 1000;

/** Minimum reports before we trust a pattern entry (below = heuristic). */
const MIN_PATTERN_REPORTS = 3;

/** Ring-buffer cap for raw reports. */
const MAX_RAW_REPORTS = 5_000;

/** XP awarded per crowding report. */
const REPORT_XP = 5;

/** Minimum data days before weeklyPattern is populated. */
const MIN_PATTERN_DAYS = 7;

// ── Internal types ────────────────────────────────────────────────────────────

interface RawReport {
  reportId: string;
  userId: string;
  placeId: string;
  /** Normalised intensity derived from level + optional count. */
  intensity: number;
  level: CrowdLevel;
  observedAt: Date;
  category?: string;
  /** lat/lng of the place (populated when place is geocoded). */
  lat?: number;
  lng?: number;
}

interface PlaceGeo {
  lat: number;
  lng: number;
  category?: string;
  nameAr?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelToIntensity(level: CrowdLevel, count?: number): number {
  if (count !== undefined) {
    // Cap at 500 people; beyond that treat as 1.0
    return Math.min(count / 500, 1);
  }
  return level === 'high' ? 0.85 : level === 'medium' ? 0.5 : 0.15;
}

function intensityToLevel(intensity: number): CrowdLevel {
  if (intensity >= 0.65) return 'high';
  if (intensity >= 0.35) return 'medium';
  return 'low';
}

/** Returns hour of day in Baghdad local time (0–23). */
function baghdadHour(d: Date): number {
  return (d.getUTCHours() + BAGHDAD_OFFSET_HOURS) % 24;
}

/** Returns day of week in Baghdad local time (0=Sun … 6=Sat). */
function baghdadDayOfWeek(d: Date): number {
  const utcDay = d.getUTCDay();
  // A day flip happens when adding offset crosses midnight.
  const utcHour = d.getUTCHours();
  if (utcHour + BAGHDAD_OFFSET_HOURS >= 24) {
    return (utcDay + 1) % 7;
  }
  return utcDay;
}

/** Applies Iraq-specific intensity boost for the category + local time. */
function applyIraqBoost(
  intensity: number,
  category: string | undefined,
  localHour: number,
  localDay: number,
  isRamadan: boolean,
): number {
  let multiplier = 1;

  if (category && JUMA_CATEGORIES.has(category) && localDay === JUMA_DAY && JUMA_HOURS.includes(localHour)) {
    multiplier = Math.max(multiplier, JUMA_BOOST);
  }

  if (isRamadan && category && IFTAR_CATEGORIES.has(category) && IFTAR_HOURS.includes(localHour)) {
    multiplier = Math.max(multiplier, IFTAR_BOOST);
  }

  return Math.min(intensity * multiplier, 1);
}

function randomUUID(): string {
  // Deterministic-enough UUID4 substitute for environments without crypto.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Check if a point [lng, lat] is inside a bbox [west, south, east, north]. */
function inBbox(lng: number, lat: number, bbox: readonly [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CrowdingService {
  /** Raw reports ring buffer. */
  private readonly reports: RawReport[] = [];

  /** Place geocache: placeId → {lat, lng, category, nameAr}. */
  private readonly placeGeo = new Map<string, PlaceGeo>();

  /** Area definitions registered via registerArea(). */
  private readonly areas = new Map<string, CrowdingArea>();

  /**
   * Whether Ramadan is active (set externally; activates iftar boost).
   * In production this is derived from an Islamic calendar library or env var.
   */
  private isRamadan = false;

  constructor(
    private readonly clock: Clock,
  ) {}

  // ── Place geo registration ─────────────────────────────────────────────────

  /**
   * Called by the places module (or test setup) to teach CrowdingService the
   * coordinates and category of a place. Reports without a registered geo are
   * included in history but excluded from heatmap point output.
   */
  registerPlaceGeo(placeId: PlaceId, geo: PlaceGeo): void {
    this.placeGeo.set(placeId, geo);
  }

  /** Register an area polygon for area stats queries. */
  registerArea(area: CrowdingArea): void {
    this.areas.set(area.id, area);
  }

  /** Toggle Ramadan mode (activates iftar boost). */
  setRamadan(active: boolean): void {
    this.isRamadan = active;
  }

  // ── User report submission ─────────────────────────────────────────────────

  /**
   * Accepts a crowding report from an authenticated user.
   * Returns an ack with the updated live estimate and XP reward.
   */
  submitReport(
    userId: string,
    report: CrowdingReport,
  ): CrowdingReportAck {
    const observedAt = report.observedAt ? new Date(report.observedAt) : this.clock.now();
    const intensity = levelToIntensity(report.level, report.observedCount);
    const geo = this.placeGeo.get(report.placeId);

    const raw: RawReport = {
      reportId: randomUUID(),
      userId,
      placeId: report.placeId,
      intensity,
      level: report.level,
      observedAt,
      category: geo?.category,
      lat: geo?.lat,
      lng: geo?.lng,
    };

    // Ring buffer
    if (this.reports.length >= MAX_RAW_REPORTS) {
      this.reports.splice(0, 1);
    }
    this.reports.push(raw);

    const updatedIntensity = this.computeLiveIntensity(report.placeId as PlaceId);

    return {
      reportId: raw.reportId,
      updatedIntensity,
      xpAwarded: REPORT_XP,
    };
  }

  // ── Live intensity ─────────────────────────────────────────────────────────

  /**
   * Returns the current (live) intensity estimate for a place.
   * Decay window: 60 min. Reports older than that are ignored.
   * Confidence grows with number of recent reports (capped at 0.92).
   */
  computeLiveIntensity(placeId: PlaceId): {
    value: CrowdingIntensity;
    source: 'user_report';
    observedAt: string;
    confidence: number;
  } | null {
    const now = this.clock.now();
    const cutoff = new Date(now.getTime() - LIVE_DECAY_MS);

    const recent = this.reports.filter(
      (r) => r.placeId === placeId && r.observedAt >= cutoff,
    );

    if (recent.length === 0) return null;

    // Average intensity, weighted by recency (newer = higher weight).
    let totalWeight = 0;
    let weightedSum = 0;
    for (const r of recent) {
      const ageMs = now.getTime() - r.observedAt.getTime();
      const weight = 1 - ageMs / LIVE_DECAY_MS;
      weightedSum += r.intensity * weight;
      totalWeight += weight;
    }

    const avgIntensity = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const confidence = Math.min(0.4 + recent.length * 0.12, 0.92);
    const latest = recent[recent.length - 1]!;

    return {
      value: avgIntensity as CrowdingIntensity,
      source: 'user_report',
      observedAt: latest.observedAt.toISOString(),
      confidence,
    };
  }

  // ── Heatmap ────────────────────────────────────────────────────────────────

  /**
   * Returns CrowdingPoint array for the given bbox.
   * When `time` is provided the service returns projected historical data;
   * otherwise live + historical blend is returned.
   *
   * Only places with a registered geo are emitted.
   */
  getHeatmapPoints(
    bboxRaw: string,
    time?: string,
    minIntensity = 0.1,
  ): HeatmapResponse {
    const bbox = parseBboxParam(bboxRaw);
    const now = this.clock.now();
    const isLive = !time;
    const targetTime = time ? new Date(time) : now;
    const localHour = baghdadHour(targetTime);
    const localDay = baghdadDayOfWeek(targetTime);

    const points: CrowdingPoint[] = [];
    let totalReports = 0;

    // Gather distinct places with geo data inside bbox.
    const placesInBox = [...this.placeGeo.entries()].filter(([, geo]) =>
      inBbox(geo.lng, geo.lat, bbox),
    );

    for (const [pid, geo] of placesInBox) {
      const placeId = pid as PlaceId;

      let intensity: number;
      let source: 'user_report' | 'heuristic';
      let confidence: number;
      let observedAt: string;

      if (isLive) {
        // Live: prefer real reports, fall back to pattern.
        const live = this.computeLiveIntensity(placeId);
        if (live) {
          intensity = live.value;
          source = 'user_report';
          confidence = live.confidence;
          observedAt = live.observedAt;
          totalReports++;
        } else {
          // No live data — use historical pattern for this hour/day.
          const pattern = this.buildWeeklyPattern(placeId);
          const score = pattern?.[localDay]?.[localHour] ?? null;
          if (score === null) continue;
          intensity = score / 100;
          source = 'heuristic';
          confidence = 0.25;
          observedAt = now.toISOString();
        }
      } else {
        // Historical projection.
        const pattern = this.buildWeeklyPattern(placeId);
        const score = pattern?.[localDay]?.[localHour] ?? null;
        if (score === null) continue;
        intensity = score / 100;
        source = 'heuristic';
        confidence = 0.35;
        observedAt = targetTime.toISOString();
      }

      // Apply Iraq-specific boost.
      intensity = applyIraqBoost(intensity, geo.category, localHour, localDay, this.isRamadan);

      if (intensity < minIntensity) continue;

      points.push({
        lng: geo.lng,
        lat: geo.lat,
        intensity: {
          value: intensity as CrowdingIntensity,
          source,
          observedAt,
          confidence,
        },
        placeId,
        category: geo.category,
      });
    }

    return {
      points,
      generatedAt: now.toISOString(),
      isLive,
      reportCount: totalReports,
    };
  }

  // ── Per-place history ──────────────────────────────────────────────────────

  /**
   * Full crowding history for a place: 7×24 pattern + best-time advice.
   * Aggregates all stored reports; patterns require MIN_PATTERN_DAYS of data.
   */
  getPlaceCrowding(placeId: PlaceId): PlaceCrowdingHistory {
    const now = this.clock.now();
    const placeReports = this.reports.filter((r) => r.placeId === placeId);

    const live = this.computeLiveIntensity(placeId);
    const weeklyPattern = this.buildWeeklyPattern(placeId);

    // Best time + peak
    let peakHour: number | null = null;
    let bestVisitWindow: [number, number] | null = null;
    let peakWaitMinutes = 0;

    if (weeklyPattern) {
      // Aggregate across all weekdays for today
      const today = baghdadDayOfWeek(now);
      const todayRow = weeklyPattern[today] ?? weeklyPattern[0]!;

      // Peak = highest-score hour between 6 and 22.
      let maxScore = -1;
      for (let h = 6; h <= 22; h++) {
        const s = todayRow[h] ?? 0;
        if (s > maxScore) { maxScore = s; peakHour = h; }
      }

      // Best window = consecutive 2-hour slot with lowest average (6 AM – 9 PM).
      let minAvg = Infinity;
      for (let h = 6; h <= 20; h++) {
        const avg = ((todayRow[h] ?? 0) + (todayRow[h + 1] ?? 0)) / 2;
        if (avg < minAvg) {
          minAvg = avg;
          bestVisitWindow = [h, h + 1];
        }
      }

      peakWaitMinutes = maxScore >= 70 ? 15 : maxScore >= 40 ? 7 : 2;
    }

    // Oldest data point
    const sorted = [...placeReports].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
    const dataFrom = sorted[0]?.observedAt.toISOString() ?? null;

    return {
      placeId,
      weeklyPattern,
      peakHour,
      bestVisitWindow,
      peakWaitMinutes,
      now: live,
      dataFrom,
      reportCount: placeReports.length,
      alternatives: [],
    };
  }

  // ── Area stats ─────────────────────────────────────────────────────────────

  /**
   * Returns area crowding stats for a named district/market/etc.
   * Aggregates all places whose geo falls within the area's polygon.
   */
  getAreaStats(areaId: string): {
    area: CrowdingArea;
    hotspots: Array<{ placeId: PlaceId; nameAr: string; intensity: { value: CrowdingIntensity; source: 'user_report' | 'heuristic'; observedAt: string; confidence: number } }>;
    weekOnWeekDelta: number | null;
  } | null {
    const area = this.areas.get(areaId);
    if (!area) return null;

    const now = this.clock.now();
    const localHour = baghdadHour(now);
    const localDay = baghdadDayOfWeek(now);

    // Find places inside the polygon (bbox approximation for MVP).
    const lngs = area.polygon.map(([lng]) => lng);
    const lats = area.polygon.map(([, lat]) => lat);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    const hotspots: Array<{ placeId: PlaceId; nameAr: string; intensity: { value: CrowdingIntensity; source: 'user_report' | 'heuristic'; observedAt: string; confidence: number } }> = [];

    for (const [pid, geo] of this.placeGeo.entries()) {
      if (!inBbox(geo.lng, geo.lat, [west, south, east, north])) continue;
      const placeId = pid as PlaceId;

      const live = this.computeLiveIntensity(placeId);
      if (!live) continue;

      hotspots.push({
        placeId,
        nameAr: geo.nameAr ?? '',
        intensity: live,
      });
    }

    // Sort by intensity desc, keep top 5.
    hotspots.sort((a, b) => b.intensity.value - a.intensity.value);
    const top5 = hotspots.slice(0, 5);

    // Week-on-week delta: compare report count this hour vs same slot last week.
    const thisWeekStart = new Date(now.getTime() - 60 * 60 * 1000);
    const lastWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
    const lastWeekEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const thisCount = this.reports.filter(
      (r) => r.observedAt >= thisWeekStart && r.observedAt <= now,
    ).length;
    const lastCount = this.reports.filter(
      (r) => r.observedAt >= lastWeekStart && r.observedAt <= lastWeekEnd,
    ).length;

    const weekOnWeekDelta =
      lastCount === 0 ? null : (thisCount - lastCount) / Math.max(lastCount, 1);

    // Update the area's currentIntensity in the stored definition.
    const avgIntensity =
      top5.length > 0
        ? top5.reduce((sum, h) => sum + h.intensity.value, 0) / top5.length
        : 0;

    const updatedArea: CrowdingArea = {
      ...area,
      currentIntensity:
        top5.length > 0
          ? {
              value: avgIntensity as CrowdingIntensity,
              source: 'user_report',
              observedAt: now.toISOString(),
              confidence: Math.min(0.4 + top5.length * 0.1, 0.85),
            }
          : null,
    };

    // Apply Iraq-specific boost to area for display.
    if (updatedArea.currentIntensity) {
      const boosted = applyIraqBoost(
        updatedArea.currentIntensity.value,
        area.type === 'religious_site' ? 'mosque' : undefined,
        localHour,
        localDay,
        this.isRamadan,
      );
      updatedArea.currentIntensity = {
        ...updatedArea.currentIntensity,
        value: boosted as CrowdingIntensity,
      };
    }

    return {
      area: updatedArea,
      hotspots: top5,
      weekOnWeekDelta: weekOnWeekDelta !== null ? Math.max(-1, Math.min(1, weekOnWeekDelta)) : null,
    };
  }

  // ── Pattern builder ────────────────────────────────────────────────────────

  /**
   * Builds a 7×24 crowd-score matrix (weekday × hour, Baghdad UTC+3, 0–100).
   * Returns null when there is less than MIN_PATTERN_DAYS of data.
   */
  buildWeeklyPattern(placeId: PlaceId): WeeklyPattern | null {
    const placeReports = this.reports.filter((r) => r.placeId === placeId);
    if (placeReports.length === 0) return null;

    // Check span of data.
    const oldestMs = Math.min(...placeReports.map((r) => r.observedAt.getTime()));
    const newestMs = Math.max(...placeReports.map((r) => r.observedAt.getTime()));
    const spanDays = (newestMs - oldestMs) / (24 * 60 * 60 * 1000);
    if (spanDays < MIN_PATTERN_DAYS && placeReports.length < MIN_PATTERN_REPORTS) {
      return null;
    }

    // Accumulate sum and count per [day][hour] cell.
    const sums: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    const counts: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

    for (const r of placeReports) {
      const d = baghdadDayOfWeek(r.observedAt);
      const h = baghdadHour(r.observedAt);
      sums[d]![h]! += r.intensity * 100;
      counts[d]![h]! += 1;
    }

    const pattern: number[][] = sums.map((dayRow, d) =>
      dayRow.map((s, h) => (counts[d]![h]! > 0 ? Math.round(s / counts[d]![h]!) : 0)),
    );

    return pattern as WeeklyPattern;
  }

  // ── Least-crowded alternatives ─────────────────────────────────────────────

  /**
   * Given a place, returns up to `limit` alternative places in the same
   * category with lower current intensity, within `radiusDeg` degrees (≈ bbox).
   */
  findAlternatives(placeId: PlaceId, limit = 3, radiusDeg = 0.05): PlaceId[] {
    const geo = this.placeGeo.get(placeId);
    if (!geo) return [];

    const targetLive = this.computeLiveIntensity(placeId);
    const targetIntensity = targetLive?.value ?? 1;

    const candidates: Array<{ pid: PlaceId; intensity: number }> = [];

    for (const [pid, g] of this.placeGeo.entries()) {
      if (pid === placeId) continue;
      if (g.category !== geo.category) continue;
      const dLng = Math.abs(g.lng - geo.lng);
      const dLat = Math.abs(g.lat - geo.lat);
      if (dLng > radiusDeg || dLat > radiusDeg) continue;

      const live = this.computeLiveIntensity(pid as PlaceId);
      const intensity = live?.value ?? 0;
      if (intensity < targetIntensity) {
        candidates.push({ pid: pid as PlaceId, intensity });
      }
    }

    candidates.sort((a, b) => a.intensity - b.intensity);
    return candidates.slice(0, limit).map((c) => c.pid);
  }

  // ── getCrowdingNow ─────────────────────────────────────────────────────────

  /**
   * Best current estimate for a place: merges live reports (high weight)
   * with historical pattern for this hour (lower weight) when live data is sparse.
   */
  getCrowdingNow(placeId: PlaceId): {
    value: CrowdingIntensity;
    level: CrowdLevel;
    source: 'user_report' | 'heuristic';
    observedAt: string;
    confidence: number;
  } | null {
    const now = this.clock.now();
    const localHour = baghdadHour(now);
    const localDay = baghdadDayOfWeek(now);
    const geo = this.placeGeo.get(placeId);

    const live = this.computeLiveIntensity(placeId);
    const pattern = this.buildWeeklyPattern(placeId);
    const historicalScore = pattern?.[localDay]?.[localHour];

    if (!live && historicalScore === undefined) return null;

    let intensity: number;
    let source: 'user_report' | 'heuristic';
    let confidence: number;

    if (live && historicalScore !== undefined) {
      // Blend: 70 % live + 30 % historical.
      intensity = live.value * 0.7 + (historicalScore / 100) * 0.3;
      source = 'user_report';
      confidence = Math.min(live.confidence * 0.85 + 0.1, 0.9);
    } else if (live) {
      intensity = live.value;
      source = 'user_report';
      confidence = live.confidence;
    } else {
      intensity = (historicalScore ?? 0) / 100;
      source = 'heuristic';
      confidence = 0.3;
    }

    // Iraq-specific boost.
    intensity = applyIraqBoost(intensity, geo?.category, localHour, localDay, this.isRamadan);
    intensity = Math.min(intensity, 1);

    return {
      value: intensity as CrowdingIntensity,
      level: intensityToLevel(intensity),
      source,
      observedAt: live?.observedAt ?? now.toISOString(),
      confidence,
    };
  }

  // ── Aggregate (scheduled job) ─────────────────────────────────────────────

  /**
   * Periodic aggregate: prunes reports older than 90 days.
   * Returns how many were pruned.
   */
  pruneOldReports(maxAgeDays = 90): number {
    const cutoff = new Date(this.clock.now().getTime() - maxAgeDays * 24 * 60 * 60 * 1000);
    const before = this.reports.length;
    const pruned = this.reports.filter((r) => r.observedAt < cutoff);
    if (pruned.length > 0) {
      this.reports.splice(0, this.reports.length, ...this.reports.filter((r) => r.observedAt >= cutoff));
    }
    return before - this.reports.length;
  }

  /** Returns total live report count in the store. */
  totalReports(): number {
    return this.reports.length;
  }
}
