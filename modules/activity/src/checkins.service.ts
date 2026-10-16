/**
 * CheckInsService — all check-in gamification logic.
 *
 * Responsibilities:
 *   - Record a check-in, enforcing the 24-h anti-cheat cooldown per place.
 *   - Maintain consecutive-day streaks in Baghdad timezone (Asia/Baghdad, UTC+3).
 *   - Evaluate all 20 badge conditions after every check-in.
 *   - Publish an `activity.checkin.created.v1` event through the outbox.
 *   - Serve history, badge list, streak and leaderboard queries.
 *
 * Conventions:
 *   - "Baghdad day" = calendar date in Asia/Baghdad (UTC+3).  A streak is a
 *     sequence of consecutive Baghdad calendar days, each with ≥1 check-in.
 *   - All timestamps stored in the DB are UTC ISO-8601.
 *   - Drizzle queries stay inside this service; no raw SQL outside helpers.
 */

import {
  type CheckIn,
  type CheckInMethod,
  type CheckInRequest,
  type CheckInResponse,
  type Badge,
  type BadgeSlug,
  type Streak,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type LeaderboardTimeframe,
  type PlaceId,
  type UserId,
  type Paginated,
} from '@iraq-maps/contracts';

// ─── Baghdad timezone constant ────────────────────────────────────────────────

const BAGHDAD_TZ = 'Asia/Baghdad'; // UTC+3, no DST

