/**
 * ProviderRankingService
 *
 * Calculates deterministic 0-100 scores for providers and ranks them for
 * discovery queries.  All weights are defined as named constants so a single
 * change propagates to every calculation and to the breakdown explanation.
 *
 * Score components
 * ─────────────────
 *   Rating      40 %  – weighted average of review stars (Wilson lower bound)
 *   Engagement  30 %  – response rate, response speed, message volume
 *   Completeness 20 % – profile fields, photos, menu items
 *   Activity    10 %  – recency of last edit, post frequency
 *
 * Ranking modifiers (applied on top of the raw score when building a list)
 * ─────────────────────────────────────────────────────────────────────────
 *   +15 % verified provider
 *   +10 % within the requested radius (distance boost)
 *   + 5 % open right now
 *   +10 % new provider (joined within 30 days) – decaying linear ramp
 *   -10 % no response in past 72 h (engagement penalty)
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import type { Logger } from '@iraq-maps/observability';
import {
  providerTable,
  menuSectionTable,
  menuItemTable,
} from './schema.js';

// ─── Weight constants ─────────────────────────────────────────────────────────

const W_RATING      = 0.40;
const W_ENGAGEMENT  = 0.30;
const W_COMPLETENESS = 0.20;
const W_ACTIVITY    = 0.10;

// Ranking modifiers (fraction of the base score added)
const MOD_VERIFIED       = 0.15;
const MOD_NEARBY         = 0.10;
const MOD_OPEN_NOW       = 0.05;
const MOD_NEW_PROVIDER   = 0.15; // full boost within 30 days, linear decay
const MOD_NO_RESPONSE_72H = -0.10;

const NEW_PROVIDER_DAYS = 30;

// Completeness field weights (must sum to 1)
const COMPLETENESS_WEIGHTS = {
  name:        0.15,
  category:    0.10,
  phone:       0.10,
  hours:       0.10,
  location:    0.15,
  photos:      0.20, // up to 5 photos for full score
  menu:        0.20, // at least 3 menu items for full score
} as const;

// Engagement thresholds
const RESPONSE_RATE_FULL   = 0.80; // 80 % response rate → full score
const RESPONSE_HOURS_FAST  = 1;    // ≤ 1 h → full speed score
const RESPONSE_HOURS_SLOW  = 48;   // ≥ 48 h → zero speed score
const MESSAGE_VOLUME_FULL  = 50;   // 50 messages/month → full volume score

// Rating – Wilson lower-bound z value for 95 % confidence
const WILSON_Z = 1.96;
const MIN_REVIEWS_FOR_WILSON = 3;

// Activity thresholds
const ACTIVITY_DAYS_RECENT = 7;   // updated within 7 days → full recency score
const ACTIVITY_DAYS_STALE  = 90;  // not updated in 90 days → zero recency score

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = NodePgDatabase<any>;

export interface ScoreComponents {
  overall:            number;
  ratingScore:        number;
  engagementScore:    number;
  completenessScore:  number;
  activityScore:      number;
}

export interface ScoreBreakdown extends ScoreComponents {
  providerId: string;
  computedAt: Date;
  detail: {
    rating: RatingDetail;
    engagement: EngagementDetail;
    completeness: CompletenessDetail;
    activity: ActivityDetail;
  };
  tips: string[];
}

export interface RatingDetail {
  reviewCount:  number;
  averageStar:  number;
  wilsonLower:  number;
}

export interface EngagementDetail {
  responseRate:      number; // 0-1
  avgResponseHours:  number | null;
  monthlyMessages:   number;
}

export interface CompletenessDetail {
  hasName:     boolean;
  hasCategory: boolean;
  hasPhone:    boolean;
  hasHours:    boolean;
  hasLocation: boolean;
  photoCount:  number;
  menuItems:   number;
}

export interface ActivityDetail {
  daysSinceUpdate:  number;
  postsLastMonth:   number;
}

export interface RankedProvider {
  providerId:    string;
  name:          string;
  category:      string;
  baseScore:     number;
  rankedScore:   number;
  distanceM:     number | null;
  isVerified:    boolean;
  isOpenNow:     boolean;
  isNew:         boolean;
  modifiers:     RankModifier[];
}

export interface RankModifier {
  name:  string;
  delta: number; // fractional, e.g. 0.15
}

export interface GetRankedProvidersOptions {
  city:      string;
  category?: string;
  lat?:      number;
  lng?:      number;
  radiusM?:  number;
  limit?:    number;
  offset?:   number;
}

export interface ScoreHistoryPoint {
  recordedAt: Date;
  overall:    number;
}

export interface UpdateScoresResult {
  processed: number;
  errors:    number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ProviderRankingService {
  constructor(
    private readonly db: AnyDb,
    private readonly log?: Logger,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Calculate and persist the score for a single provider.
   * Returns the computed components.
   */
  async calculateProviderScore(providerId: string): Promise<ScoreComponents> {
    const [ratingScore, engagementScore, completenessScore, activityScore] =
      await Promise.all([
        this._ratingScore(providerId),
        this._engagementScore(providerId),
        this._completenessScore(providerId),
        this._activityScore(providerId),
      ]);

    const overall = clamp(
      ratingScore      * W_RATING      +
      engagementScore  * W_ENGAGEMENT  +
      completenessScore * W_COMPLETENESS +
      activityScore    * W_ACTIVITY,
      0,
      100,
    );

    const rounded: ScoreComponents = {
      overall:            round2(overall),
      ratingScore:        round2(ratingScore),
      engagementScore:    round2(engagementScore),
      completenessScore:  round2(completenessScore),
      activityScore:      round2(activityScore),
    };

    await this._upsertScore(providerId, rounded);

    this.log?.debug(
      { providerId, ...rounded },
      'provider score calculated',
    );

    return rounded;
  }

  /**
   * Return a ranked list of providers for the given city/category/location.
   * Uses pre-computed scores from `provider_score`; falls back to live
   * calculation if a provider has no cached score.
   */
  async getRankedProviders(
    opts: GetRankedProvidersOptions,
  ): Promise<RankedProvider[]> {
    const {
      city,
      category,
      lat,
      lng,
      radiusM = 5000,
      limit = 20,
      offset = 0,
    } = opts;

    const rows = await this._fetchProvidersWithScores(city, category, lat, lng, radiusM);

    const now = new Date();

    const ranked: RankedProvider[] = rows.map((row) => {
      const baseScore = row.overall ?? 0;
      const modifiers: RankModifier[] = [];
      let multiplier = 1.0;

      // Verified boost
      if (row.status === 'verified') {
        modifiers.push({ name: 'verified', delta: MOD_VERIFIED });
        multiplier += MOD_VERIFIED;
      }

      // Distance boost – linear from 0 at radius edge to full at centre
      if (lat !== undefined && lng !== undefined && row.distanceM !== null) {
        const proximity = Math.max(0, 1 - row.distanceM / radiusM);
        const distanceDelta = proximity * MOD_NEARBY;
        if (distanceDelta > 0.001) {
          modifiers.push({ name: 'nearby', delta: distanceDelta });
          multiplier += distanceDelta;
        }
      }

      // Open now boost
      const isOpenNow = isCurrentlyOpen(row.hoursRaw);
      if (isOpenNow) {
        modifiers.push({ name: 'openNow', delta: MOD_OPEN_NOW });
        multiplier += MOD_OPEN_NOW;
      }

      // New provider boost (linear decay over 30 days)
      const ageMs = now.getTime() - new Date(row.createdAt).getTime();
      const ageDays = ageMs / 86_400_000;
      const isNew = ageDays < NEW_PROVIDER_DAYS;
      if (isNew) {
        const decayFactor = 1 - ageDays / NEW_PROVIDER_DAYS;
        const newDelta = MOD_NEW_PROVIDER * decayFactor;
        modifiers.push({ name: 'newProvider', delta: newDelta });
        multiplier += newDelta;
      }

      // No-response penalty
      if (row.avgResponseHours !== null && row.avgResponseHours > 72) {
        modifiers.push({ name: 'slowResponse', delta: MOD_NO_RESPONSE_72H });
        multiplier += MOD_NO_RESPONSE_72H;
      }

      const rankedScore = clamp(round2(baseScore * multiplier), 0, 100);

      return {
        providerId:  row.id,
        name:        row.name,
        category:    row.category,
        baseScore:   round2(baseScore),
        rankedScore,
        distanceM:   row.distanceM ?? null,
        isVerified:  row.status === 'verified',
        isOpenNow,
        isNew,
        modifiers,
      };
    });

    ranked.sort((a, b) => b.rankedScore - a.rankedScore);

    return ranked.slice(offset, offset + limit);
  }

  /**
   * Return the full score breakdown with improvement tips for the provider
   * dashboard.
   */
  async getProviderScoreBreakdown(providerId: string): Promise<ScoreBreakdown> {
    const [
      ratingDetail,
      engagementDetail,
      completenessDetail,
      activityDetail,
    ] = await Promise.all([
      this._ratingDetail(providerId),
      this._engagementDetail(providerId),
      this._completenessDetail(providerId),
      this._activityDetail(providerId),
    ]);

    const ratingScore      = this._ratingFromDetail(ratingDetail);
    const engagementScore  = this._engagementFromDetail(engagementDetail);
    const completenessScore = this._completenessFromDetail(completenessDetail);
    const activityScore    = this._activityFromDetail(activityDetail);

    const overall = clamp(
      ratingScore      * W_RATING      +
      engagementScore  * W_ENGAGEMENT  +
      completenessScore * W_COMPLETENESS +
      activityScore    * W_ACTIVITY,
      0,
      100,
    );

    const tips = this._buildTips(
      ratingDetail,
      engagementDetail,
      completenessDetail,
      activityDetail,
    );

    return {
      providerId,
      computedAt:        new Date(),
      overall:           round2(overall),
      ratingScore:       round2(ratingScore),
      engagementScore:   round2(engagementScore),
      completenessScore: round2(completenessScore),
      activityScore:     round2(activityScore),
      detail: {
        rating:       ratingDetail,
        engagement:   engagementDetail,
        completeness: completenessDetail,
        activity:     activityDetail,
      },
      tips,
    };
  }

  /**
   * Recalculate scores for all active providers in batches of 100.
   * Called by the daily BullMQ worker.
   */
  async updateScores(): Promise<UpdateScoresResult> {
    const BATCH_SIZE = 100;
    let processed = 0;
    let errors = 0;
    let cursor = 0;

    this.log?.info('provider score update started');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await this.db
        .select({ id: providerTable.id })
        .from(providerTable)
        .where(
          sql`${providerTable.status} IN ('verified','pending')`,
        )
        .limit(BATCH_SIZE)
        .offset(cursor);

      if (batch.length === 0) break;

      for (const row of batch) {
        try {
          const scores = await this.calculateProviderScore(row.id);
          await this._appendHistory(row.id, scores);
          processed++;
        } catch (err) {
          errors++;
          this.log?.error({ err, providerId: row.id }, 'score calculation failed');
        }
      }

      cursor += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }

    // Purge history older than 90 days
    await this._purgeOldHistory();

    this.log?.info({ processed, errors }, 'provider score update complete');
    return { processed, errors };
  }

  /**
   * Return daily score snapshots for a provider over the past `days` days
   * (default 30).  Sorted oldest-first for charting.
   */
  async getScoreHistory(
    providerId: string,
    days = 30,
  ): Promise<ScoreHistoryPoint[]> {
    const since = new Date(Date.now() - days * 86_400_000);

    // Raw SQL: the history table is not in the Drizzle schema object yet.
    const rows = await this.db.execute<{ overall: string; recorded_at: string }>(
      sql`
        SELECT overall, recorded_at
        FROM providers.provider_score_history
        WHERE provider_id = ${providerId}
          AND recorded_at >= ${since.toISOString()}
        ORDER BY recorded_at ASC
      `,
    );

    return (rows as unknown as Array<{ overall: string; recorded_at: string }>).map((r) => ({
      recordedAt: new Date(r.recorded_at),
      overall:    parseFloat(r.overall),
    }));
  }

  // ── Rating component ────────────────────────────────────────────────────────

  /**
   * Wilson score lower bound gives a conservative estimate of the true rating
   * even with few reviews.  Normalised from [1,5] → [0,100].
   */
  private async _ratingScore(providerId: string): Promise<number> {
    const detail = await this._ratingDetail(providerId);
    return this._ratingFromDetail(detail);
  }

  private _ratingFromDetail(d: RatingDetail): number {
    if (d.reviewCount === 0) return 0;
    if (d.reviewCount < MIN_REVIEWS_FOR_WILSON) {
      // Simple average normalised for sparse reviews
      return clamp(((d.averageStar - 1) / 4) * 100, 0, 100);
    }
    // Wilson lower bound on a 1-5 star scale mapped to 0-1
    const p = (d.averageStar - 1) / 4;
    const n = d.reviewCount;
    const z = WILSON_Z;
    const z2 = z * z;
    const lower =
      (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) /
      (1 + z2 / n);
    return clamp(lower * 100, 0, 100);
  }

  private async _ratingDetail(providerId: string): Promise<RatingDetail> {
    const rows = await this.db.execute<{
      review_count: string;
      avg_star: string | null;
    }>(
      sql`
        SELECT COUNT(*)::text AS review_count,
               AVG(star_rating)::text AS avg_star
        FROM   places.review
        WHERE  provider_id = ${providerId}
          AND  deleted_at IS NULL
      `,
    );

    const row = (rows as unknown as Array<{ review_count: string; avg_star: string | null }>)[0];
    const reviewCount = row ? parseInt(row.review_count, 10) : 0;
    const averageStar = row?.avg_star ? parseFloat(row.avg_star) : 0;

    const wilsonLower =
      reviewCount >= MIN_REVIEWS_FOR_WILSON
        ? this._ratingFromDetail({ reviewCount, averageStar, wilsonLower: 0 })
        : 0;

    return { reviewCount, averageStar, wilsonLower };
  }

  // ── Engagement component ───────────────────────────────────────────────────

  private async _engagementScore(providerId: string): Promise<number> {
    const detail = await this._engagementDetail(providerId);
    return this._engagementFromDetail(detail);
  }

  private _engagementFromDetail(d: EngagementDetail): number {
    // Response rate sub-score (0-100)
    const rateScore = clamp((d.responseRate / RESPONSE_RATE_FULL) * 100, 0, 100);

    // Speed sub-score (0-100)
    let speedScore = 0;
    if (d.avgResponseHours !== null) {
      if (d.avgResponseHours <= RESPONSE_HOURS_FAST) {
        speedScore = 100;
      } else if (d.avgResponseHours >= RESPONSE_HOURS_SLOW) {
        speedScore = 0;
      } else {
        const range = RESPONSE_HOURS_SLOW - RESPONSE_HOURS_FAST;
        speedScore =
          (1 - (d.avgResponseHours - RESPONSE_HOURS_FAST) / range) * 100;
      }
    }

    // Volume sub-score (0-100)
    const volumeScore = clamp(
      (d.monthlyMessages / MESSAGE_VOLUME_FULL) * 100,
      0,
      100,
    );

    // Weighted: rate 50 %, speed 30 %, volume 20 %
    return clamp(
      rateScore * 0.5 + speedScore * 0.3 + volumeScore * 0.2,
      0,
      100,
    );
  }

  private async _engagementDetail(providerId: string): Promise<EngagementDetail> {
    // Response rate from provider table (updated by messaging module)
    const providerRow = await this.db
      .select({
        avgResponseHours: providerTable.avgResponseHours,
      })
      .from(providerTable)
      .where(eq(providerTable.id, providerId))
      .limit(1);

    const avgResponseHours = providerRow[0]?.avgResponseHours ?? null;

    // Monthly message volume
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const volumeRows = await this.db.execute<{ cnt: string }>(
      sql`
        SELECT COUNT(*)::text AS cnt
        FROM   messaging.thread_message
        WHERE  provider_id = ${providerId}
          AND  created_at  >= ${thirtyDaysAgo.toISOString()}
      `,
    );
    const monthlyMessages = parseInt(
      (volumeRows as unknown as Array<{ cnt: string }>)[0]?.cnt ?? '0',
      10,
    );

    // Response rate: fraction of threads with at least one provider reply
    const rateRows = await this.db.execute<{
      total: string;
      replied: string;
    }>(
      sql`
        SELECT COUNT(*)::text                                           AS total,
               COUNT(*) FILTER (WHERE provider_replied = true)::text   AS replied
        FROM   messaging.thread
        WHERE  provider_id = ${providerId}
          AND  created_at  >= ${thirtyDaysAgo.toISOString()}
      `,
    );
    const rateRow = (rateRows as unknown as Array<{ total: string; replied: string }>)[0];
    const total  = parseInt(rateRow?.total  ?? '0', 10);
    const replied = parseInt(rateRow?.replied ?? '0', 10);
    const responseRate = total > 0 ? replied / total : 0;

    return { responseRate, avgResponseHours, monthlyMessages };
  }

  // ── Completeness component ─────────────────────────────────────────────────

  private async _completenessScore(providerId: string): Promise<number> {
    const detail = await this._completenessDetail(providerId);
    return this._completenessFromDetail(detail);
  }

  private _completenessFromDetail(d: CompletenessDetail): number {
    const photoScore = clamp(d.photoCount / 5, 0, 1);   // 5 photos = full
    const menuScore  = clamp(d.menuItems  / 3, 0, 1);   // 3 items  = full

    return clamp(
      (d.hasName     ? COMPLETENESS_WEIGHTS.name     : 0) * 100 +
      (d.hasCategory ? COMPLETENESS_WEIGHTS.category : 0) * 100 +
      (d.hasPhone    ? COMPLETENESS_WEIGHTS.phone    : 0) * 100 +
      (d.hasHours    ? COMPLETENESS_WEIGHTS.hours    : 0) * 100 +
      (d.hasLocation ? COMPLETENESS_WEIGHTS.location : 0) * 100 +
      photoScore * COMPLETENESS_WEIGHTS.photos * 100 +
      menuScore  * COMPLETENESS_WEIGHTS.menu   * 100,
      0,
      100,
    );
  }

  private async _completenessDetail(providerId: string): Promise<CompletenessDetail> {
    const providerRows = await this.db
      .select({
        name:          providerTable.name,
        category:      providerTable.category,
        businessPhone: providerTable.businessPhone,
        hoursRaw:      providerTable.hoursRaw,
        location:      providerTable.location,
        photoAssetIds: providerTable.photoAssetIds,
      })
      .from(providerTable)
      .where(eq(providerTable.id, providerId))
      .limit(1);

    const p = providerRows[0];

    // Menu items count
    const menuRows = await this.db
      .select({ id: menuItemTable.id })
      .from(menuItemTable)
      .innerJoin(
        menuSectionTable,
        eq(menuItemTable.sectionId, menuSectionTable.id),
      )
      .where(eq(menuSectionTable.providerId, providerId))
      .limit(20);

    const photoAssetIds: string[] = p?.photoAssetIds
      ? JSON.parse(p.photoAssetIds as unknown as string)
      : [];

    return {
      hasName:     Boolean(p?.name?.trim()),
      hasCategory: Boolean(p?.category?.trim()),
      hasPhone:    Boolean(p?.businessPhone?.trim()),
      hasHours:    Boolean(p?.hoursRaw?.trim()),
      hasLocation: p?.location !== null && p?.location !== undefined,
      photoCount:  photoAssetIds.length,
      menuItems:   menuRows.length,
    };
  }

  // ── Activity component ─────────────────────────────────────────────────────

  private async _activityScore(providerId: string): Promise<number> {
    const detail = await this._activityDetail(providerId);
    return this._activityFromDetail(detail);
  }

  private _activityFromDetail(d: ActivityDetail): number {
    // Recency sub-score (0-100)
    let recencyScore: number;
    if (d.daysSinceUpdate <= ACTIVITY_DAYS_RECENT) {
      recencyScore = 100;
    } else if (d.daysSinceUpdate >= ACTIVITY_DAYS_STALE) {
      recencyScore = 0;
    } else {
      const range = ACTIVITY_DAYS_STALE - ACTIVITY_DAYS_RECENT;
      recencyScore =
        (1 - (d.daysSinceUpdate - ACTIVITY_DAYS_RECENT) / range) * 100;
    }

    // Posts frequency sub-score (0-100): 4 posts/month = full
    const postsScore = clamp((d.postsLastMonth / 4) * 100, 0, 100);

    return clamp(recencyScore * 0.7 + postsScore * 0.3, 0, 100);
  }

  private async _activityDetail(providerId: string): Promise<ActivityDetail> {
    const providerRows = await this.db
      .select({ updatedAt: providerTable.updatedAt })
      .from(providerTable)
      .where(eq(providerTable.id, providerId))
      .limit(1);

    const updatedAt = providerRows[0]?.updatedAt ?? new Date(0);
    const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / 86_400_000;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const postRows = await this.db.execute<{ cnt: string }>(
      sql`
        SELECT COUNT(*)::text AS cnt
        FROM   discover.post
        WHERE  provider_id = ${providerId}
          AND  created_at  >= ${thirtyDaysAgo.toISOString()}
          AND  deleted_at  IS NULL
      `,
    );
    const postsLastMonth = parseInt(
      (postRows as unknown as Array<{ cnt: string }>)[0]?.cnt ?? '0',
      10,
    );

    return { daysSinceUpdate, postsLastMonth };
  }

  // ── Tips generator ─────────────────────────────────────────────────────────

  private _buildTips(
    rating:       RatingDetail,
    engagement:   EngagementDetail,
    completeness: CompletenessDetail,
    activity:     ActivityDetail,
  ): string[] {
    const tips: string[] = [];

    // Rating tips
    if (rating.reviewCount < 5) {
      tips.push('tips.askForReviews');
    } else if (rating.averageStar < 4.0) {
      tips.push('tips.improveService');
    }

    // Engagement tips
    if (engagement.responseRate < 0.5) {
      tips.push('tips.respondToMessages');
    }
    if (engagement.avgResponseHours !== null && engagement.avgResponseHours > 24) {
      tips.push('tips.respondFaster');
    }

    // Completeness tips
    if (!completeness.hasPhone)    tips.push('tips.addPhone');
    if (!completeness.hasHours)    tips.push('tips.addHours');
    if (!completeness.hasLocation) tips.push('tips.addLocation');
    if (completeness.photoCount < 3) tips.push('tips.addPhotos');
    if (completeness.menuItems < 3)  tips.push('tips.addMenuItems');

    // Activity tips
    if (activity.daysSinceUpdate > 14) {
      tips.push('tips.updateProfile');
    }
    if (activity.postsLastMonth < 2) {
      tips.push('tips.postMore');
    }

    return tips;
  }

  // ── Persistence helpers ───────────────────────────────────────────────────

  private async _upsertScore(
    providerId: string,
    scores: ScoreComponents,
  ): Promise<void> {
    await this.db.execute(
      sql`
        INSERT INTO providers.provider_score
          (provider_id, overall, rating_score, engagement_score,
           completeness_score, activity_score, computed_at)
        VALUES (
          ${providerId},
          ${scores.overall},
          ${scores.ratingScore},
          ${scores.engagementScore},
          ${scores.completenessScore},
          ${scores.activityScore},
          now()
        )
        ON CONFLICT (provider_id) DO UPDATE SET
          overall            = EXCLUDED.overall,
          rating_score       = EXCLUDED.rating_score,
          engagement_score   = EXCLUDED.engagement_score,
          completeness_score = EXCLUDED.completeness_score,
          activity_score     = EXCLUDED.activity_score,
          computed_at        = now()
      `,
    );
  }

  private async _appendHistory(
    providerId: string,
    scores: ScoreComponents,
  ): Promise<void> {
    // One snapshot per day: skip if we already have a record for today
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const existing = await this.db.execute<{ cnt: string }>(
      sql`
        SELECT COUNT(*)::text AS cnt
        FROM   providers.provider_score_history
        WHERE  provider_id = ${providerId}
          AND  recorded_at >= ${today.toISOString()}
          AND  recorded_at <  ${tomorrow.toISOString()}
      `,
    );
    const cnt = parseInt(
      (existing as unknown as Array<{ cnt: string }>)[0]?.cnt ?? '0',
      10,
    );
    if (cnt > 0) return;

    await this.db.execute(
      sql`
        INSERT INTO providers.provider_score_history
          (provider_id, overall, rating_score, engagement_score,
           completeness_score, activity_score)
        VALUES (
          ${providerId},
          ${scores.overall},
          ${scores.ratingScore},
          ${scores.engagementScore},
          ${scores.completenessScore},
          ${scores.activityScore}
        )
      `,
    );
  }

  private async _purgeOldHistory(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 86_400_000);
    await this.db.execute(
      sql`
        DELETE FROM providers.provider_score_history
        WHERE recorded_at < ${cutoff.toISOString()}
      `,
    );
  }

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  private async _fetchProvidersWithScores(
    city: string,
    category: string | undefined,
    lat: number | undefined,
    lng: number | undefined,
    radiusM: number,
  ): Promise<Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    hoursRaw: string | null;
    avgResponseHours: number | null;
    createdAt: Date;
    overall: number | null;
    distanceM: number | null;
  }>> {
    const hasLocation = lat !== undefined && lng !== undefined;

    const rows = await this.db.execute<{
      id: string;
      name: string;
      category: string;
      status: string;
      hours_raw: string | null;
      avg_response_hours: number | null;
      created_at: string;
      overall: string | null;
      distance_m: string | null;
    }>(
      sql`
        SELECT
          p.id,
          p.name,
          p.category,
          p.status,
          p.hours_raw,
          p.avg_response_hours,
          p.created_at,
          COALESCE(ps.overall, 0)::numeric AS overall,
          ${hasLocation
            ? sql`ST_Distance(
                p.location::geography,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              )::numeric`
            : sql`NULL::numeric`} AS distance_m
        FROM  providers.provider p
        LEFT  JOIN providers.provider_score ps ON ps.provider_id = p.id
        WHERE p.status IN ('verified', 'pending')
          AND (
            ${category !== undefined ? sql`p.category = ${category}` : sql`TRUE`}
          )
          AND (
            ${hasLocation
              ? sql`
                  p.location IS NOT NULL AND
                  ST_DWithin(
                    p.location::geography,
                    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                    ${radiusM}
                  )
                `
              : sql`TRUE`}
          )
        LIMIT 200
      `,
    );

    return (rows as unknown as Array<{
      id: string;
      name: string;
      category: string;
      status: string;
      hours_raw: string | null;
      avg_response_hours: number | null;
      created_at: string;
      overall: string | null;
      distance_m: string | null;
    }>).map((r) => ({
      id:               r.id,
      name:             r.name,
      category:         r.category,
      status:           r.status,
      hoursRaw:         r.hours_raw,
      avgResponseHours: r.avg_response_hours,
      createdAt:        new Date(r.created_at),
      overall:          r.overall !== null ? parseFloat(r.overall) : null,
      distanceM:        r.distance_m !== null ? parseFloat(r.distance_m) : null,
    }));
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Very lightweight "is open now" check.
 * Accepts the OSM opening_hours format ("Mo-Fr 08:00-18:00; Sa 09:00-13:00").
 * Returns false when the string is absent or cannot be parsed.
 */
function isCurrentlyOpen(hoursRaw: string | null | undefined): boolean {
  if (!hoursRaw) return false;
  try {
    const now  = new Date();
    const dow  = now.getDay(); // 0 = Sunday
    const hhmm = now.getHours() * 60 + now.getMinutes();

    // Map OSM day abbreviations to JS getDay()
    const DAY_MAP: Record<string, number> = {
      Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6,
    };

    // Split on semicolons; each segment looks like "Mo-Fr 08:00-20:00"
    for (const segment of hoursRaw.split(';')) {
      const s = segment.trim();
      const m = s.match(/^([A-Za-z]{2})(?:-([A-Za-z]{2}))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      if (!m) continue;

      const [, startDay, endDay, openStr, closeStr] = m;
      const startDow = DAY_MAP[startDay ?? ''] ?? -1;
      const endDow   = endDay ? (DAY_MAP[endDay] ?? startDow) : startDow;

      const [oh, om] = (openStr ?? '').split(':').map(Number);
      const [ch, cm] = (closeStr ?? '').split(':').map(Number);
      const openMins  = (oh ?? 0) * 60 + (om ?? 0);
      const closeMins = (ch ?? 0) * 60 + (cm ?? 0);

      // Check day range (wraps Sunday=0)
      const inDayRange =
        startDow <= endDow
          ? dow >= startDow && dow <= endDow
          : dow >= startDow || dow <= endDow;

      if (inDayRange && hhmm >= openMins && hhmm < closeMins) return true;
    }
    return false;
  } catch {
    return false;
  }
}

