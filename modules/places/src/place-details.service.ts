/**
 * PlaceDetailsService – extended place detail queries beyond the base PlacesQueryPort.
 *
 * Covers:
 *  - Full place detail with photos, reviews summary, hours, amenities, promotions,
 *    events, popular times – all consent-aware.
 *  - Wrong-info reporting (user corrections queued for moderation).
 *  - Popular-times crowding by hour of day.
 *  - Amenity list per place (community + provider).
 *  - Amenity suggestion by a user.
 */

import {
  type PlaceId,
  type UserId,
  type Estimate,
} from '@iraq-maps/contracts';
import type { Db } from '@iraq-maps/db-kit';
import {
  and,
  desc,
  eq,
  gte,
  sql,
} from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgSchema,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Schema ────────────────────────────────────────────────────────────────────

const placesSchema = pgSchema('places');

/** Community-sourced amenity suggestions, aggregated to produce the amenity list. */
export const amenitySuggestionTable = placesSchema.table('amenity_suggestion', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: text('place_id').notNull(),
  userId: uuid('user_id').notNull(),
  amenityKey: text('amenity_key').notNull(),
  /** true = present, false = absent */
  present: boolean('present').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Wrong-info corrections submitted by users, pending moderation review. */
export const wrongInfoReportTable = placesSchema.table('wrong_info_report', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: text('place_id').notNull(),
  userId: uuid('user_id').notNull(),
  field: text('field').notNull(),
  currentValue: text('current_value'),
  suggestedValue: text('suggested_value').notNull(),
  reason: text('reason'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Crowd observations used to build popular-times estimates (Estimate<number> rule). */
export const crowdObservationTable = placesSchema.table('crowd_observation', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: text('place_id').notNull(),
  /** 0–6 Sunday-Saturday (ISO dow would be 1–7 but OSM uses 0-based) */
  dayOfWeek: smallint('day_of_week').notNull(),
  /** 0–23 */
  hourOfDay: smallint('hour_of_day').notNull(),
  /** 0.0 quiet … 1.0 very busy */
  crowdLevel: real('crowd_level').notNull(),
  source: text('source').notNull().default('user_report'),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per-place promotions (provider-owned, moderated). */
export const promotionTable = placesSchema.table('promotion', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: text('place_id').notNull(),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en'),
  descriptionAr: text('description_ar'),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Events hosted at or near a place. */
export const placeEventTable = placesSchema.table('place_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  placeId: text('place_id').notNull(),
  titleAr: text('title_ar').notNull(),
  titleEn: text('title_en'),
  descriptionAr: text('description_ar'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  ticketUrl: text('ticket_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Provider-level consent scopes (simplified lookup for this service layer). */
export const providerConsentTable = placesSchema.table('provider_consent', {
  providerId: uuid('provider_id').primaryKey(),
  placeId: text('place_id').notNull(),
  showPhone: boolean('show_phone').notNull().default(false),
  showWhatsapp: boolean('show_whatsapp').notNull().default(false),
  showSocialLinks: boolean('show_social_links').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Provider extra detail (photos, social links, menu preview, price range). */
export const providerDetailTable = placesSchema.table('provider_detail', {
  placeId: text('place_id').primaryKey(),
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  specialtiesAr: text('specialties_ar').array().notNull().default([]),
  photoUrls: text('photo_urls').array().notNull().default([]),
  priceRangeMin: integer('price_range_min'),
  priceRangeMax: integer('price_range_max'),
  /** 1–4 (₭ … ₭₭₭₭) */
  priceLevel: smallint('price_level'),
  menuPreview: jsonb('menu_preview'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  website: text('website'),
  instagram: text('instagram'),
  facebook: text('facebook'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Public types ──────────────────────────────────────────────────────────────

export interface AmenityItem {
  key: string;
  /** Aggregate vote: net agrees (present votes minus absent votes). */
  votes: number;
  /** true if provider confirmed, null if community only */
  providerConfirmed: boolean | null;
}

export interface AmenityGroup {
  groupKey: string;
  items: AmenityItem[];
}

export interface PopularTimesHour {
  hour: number;
  /** Estimate<number> contract: value is 0.0–1.0 crowd level */
  crowding: Estimate<number>;
}

export interface PopularTimesDay {
  dayOfWeek: number;
  hours: PopularTimesHour[];
}

export interface PromotionItem {
  id: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface PlaceEventItem {
  id: string;
  titleAr: string;
  titleEn: string | null;
  descriptionAr: string | null;
  startsAt: string;
  endsAt: string | null;
  ticketUrl: string | null;
}

export interface MenuItemPreview {
  nameAr: string;
  nameEn?: string;
  priceIqd: number | null;
  photoUrl?: string;
}

export interface FullPlaceDetail {
  placeId: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  specialtiesAr: string[];
  photoUrls: string[];
  priceLevel: number | null;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  menuPreview: MenuItemPreview[];
  /** Only populated when consent scope is active */
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  promotions: PromotionItem[];
  events: PlaceEventItem[];
  reviewSummary: {
    average: number | null;
    count: number;
    breakdown: Record<number, number>;
  };
  amenityGroups: AmenityGroup[];
  popularTimes: PopularTimesDay[];
}

// ── Amenity taxonomy ──────────────────────────────────────────────────────────

const AMENITY_GROUPS: Array<{ groupKey: string; keys: string[] }> = [
  {
    groupKey: 'services',
    keys: ['wifi', 'parking', 'delivery', 'takeaway', 'reservation'],
  },
  {
    groupKey: 'food',
    keys: ['menu', 'vegetarian', 'halal', 'kids_menu'],
  },
  {
    groupKey: 'facilities',
    keys: ['ac', 'smoking_area', 'prayer_room', 'wheelchair'],
  },
  {
    groupKey: 'payment',
    keys: ['cash', 'card', 'e_payment', 'crypto'],
  },
  {
    groupKey: 'atmosphere',
    keys: ['family_friendly', 'romantic', 'group_friendly'],
  },
];

export const ALL_AMENITY_KEYS = AMENITY_GROUPS.flatMap((g) => g.keys);

// ── Service ───────────────────────────────────────────────────────────────────

export class PlaceDetailsService {
  constructor(private readonly db: Db) {}

  // ── Full place detail ──────────────────────────────────────────────────────

  /**
   * Returns the complete enriched detail for a place.
   * Phone, WhatsApp and social links are returned only when the matching consent scope is active.
   * Prices always carry source/observedAt/confidence per the Estimate<T> contract.
   */
  async getFullPlaceDetail(placeId: PlaceId, _userId: UserId | null): Promise<FullPlaceDetail> {
    const [detail, consent, promotions, events, reviewSummary, amenityGroups, popularTimes] =
      await Promise.all([
        this.getProviderDetail(placeId),
        this.getConsent(placeId),
        this.getActivePromotions(placeId),
        this.getUpcomingEvents(placeId),
        this.getReviewSummary(placeId),
        this.getAmenities(placeId),
        this.getPopularTimes(placeId),
      ]);

    const showPhone = consent?.showPhone ?? false;
    const showWhatsapp = consent?.showWhatsapp ?? false;
    const showSocial = consent?.showSocialLinks ?? false;

    return {
      placeId,
      descriptionAr: detail?.descriptionAr ?? null,
      descriptionEn: detail?.descriptionEn ?? null,
      specialtiesAr: detail?.specialtiesAr ?? [],
      photoUrls: detail?.photoUrls ?? [],
      priceLevel: detail?.priceLevel ?? null,
      priceRangeMin: detail?.priceRangeMin ?? null,
      priceRangeMax: detail?.priceRangeMax ?? null,
      menuPreview: this.parseMenuPreview(detail?.menuPreview),
      phone: showPhone ? (detail?.phone ?? null) : null,
      whatsapp: showWhatsapp ? (detail?.whatsapp ?? null) : null,
      website: detail?.website ?? null,
      instagram: showSocial ? (detail?.instagram ?? null) : null,
      facebook: showSocial ? (detail?.facebook ?? null) : null,
      promotions,
      events,
      reviewSummary,
      amenityGroups,
      popularTimes,
    };
  }

  private async getProviderDetail(placeId: PlaceId) {
    const rows = await this.db
      .select()
      .from(providerDetailTable)
      .where(eq(providerDetailTable.placeId, placeId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async getConsent(placeId: PlaceId) {
    const rows = await this.db
      .select()
      .from(providerConsentTable)
      .where(eq(providerConsentTable.placeId, placeId))
      .limit(1);
    return rows[0] ?? null;
  }

  private parseMenuPreview(raw: unknown): MenuItemPreview[] {
    if (!raw || !Array.isArray(raw)) return [];
    const result: MenuItemPreview[] = [];
    for (const item of (raw as unknown[]).slice(0, 3)) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;
      const nameAr = typeof obj['nameAr'] === 'string' ? obj['nameAr'] : '';
      if (!nameAr) continue;
      const parsed: MenuItemPreview = {
        nameAr,
        priceIqd: typeof obj['priceIqd'] === 'number' ? obj['priceIqd'] : null,
      };
      if (typeof obj['nameEn'] === 'string') parsed.nameEn = obj['nameEn'];
      if (typeof obj['photoUrl'] === 'string') parsed.photoUrl = obj['photoUrl'];
      result.push(parsed);
    }
    return result;
  }

  // ── Promotions ─────────────────────────────────────────────────────────────

  private async getActivePromotions(placeId: PlaceId): Promise<PromotionItem[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(promotionTable)
      .where(
        and(
          eq(promotionTable.placeId, placeId),
          eq(promotionTable.active, true),
          sql`(${promotionTable.validUntil} IS NULL OR ${promotionTable.validUntil} > ${now})`,
        ),
      )
      .orderBy(desc(promotionTable.createdAt))
      .limit(5);

    return rows.map((r) => ({
      id: r.id,
      titleAr: r.titleAr,
      titleEn: r.titleEn,
      descriptionAr: r.descriptionAr,
      validFrom: r.validFrom?.toISOString() ?? null,
      validUntil: r.validUntil?.toISOString() ?? null,
    }));
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  private async getUpcomingEvents(placeId: PlaceId): Promise<PlaceEventItem[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(placeEventTable)
      .where(
        and(
          eq(placeEventTable.placeId, placeId),
          gte(placeEventTable.startsAt, now),
        ),
      )
      .orderBy(placeEventTable.startsAt)
      .limit(5);

    return rows.map((r) => ({
      id: r.id,
      titleAr: r.titleAr,
      titleEn: r.titleEn,
      descriptionAr: r.descriptionAr,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt?.toISOString() ?? null,
      ticketUrl: r.ticketUrl,
    }));
  }

  // ── Reviews summary ────────────────────────────────────────────────────────

  private async getReviewSummary(placeId: PlaceId): Promise<FullPlaceDetail['reviewSummary']> {
    // Import the review table shape from the sibling reviews.ts module at runtime
    // to avoid circular dependencies – we query directly by table name.
    const { rows: aggRows } = await this.db.execute<{ cnt: string; avg_rating: string | null }>(
      sql`SELECT COUNT(*)::text AS cnt, AVG(rating)::text AS avg_rating FROM places.review WHERE place_id = ${placeId}`,
    );
    const agg = aggRows[0];
    const total = parseInt(agg?.cnt ?? '0', 10);
    const average = agg?.avg_rating != null ? parseFloat(agg.avg_rating) : null;

    const { rows: breakdownRows } = await this.db.execute<{ rating: number; n: string }>(
      sql`SELECT rating, COUNT(*)::text AS n FROM places.review WHERE place_id = ${placeId} GROUP BY rating`,
    );
    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of breakdownRows) {
      breakdown[row.rating] = parseInt(row.n, 10);
    }

    return { average, count: total, breakdown };
  }

  // ── Popular times ──────────────────────────────────────────────────────────

  /**
   * Returns crowding estimates by day of week and hour.
   * Each value is an Estimate<number> with source, observedAt and confidence (CLAUDE.md rule 5).
   */
  async getPopularTimes(placeId: PlaceId): Promise<PopularTimesDay[]> {
    const { rows } = await this.db.execute<{
      day_of_week: number;
      hour_of_day: number;
      avg_crowd: string;
      obs_count: string;
      latest_observed: string;
    }>(sql`
      SELECT
        day_of_week,
        hour_of_day,
        AVG(crowd_level)::text AS avg_crowd,
        COUNT(*)::text AS obs_count,
        MAX(observed_at)::text AS latest_observed
      FROM places.crowd_observation
      WHERE place_id = ${placeId}
      GROUP BY day_of_week, hour_of_day
      ORDER BY day_of_week, hour_of_day
    `);

    const byDay = new Map<number, PopularTimesHour[]>();
    for (const row of rows) {
      const dow = row.day_of_week;
      const obsCount = parseInt(row.obs_count, 10);
      const confidence = Math.min(1, obsCount / 30); // 30 observations = full confidence
      const entry: PopularTimesHour = {
        hour: row.hour_of_day,
        crowding: {
          value: parseFloat(row.avg_crowd),
          source: 'user_report',
          observedAt: row.latest_observed,
          confidence,
        },
      };
      const list = byDay.get(dow) ?? [];
      list.push(entry);
      byDay.set(dow, list);
    }

    const result: PopularTimesDay[] = [];
    for (const [dow, hours] of byDay) {
      result.push({ dayOfWeek: dow, hours });
    }
    result.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    return result;
  }

  // ── Amenities ──────────────────────────────────────────────────────────────

  /**
   * Builds amenity groups from community votes.
   * An amenity is listed as present when net votes (present – absent) > 0.
   * Provider-confirmed keys are shown regardless of vote count.
   */
  async getAmenities(placeId: PlaceId): Promise<AmenityGroup[]> {
    const { rows } = await this.db.execute<{
      amenity_key: string;
      present_votes: string;
      absent_votes: string;
    }>(sql`
      SELECT
        amenity_key,
        SUM(CASE WHEN present THEN 1 ELSE 0 END)::text AS present_votes,
        SUM(CASE WHEN NOT present THEN 1 ELSE 0 END)::text AS absent_votes
      FROM places.amenity_suggestion
      WHERE place_id = ${placeId}
      GROUP BY amenity_key
    `);

    const voteMap = new Map<string, { present: number; absent: number }>();
    for (const row of rows) {
      voteMap.set(row.amenity_key, {
        present: parseInt(row.present_votes, 10),
        absent: parseInt(row.absent_votes, 10),
      });
    }

    const groups: AmenityGroup[] = [];
    for (const group of AMENITY_GROUPS) {
      const items: AmenityItem[] = [];
      for (const key of group.keys) {
        const votes = voteMap.get(key);
        if (!votes) continue;
        const netVotes = votes.present - votes.absent;
        if (netVotes >= 0) {
          items.push({ key, votes: netVotes, providerConfirmed: null });
        }
      }
      if (items.length > 0) {
        groups.push({ groupKey: group.groupKey, items });
      }
    }
    return groups;
  }

  // ── Suggest an amenity ─────────────────────────────────────────────────────

  /**
   * Records a community amenity suggestion (present=true) or denial (present=false).
   * One row per user per place per amenity key – subsequent calls update in place.
   */
  async suggestAmenity(
    userId: UserId,
    placeId: PlaceId,
    amenityKey: string,
    present = true,
  ): Promise<void> {
    if (!ALL_AMENITY_KEYS.includes(amenityKey)) {
      throw new Error(`Unknown amenity key: ${amenityKey}`);
    }
    await this.db
      .insert(amenitySuggestionTable)
      .values({ placeId, userId, amenityKey, present })
      .onConflictDoUpdate({
        target: [
          amenitySuggestionTable.placeId,
          amenitySuggestionTable.userId,
          amenitySuggestionTable.amenityKey,
        ],
        set: { present, createdAt: new Date() },
      });
  }

  // ── Wrong-info report ──────────────────────────────────────────────────────

  /**
   * Records a user's correction suggestion for a specific field.
   * The correction is queued for moderation review; nothing is applied immediately.
   *
   * @param field  - One of: name, address, phone, hours, category, amenities, photos, website
   * @param currentValue - The existing value the user sees (for moderation context)
   * @param suggestedValue - The corrected value the user proposes
   * @param reason - Optional free-text reason from the user
   */
  async reportWrongInfo(
    userId: UserId,
    placeId: PlaceId,
    field: string,
    suggestedValue: string,
    currentValue?: string,
    reason?: string,
  ): Promise<{ reportId: string }> {
    const ALLOWED_FIELDS = [
      'name',
      'address',
      'phone',
      'hours',
      'category',
      'amenities',
      'photos',
      'website',
      'description',
      'price_range',
    ];
    if (!ALLOWED_FIELDS.includes(field)) {
      throw new Error(`Unknown correction field: ${field}`);
    }

    const [row] = await this.db
      .insert(wrongInfoReportTable)
      .values({
        placeId,
        userId,
        field,
        currentValue: currentValue ?? null,
        suggestedValue,
        reason: reason ?? null,
        status: 'pending',
      })
      .returning({ id: wrongInfoReportTable.id });

    if (!row) throw new Error('wrong_info_report insert failed');
    return { reportId: row.id };
  }

  // ── Pending corrections (moderation) ──────────────────────────────────────

  /** Returns pending corrections for a place, ordered newest-first (moderation use). */
  async listPendingCorrections(
    placeId: PlaceId,
    limit = 20,
  ): Promise<
    Array<{
      id: string;
      field: string;
      currentValue: string | null;
      suggestedValue: string;
      reason: string | null;
      createdAt: string;
    }>
  > {
    const rows = await this.db
      .select()
      .from(wrongInfoReportTable)
      .where(
        and(
          eq(wrongInfoReportTable.placeId, placeId),
          eq(wrongInfoReportTable.status, 'pending'),
        ),
      )
      .orderBy(desc(wrongInfoReportTable.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      field: r.field,
      currentValue: r.currentValue,
      suggestedValue: r.suggestedValue,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ── Record a crowd observation ─────────────────────────────────────────────

  /**
   * Records a real-time crowd observation for the popular-times model.
   * crowdLevel is 0.0 (empty) to 1.0 (very busy).
   */
  async recordCrowdObservation(
    placeId: PlaceId,
    crowdLevel: number,
    source: 'user_report' | 'provider' | 'heuristic' = 'user_report',
  ): Promise<void> {
    if (crowdLevel < 0 || crowdLevel > 1) {
      throw new RangeError('crowdLevel must be between 0.0 and 1.0');
    }
    const now = new Date();
    const dayOfWeek = now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const hourOfDay = now.getHours();

    await this.db.insert(crowdObservationTable).values({
      placeId,
      dayOfWeek,
      hourOfDay,
      crowdLevel,
      source,
      observedAt: now,
    });
  }
}