/** Return the Baghdad calendar date string (YYYY-MM-DD) for a UTC timestamp. */
function baghdadDate(utcIso: string): string {
  const d = new Date(utcIso);
  // Intl.DateTimeFormat with timeZone is available in V8/Hermes.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BAGHDAD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '';
  const da = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${mo}-${da}`;
}

/** Return baghdadDate for right now. */
function todayBaghdad(): string {
  return baghdadDate(new Date().toISOString());
}

/** Count calendar days between two YYYY-MM-DD strings (a − b). */
function daysDiff(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(a) - Date.parse(b)) / msPerDay);
}

/** True when a UTC ISO timestamp falls within the current Ramadan window.
 *  This is a simplified heuristic for 2024–2026; a real implementation
 *  would look up the exact Hijri calendar. */
function isRamadan(utcIso: string): boolean {
  const d = new Date(utcIso);
  const y = d.getUTCFullYear();
  // Approximate Ramadan windows (Gregorian):
  const windows: Record<number, [string, string]> = {
    2024: ['2024-03-11', '2024-04-09'],
    2025: ['2025-03-01', '2025-03-29'],
    2026: ['2026-02-18', '2026-03-19'],
  };
  const win = windows[y];
  if (!win) return false;
  const iso = utcIso.slice(0, 10);
  return iso >= win[0] && iso <= win[1];
}

/** True when the Baghdad date is the hour-range for a "night owl" badge (00:00–02:59). */
function isNightOwlHour(utcIso: string): boolean {
  const d = new Date(utcIso);
  // Baghdad = UTC+3
  const baghdadHour = (d.getUTCHours() + 3) % 24;
  return baghdadHour >= 0 && baghdadHour < 3;
}

/** True when the Baghdad hour is before 07:00. */
function isEarlyBird(utcIso: string): boolean {
  const d = new Date(utcIso);
  const baghdadHour = (d.getUTCHours() + 3) % 24;
  return baghdadHour >= 4 && baghdadHour < 7;
}

/** True when the Baghdad day is Friday (يوم الجمعة). */
function isFriday(utcIso: string): boolean {
  const d = new Date(utcIso);
  // Baghdad = UTC+3
  const baghdadDay = new Date(d.getTime() + 3 * 3600_000).getUTCDay();
  return baghdadDay === 5; // 0=Sun, 5=Fri
}

// ─── Fake place info type (replaced by real PlacesPort lookup in production) ──

interface PlaceInfo {
  id: PlaceId;
  name_ar: string;
  category: string | null;   // e.g. "restaurant", "mosque", "cafe"
  citySlug: string | null;
  firstCheckInAt: string | null; // null = no prior check-ins, i.e. pioneer
}

// ─── DB row types (thin wrappers over Drizzle return shapes) ─────────────────

interface CheckInRow {
  id: string;
  userId: string;
  placeId: string;
  timestamp: string;
  method: string;
  note: string | null;
  photos: string[];
  placeName: string;
  placeCategory: string | null;
  citySlug: string | null;
  visitCount: number;
  isPioneer: boolean;
}

interface BadgeRow {
  id: string;
  userId: string;
  slug: string;
  earnedAt: string;
}

interface StreakRow {
  userId: string;
  current: number;
  longest: number;
  lastCheckIn: string | null;
}

// ─── Port interfaces (implemented by the infra layer) ────────────────────────

/** Minimal DB port consumed by this service. */
export interface CheckInDb {
  /** Insert and return a new check-in row. */
  insertCheckIn(row: Omit<CheckInRow, 'id'>): Promise<CheckInRow>;
  /** Find the most recent check-in by the user at the place. */
  findLastCheckIn(userId: string, placeId: string): Promise<CheckInRow | null>;
  /** Count visits by the user at the place (including the new one). */
  countUserPlaceVisits(userId: string, placeId: string): Promise<number>;
  /** Paginated check-in history for the user. */
  listUserCheckIns(userId: string, cursor: string | null, limit: number): Promise<{ rows: CheckInRow[]; nextCursor: string | null }>;
  /** Paginated check-in list at a place. */
  listPlaceCheckIns(placeId: string, cursor: string | null, limit: number): Promise<{ rows: CheckInRow[]; nextCursor: string | null }>;
  /** All check-ins for the user (used for badge evaluation — only IDs+timestamps+meta). */
  allUserCheckInMeta(userId: string): Promise<Array<{ placeId: string; timestamp: string; category: string | null; citySlug: string | null }>>;
  /** Get or create streak row. */
  getStreak(userId: string): Promise<StreakRow>;
  /** Upsert streak row. */
  saveStreak(row: StreakRow): Promise<void>;
  /** Badge rows earned by this user. */
  getUserBadges(userId: string): Promise<BadgeRow[]>;
  /** Insert a badge earned row. */
  awardBadge(userId: string, slug: string): Promise<BadgeRow>;
  /** Check-ins on a given Baghdad date. */
  countCheckInsOnDate(userId: string, baghdadDate: string): Promise<number>;
  /** Count distinct place IDs on a given Baghdad date. */
  countDistinctPlacesOnDate(userId: string, baghdadDate: string): Promise<number>;
  /** Count check-ins by category. */
  countByCategory(userId: string, category: string): Promise<number>;
  /** Count check-ins in a specific city. */
  countByCity(userId: string, citySlug: string): Promise<number>;
  /** Count distinct cities where the user has checked in. */
  countDistinctCities(userId: string): Promise<number>;
  /** Count check-ins on Fridays. */
  countFridayCheckIns(userId: string): Promise<number>;
  /** True when there is any check-in at this place before the given timestamp. */
  placeHasPriorCheckIn(placeId: string, beforeTimestamp: string): Promise<boolean>;
  /** Leaderboard query. */
  leaderboard(timeframe: LeaderboardTimeframe, limit: number): Promise<Array<{ userId: string; checkInCount: number; badgeCount: number }>>;
  /** Get display info for user IDs (name, avatar). */
  getUserDisplayInfo(userIds: string[]): Promise<Array<{ userId: string; displayName: string; avatarAssetId: string | null }>>;
  /** Total check-in count for a user. */
  totalCheckIns(userId: string): Promise<number>;
}

/** Outbox event publisher port. */
export interface EventPublisher {
  publish(event: {
    type: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/** Places lookup port — thin adapter over the places module. */
export interface PlacesLookup {
  getPlace(placeId: PlaceId): Promise<PlaceInfo | null>;
}

// ─── Badge catalogue ──────────────────────────────────────────────────────────

interface BadgeDef {
  slug: BadgeSlug;
  title_ar: string;
  title_en: string;
  description_ar: string;
  description_en: string;
  icon: string;
  hint_ar: string;
  hint_en: string;
  targetCount: number;
}

const BADGE_CATALOGUE: BadgeDef[] = [
  {
    slug: 'first_checkin',
    title_ar: 'أول زيارة',
    title_en: 'First Visit',
    description_ar: 'سجّلت أول زيارة لك في التطبيق. هذه بداية مغامرتك!',
    description_en: 'You recorded your very first check-in. Your adventure begins!',
    icon: '🌟',
    hint_ar: 'سجّل أول زيارة لك في أي مكان.',
    hint_en: 'Check in to any place for the first time.',
    targetCount: 1,
  },
  {
    slug: 'restaurant_lover',
    title_ar: 'عاشق المطاعم',
    title_en: 'Restaurant Lover',
    description_ar: 'زرت 10 مطاعم مختلفة — ذوقك رفيع!',
    description_en: 'You checked in to 10 restaurants. Quite the foodie!',
    icon: '🍽️',
    hint_ar: 'سجّل 10 زيارات في المطاعم.',
    hint_en: 'Check in to 10 restaurants.',
    targetCount: 10,
  },
  {
    slug: 'shrine_visitor',
    title_ar: 'زائر الأضرحة',
    title_en: 'Shrine Visitor',
    description_ar: 'زرت 5 أضرحة ومساجد — روح طيبة تسكنك.',
    description_en: 'You visited 5 shrines or mosques. A spiritual soul.',
    icon: '🕌',
    hint_ar: 'سجّل 5 زيارات في الأضرحة أو المساجد.',
    hint_en: 'Check in to 5 shrines or mosques.',
    targetCount: 5,
  },
  {
    slug: 'explorer',
    title_ar: 'مستكشف',
    title_en: 'Explorer',
    description_ar: 'زرت 3 أماكن مختلفة في يوم واحد — لا تعرف الملل!',
    description_en: 'You visited 3 different places in a single day. Non-stop explorer!',
    icon: '🎯',
    hint_ar: 'سجّل 3 زيارات في أماكن مختلفة في يوم واحد.',
    hint_en: 'Check in to 3 different places in one day.',
    targetCount: 3,
  },
  {
    slug: 'streak_7',
    title_ar: 'متواصل',
    title_en: 'On a Roll',
    description_ar: '7 أيام متتالية من الزيارات — أنت منتظم رائع!',
    description_en: '7 consecutive days of check-ins. You are unstoppable!',
    icon: '🔥',
    hint_ar: 'سجّل زيارة يومياً لمدة 7 أيام متتالية.',
    hint_en: 'Check in every day for 7 consecutive days.',
    targetCount: 7,
  },
  {
    slug: 'streak_30',
    title_ar: 'الأسطورة',
    title_en: 'Legend',
    description_ar: '30 يوماً متتالياً! إرادة حديدية وعزم لا يلين.',
    description_en: '30 consecutive days of check-ins. An iron will!',
    icon: '💎',
    hint_ar: 'سجّل زيارة يومياً لمدة 30 يوماً متتالياً.',
    hint_en: 'Check in every day for 30 consecutive days.',
    targetCount: 30,
  },
  {
    slug: 'baghdad_king',
    title_ar: 'ملك بغداد',
    title_en: 'King of Baghdad',
    description_ar: '100 زيارة في بغداد — هذه المدينة تعرفك!',
    description_en: '100 check-ins in Baghdad. The city knows you!',
    icon: '👑',
    hint_ar: 'سجّل 100 زيارة في بغداد.',
    hint_en: 'Check in 100 times in Baghdad.',
    targetCount: 100,
  },
  {
    slug: 'ramadan_visitor',
    title_ar: 'زائر رمضان',
    title_en: 'Ramadan Visitor',
    description_ar: 'سجّلت زيارة خلال شهر رمضان المبارك. رمضان كريم!',
    description_en: 'You checked in during the holy month of Ramadan. Ramadan Kareem!',
    icon: '🌙',
    hint_ar: 'سجّل زيارة في شهر رمضان.',
    hint_en: 'Check in during Ramadan.',
    targetCount: 1,
  },
  {
    slug: 'pioneer',
    title_ar: 'رائد',
    title_en: 'Pioneer',
    description_ar: 'كنت أول من سجّل زيارة في هذا المكان. أنت رائد!',
    description_en: 'You were the first to check in at this place. A true pioneer!',
    icon: '⭐',
    hint_ar: 'كن أول شخص يسجّل زيارة في أي مكان.',
    hint_en: 'Be the first to check in at any place.',
    targetCount: 1,
  },
  {
    slug: 'regular',
    title_ar: 'زبون دائم',
    title_en: 'Regular',
    description_ar: 'زرت نفس المكان 10 مرات — إنهم يعرفونك بالاسم!',
    description_en: 'You visited the same place 10 times. They know your order!',
    icon: '📍',
    hint_ar: 'سجّل 10 زيارات في نفس المكان.',
    hint_en: 'Check in to the same place 10 times.',
    targetCount: 10,
  },
  {
    slug: 'night_owl',
    title_ar: 'بومة الليل',
    title_en: 'Night Owl',
    description_ar: 'سجّلت زيارة بعد منتصف الليل — أنت لا تنام!',
    description_en: 'You checked in after midnight. The night is yours!',
    icon: '🦉',
    hint_ar: 'سجّل زيارة بعد الساعة 12 ليلاً بتوقيت بغداد.',
    hint_en: 'Check in after midnight Baghdad time.',
    targetCount: 1,
  },
  {
    slug: 'early_bird',
    title_ar: 'باكر الصباح',
    title_en: 'Early Bird',
    description_ar: 'سجّلت زيارة قبل السابعة صباحاً — الصباح الباكر بركة!',
    description_en: 'You checked in before 7 am. The early bird gets the worm!',
    icon: '🌅',
    hint_ar: 'سجّل زيارة قبل الساعة 7 صباحاً بتوقيت بغداد.',
    hint_en: 'Check in before 7 am Baghdad time.',
    targetCount: 1,
  },
  {
    slug: 'weekend_warrior',
    title_ar: 'محارب الجمعة',
    title_en: 'Friday Warrior',
    description_ar: 'خمس زيارات يوم الجمعة — نهاية الأسبوع ملكك!',
    description_en: '5 check-ins on Fridays. The weekend belongs to you!',
    icon: '🎉',
    hint_ar: 'سجّل 5 زيارات يوم الجمعة.',
    hint_en: 'Check in 5 times on Fridays.',
    targetCount: 5,
  },
  {
    slug: 'road_tripper',
    title_ar: 'متجول المدن',
    title_en: 'Road Tripper',
    description_ar: 'زرت 3 مدن عراقية مختلفة — العراق كبير وجميل!',
    description_en: 'You checked in across 3 different Iraqi cities. Iraq is vast and beautiful!',
    icon: '🗺️',
    hint_ar: 'سجّل زيارات في 3 مدن مختلفة.',
    hint_en: 'Check in across 3 different cities.',
    targetCount: 3,
  },
  {
    slug: 'cafe_hopper',
    title_ar: 'جوّال المقاهي',
    title_en: 'Café Hopper',
    description_ar: '15 مقهى مختلف — خبير قهوة بامتياز!',
    description_en: '15 café check-ins. A true coffee connoisseur!',
    icon: '☕',
    hint_ar: 'سجّل 15 زيارة في المقاهي.',
    hint_en: 'Check in to 15 cafés.',
    targetCount: 15,
  },
  {
    slug: 'history_buff',
    title_ar: 'عاشق التاريخ',
    title_en: 'History Buff',
    description_ar: 'زرت 10 مواقع تاريخية — تاريخ العراق في قلبك.',
    description_en: '10 historical site check-ins. Iraq\'s history lives in your heart.',
    icon: '🏛️',
    hint_ar: 'سجّل 10 زيارات في المواقع التاريخية.',
    hint_en: 'Check in to 10 historical sites.',
    targetCount: 10,
  },
  {
    slug: 'shopaholic',
    title_ar: 'عاشق التسوق',
    title_en: 'Shopaholic',
    description_ar: '20 زيارة في مراكز التسوق — محفظتك تعرفك!',
    description_en: '20 shopping mall check-ins. Your wallet knows you!',
    icon: '🛍️',
    hint_ar: 'سجّل 20 زيارة في مراكز التسوق.',
    hint_en: 'Check in to 20 shopping malls.',
    targetCount: 20,
  },
  {
    slug: 'centurion',
    title_ar: 'المئوي',
    title_en: 'Centurion',
    description_ar: '100 زيارة إجمالية — أنت فارس التطبيق!',
    description_en: '100 total check-ins. You are a true champion of the app!',
    icon: '🏆',
    hint_ar: 'سجّل 100 زيارة في أي مكان.',
    hint_en: 'Check in 100 times total.',
    targetCount: 100,
  },
  {
    slug: 'social_butterfly',
    title_ar: 'الفراشة الاجتماعية',
    title_en: 'Social Butterfly',
    description_ar: 'زرت مع 5 أصدقاء مختلفين — التجارب أجمل بالرفاق.',
    description_en: 'Visited with 5 different friends. Experiences are better shared!',
    icon: '🦋',
    hint_ar: 'شارك زياراتك مع 5 أصدقاء مختلفين.',
    hint_en: 'Check in with 5 different companions.',
    targetCount: 5,
  },
  {
    slug: 'eid_celebrant',
    title_ar: 'مبارك العيد',
    title_en: 'Eid Celebrant',
    description_ar: 'سجّلت زيارة في يوم العيد — عيدك مبارك وسعيد!',
    description_en: 'You checked in on Eid day. Eid Mubarak!',
    icon: '🌟',
    hint_ar: 'سجّل زيارة في يوم عيد الفطر أو عيد الأضحى.',
    hint_en: 'Check in on Eid al-Fitr or Eid al-Adha.',
    targetCount: 1,
  },
];

/** Lookup badge definition by slug. Throws if unknown (programming error). */
function getBadgeDef(slug: BadgeSlug): BadgeDef {
  const def = BADGE_CATALOGUE.find((b) => b.slug === slug);
  if (!def) throw new Error(`Unknown badge slug: ${slug}`);
  return def;
}

// ─── Milestone labels ─────────────────────────────────────────────────────────

function milestoneLabel(total: number): { ar: string; en: string } | null {
  const milestones: Record<number, { ar: string; en: string }> = {
    1:   { ar: 'أول زيارة!', en: 'First check-in!' },
    10:  { ar: '10 زيارات!', en: '10 check-ins!' },
    25:  { ar: '25 زيارة!', en: '25 check-ins!' },
    50:  { ar: '50 زيارة!', en: '50 check-ins!' },
    100: { ar: '100 زيارة!', en: '100 check-ins!' },
    250: { ar: '250 زيارة!', en: '250 check-ins!' },
    500: { ar: '500 زيارة!', en: '500 check-ins!' },
  };
  return milestones[total] ?? null;
}

// ─── Row → domain mapping ─────────────────────────────────────────────────────

function rowToCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id as CheckIn['id'],
    userId: row.userId as CheckIn['userId'],
    placeId: row.placeId as CheckIn['placeId'],
    timestamp: row.timestamp,
    method: row.method as CheckInMethod,
    note: row.note,
    photos: row.photos,
    placeName: row.placeName,
    placeCategory: row.placeCategory,
    citySlug: row.citySlug,
    visitCount: row.visitCount,
    isPioneer: row.isPioneer,
  };
}

function rowToStreak(row: StreakRow, today: string): Streak {
  const lastDate = row.lastCheckIn ? baghdadDate(row.lastCheckIn) : null;
  const activeToday = lastDate === today;
  const canExtend =
    lastDate !== null &&
    (lastDate === today || daysDiff(today, lastDate) === 1);
  return {
    userId: row.userId as Streak['userId'],
    current: row.current,
    longest: row.longest,
    lastCheckIn: row.lastCheckIn,
    activeToday,
    canExtend,
  };
}

// ─── Main service ─────────────────────────────────────────────────────────────

export class CheckInsService {
  constructor(
    private readonly db: CheckInDb,
    private readonly events: EventPublisher,
    private readonly places: PlacesLookup,
  ) {}

  // ── checkIn ────────────────────────────────────────────────────────────────

  /**
   * Record a check-in, update the streak, evaluate badges, publish an event.
   *
   * @throws {{ code: 'already_checked_in'; nextAllowedAt: string }}
   *   When the user checked in at the same place within the last 24 h.
   * @throws {{ code: 'place_not_found' }}
   *   When the placeId does not exist in the places module.
   */
  async checkIn(
    userId: UserId,
    req: CheckInRequest,
  ): Promise<CheckInResponse> {
    const now = new Date().toISOString();
    const todayStr = baghdadDate(now);

    // ── 1. Resolve place ─────────────────────────────────────────────────────
    const place = await this.places.getPlace(req.placeId);
    if (!place) {
      throw { code: 'place_not_found' as const };
    }

    // ── 2. Anti-cheat: same place twice in 24 h ──────────────────────────────
    const last = await this.db.findLastCheckIn(userId, req.placeId);
    if (last) {
      const lastMs = Date.parse(last.timestamp);
      const nowMs = Date.parse(now);
      const hoursAgo = (nowMs - lastMs) / 3_600_000;
      if (hoursAgo < 24) {
        const nextAllowedAt = new Date(lastMs + 24 * 3_600_000).toISOString();
        throw { code: 'already_checked_in' as const, nextAllowedAt };
      }
    }

    // ── 3. Pioneer check ─────────────────────────────────────────────────────
    const isPioneer = !(await this.db.placeHasPriorCheckIn(req.placeId, now));

    // ── 4. Visit count at this place ─────────────────────────────────────────
    // Count BEFORE insert so we add 1.
    const priorVisits = await this.db.countUserPlaceVisits(userId, req.placeId);
    const visitCount = priorVisits + 1;

    // ── 5. Insert check-in ───────────────────────────────────────────────────
    const row = await this.db.insertCheckIn({
      userId,
      placeId: req.placeId,
      timestamp: now,
      method: req.method,
      note: req.note ?? null,
      photos: req.photos ?? [],
      placeName: place.name_ar,
      placeCategory: place.category,
      citySlug: place.citySlug,
      visitCount,
      isPioneer,
    });
    const checkIn = rowToCheckIn(row);

    // ── 6. Update streak ─────────────────────────────────────────────────────
    const streakRow = await this.db.getStreak(userId);
    const updatedStreak = this._computeStreak(streakRow, now, todayStr);
    await this.db.saveStreak(updatedStreak);

    // ── 7. Badge evaluation ──────────────────────────────────────────────────
    const newBadges = await this._evaluateBadges(userId, checkIn, updatedStreak, now);

    // ── 8. Milestone detection ───────────────────────────────────────────────
    const total = await this.db.totalCheckIns(userId);
    const ml = milestoneLabel(total);

    // ── 9. Publish event ─────────────────────────────────────────────────────
    await this.events.publish({
      type: 'activity.checkin.created.v1',
      payload: {
        checkInId: row.id,
        userId,
        placeId: req.placeId,
        timestamp: now,
        method: req.method,
        newBadgeSlugs: newBadges.map((b) => b.slug),
        streak: updatedStreak.current,
        isMilestone: ml !== null,
      },
    });

    return {
      checkIn,
      newBadges,
      streak: rowToStreak(updatedStreak, todayStr),
      isMilestone: ml !== null,
      milestoneLabel_ar: ml?.ar ?? null,
      milestoneLabel_en: ml?.en ?? null,
    };
  }

  // ── getMyCheckIns ──────────────────────────────────────────────────────────

  async getMyCheckIns(
    userId: UserId,
    cursor: string | null,
    limit: number,
  ): Promise<Paginated<CheckIn>> {
    const { rows, nextCursor } = await this.db.listUserCheckIns(userId, cursor, limit);
    return { items: rows.map(rowToCheckIn), nextCursor };
  }

  // ── getPlaceCheckIns ───────────────────────────────────────────────────────

  async getPlaceCheckIns(
    placeId: PlaceId,
    cursor: string | null,
    limit: number,
  ): Promise<Paginated<CheckIn>> {
    const { rows, nextCursor } = await this.db.listPlaceCheckIns(placeId, cursor, limit);
    return { items: rows.map(rowToCheckIn), nextCursor };
  }

  // ── getMyBadges ────────────────────────────────────────────────────────────

  async getMyBadges(userId: UserId): Promise<{ badges: Badge[] }> {
    const earnedRows = await this.db.getUserBadges(userId);
    const earnedMap = new Map(earnedRows.map((r) => [r.slug, r.earnedAt]));

    // Compute progress for unearned badges
    const allMeta = await this.db.allUserCheckInMeta(userId);
    const total = allMeta.length;

    const badges: Badge[] = await Promise.all(
      BADGE_CATALOGUE.map(async (def) => {
        const earnedAt = earnedMap.get(def.slug) ?? null;
        const earned = earnedAt !== null;
        let currentCount = 0;

        if (!earned) {
          currentCount = await this._badgeProgress(userId, def.slug, allMeta, total);
        } else {
          currentCount = def.targetCount;
        }

        return {
          id: (earnedRows.find((r) => r.slug === def.slug)?.id ?? def.slug) as Badge['id'],
          slug: def.slug,
          title_ar: def.title_ar,
          title_en: def.title_en,
          description_ar: def.description_ar,
          description_en: def.description_en,
          icon: def.icon,
          hint_ar: def.hint_ar,
          hint_en: def.hint_en,
          earnedAt,
          earned,
          progress: Math.min(currentCount / def.targetCount, 1),
          targetCount: def.targetCount,
          currentCount,
        };
      }),
    );

    // Earned first, then sorted by slug alphabetically
    badges.sort((a, b) => {
      if (a.earned !== b.earned) return a.earned ? -1 : 1;
      return a.slug.localeCompare(b.slug);
    });

    return { badges };
  }

  // ── getStreak ──────────────────────────────────────────────────────────────

  async getStreak(userId: UserId): Promise<Streak> {
    const row = await this.db.getStreak(userId);
    return rowToStreak(row, todayBaghdad());
  }

  // ── getLeaderboard ─────────────────────────────────────────────────────────

  async getLeaderboard(
    timeframe: LeaderboardTimeframe,
    requestingUserId: UserId,
    limit = 50,
  ): Promise<LeaderboardResponse> {
    const rows = await this.db.leaderboard(timeframe, limit);
    const userIds = rows.map((r) => r.userId);
    if (!userIds.includes(requestingUserId)) {
      userIds.push(requestingUserId);
    }

    const displayInfos = await this.db.getUserDisplayInfo(userIds);
    const infoMap = new Map(displayInfos.map((d) => [d.userId, d]));

    const entries: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId as LeaderboardEntry['userId'],
      displayName: infoMap.get(r.userId)?.displayName ?? '...',
      avatarAssetId: infoMap.get(r.userId)?.avatarAssetId ?? null,
      checkInCount: r.checkInCount,
      badgeCount: r.badgeCount,
      isMe: r.userId === requestingUserId,
    }));

    // My own entry when not in visible list
    const myInList = entries.find((e) => e.userId === requestingUserId);
    let myEntry: LeaderboardEntry | null = null;
    if (!myInList) {
      const myRow = rows.find((r) => r.userId === requestingUserId);
      if (myRow) {
        myEntry = {
          rank: rows.length + 1,
          userId: requestingUserId as LeaderboardEntry['userId'],
          displayName: infoMap.get(requestingUserId)?.displayName ?? '...',
          avatarAssetId: infoMap.get(requestingUserId)?.avatarAssetId ?? null,
          checkInCount: myRow.checkInCount,
          badgeCount: myRow.badgeCount,
          isMe: true,
        };
      }
    }

    return {
      timeframe,
      entries,
      myEntry,
      computedAt: new Date().toISOString(),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recompute the streak given the existing streak row and the new check-in
   * timestamp. Does NOT persist; caller must call db.saveStreak.
   */
  private _computeStreak(
    row: StreakRow,
    nowIso: string,
    todayStr: string,
  ): StreakRow {
    if (row.lastCheckIn === null) {
      // First-ever check-in for this user.
      return { userId: row.userId, current: 1, longest: 1, lastCheckIn: nowIso };
    }

    const lastDate = baghdadDate(row.lastCheckIn);
    const diff = daysDiff(todayStr, lastDate);

    let current: number;
    if (diff === 0) {
      // Same Baghdad day — streak unchanged.
      current = row.current;
    } else if (diff === 1) {
      // Consecutive day — extend.
      current = row.current + 1;
    } else {
      // Gap — reset.
      current = 1;
    }

    return {
      userId: row.userId,
      current,
      longest: Math.max(row.longest, current),
      lastCheckIn: nowIso,
    };
  }

  /**
   * Evaluate all badge conditions after a new check-in and award any
   * newly earned ones.  Returns only the badges earned THIS check-in.
   */
  private async _evaluateBadges(
    userId: UserId,
    checkIn: CheckIn,
    streak: StreakRow,
    nowIso: string,
  ): Promise<Badge[]> {
    const alreadyEarned = new Set(
      (await this.db.getUserBadges(userId)).map((r) => r.slug),
    );

    const toCheck: Array<{ slug: BadgeSlug; condition: () => Promise<boolean> }> = [
      {
        slug: 'first_checkin',
        condition: async () => (await this.db.totalCheckIns(userId)) === 1,
      },
      {
        slug: 'restaurant_lover',
        condition: async () => (await this.db.countByCategory(userId, 'restaurant')) >= 10,
      },
      {
        slug: 'shrine_visitor',
        condition: async () => {
          const mosques = await this.db.countByCategory(userId, 'mosque');
          const shrines = await this.db.countByCategory(userId, 'shrine');
          return mosques + shrines >= 5;
        },
      },
      {
        slug: 'explorer',
        condition: async () =>
          (await this.db.countDistinctPlacesOnDate(userId, baghdadDate(nowIso))) >= 3,
      },
      {
        slug: 'streak_7',
        condition: async () => streak.current >= 7,
      },
      {
        slug: 'streak_30',
        condition: async () => streak.current >= 30,
      },
      {
        slug: 'baghdad_king',
        condition: async () => (await this.db.countByCity(userId, 'baghdad')) >= 100,
      },
      {
        slug: 'ramadan_visitor',
        condition: async () => isRamadan(nowIso),
      },
      {
        slug: 'pioneer',
        condition: async () => checkIn.isPioneer,
      },
      {
        slug: 'regular',
        condition: async () =>
          (await this.db.countUserPlaceVisits(userId, checkIn.placeId)) >= 10,
      },
      {
        slug: 'night_owl',
        condition: async () => isNightOwlHour(nowIso),
      },
      {
        slug: 'early_bird',
        condition: async () => isEarlyBird(nowIso),
      },
      {
        slug: 'weekend_warrior',
        condition: async () => (await this.db.countFridayCheckIns(userId)) >= 5,
      },
      {
        slug: 'road_tripper',
        condition: async () => (await this.db.countDistinctCities(userId)) >= 3,
      },
      {
        slug: 'cafe_hopper',
        condition: async () => (await this.db.countByCategory(userId, 'cafe')) >= 15,
      },
      {
        slug: 'history_buff',
        condition: async () =>
          (await this.db.countByCategory(userId, 'historic')) >= 10,
      },
      {
        slug: 'shopaholic',
        condition: async () =>
          (await this.db.countByCategory(userId, 'mall')) >= 20,
      },
      {
        slug: 'centurion',
        condition: async () => (await this.db.totalCheckIns(userId)) >= 100,
      },
      // social_butterfly and eid_celebrant require extra signals
      // not available in this check-in; skip for now — future work.
    ];

    const newlyEarned: Badge[] = [];

    for (const { slug, condition } of toCheck) {
      if (alreadyEarned.has(slug)) continue;
      const met = await condition();
      if (!met) continue;
      const badgeRow = await this.db.awardBadge(userId, slug);
      const def = getBadgeDef(slug);
      newlyEarned.push({
        id: badgeRow.id as Badge['id'],
        slug,
        title_ar: def.title_ar,
        title_en: def.title_en,
        description_ar: def.description_ar,
        description_en: def.description_en,
        icon: def.icon,
        hint_ar: def.hint_ar,
        hint_en: def.hint_en,
        earnedAt: badgeRow.earnedAt,
        earned: true,
        progress: 1,
        targetCount: def.targetCount,
        currentCount: def.targetCount,
      });
    }

    return newlyEarned;
  }

  /**
   * Compute how many units toward a badge the user has already collected.
   * Called only for UNEARNED badges when building the full badge list.
   */
  private async _badgeProgress(
    userId: UserId,
    slug: BadgeSlug,
    allMeta: Array<{ placeId: string; timestamp: string; category: string | null; citySlug: string | null }>,
    total: number,
  ): Promise<number> {
    switch (slug) {
      case 'first_checkin':
        return total >= 1 ? 1 : 0;
      case 'restaurant_lover':
        return allMeta.filter((m) => m.category === 'restaurant').length;
      case 'shrine_visitor':
        return allMeta.filter((m) => m.category === 'mosque' || m.category === 'shrine').length;
      case 'explorer':
        // Best single-day distinct place count
        return this._bestSingleDayDistinctPlaces(allMeta);
      case 'streak_7':
      case 'streak_30': {
        const row = await this.db.getStreak(userId);
        return row.current;
      }
      case 'baghdad_king':
        return allMeta.filter((m) => m.citySlug === 'baghdad').length;
      case 'ramadan_visitor':
        return allMeta.some((m) => isRamadan(m.timestamp)) ? 1 : 0;
      case 'pioneer':
        // Can't compute retroactively here; return 0 if not earned.
        return 0;
      case 'regular':
        // Max visits to same place
        return this._maxVisitsToSamePlace(allMeta);
      case 'night_owl':
        return allMeta.some((m) => isNightOwlHour(m.timestamp)) ? 1 : 0;
      case 'early_bird':
        return allMeta.some((m) => isEarlyBird(m.timestamp)) ? 1 : 0;
      case 'weekend_warrior':
        return allMeta.filter((m) => isFriday(m.timestamp)).length;
      case 'road_tripper': {
        const cities = new Set(allMeta.map((m) => m.citySlug).filter(Boolean));
        return cities.size;
      }
      case 'cafe_hopper':
        return allMeta.filter((m) => m.category === 'cafe').length;
      case 'history_buff':
        return allMeta.filter((m) => m.category === 'historic').length;
      case 'shopaholic':
        return allMeta.filter((m) => m.category === 'mall').length;
      case 'centurion':
        return total;
      case 'social_butterfly':
      case 'eid_celebrant':
        return 0;
      default:
        return 0;
    }
  }

  private _bestSingleDayDistinctPlaces(
    meta: Array<{ placeId: string; timestamp: string }>,
  ): number {
    const byDay = new Map<string, Set<string>>();
    for (const m of meta) {
      const day = baghdadDate(m.timestamp);
      if (!byDay.has(day)) byDay.set(day, new Set());
      byDay.get(day)!.add(m.placeId);
    }
    let best = 0;
    for (const places of byDay.values()) {
      if (places.size > best) best = places.size;
    }
    return best;
  }

  private _maxVisitsToSamePlace(
    meta: Array<{ placeId: string }>,
  ): number {
    const counts = new Map<string, number>();
    for (const m of meta) {
      counts.set(m.placeId, (counts.get(m.placeId) ?? 0) + 1);
    }
    let best = 0;
    for (const v of counts.values()) {
      if (v > best) best = v;
    }
    return best;
  }
}
