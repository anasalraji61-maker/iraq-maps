/**
 * Check-in gamification contracts.
 *
 * Covers:
 *   - CheckIn record (user visits a place)
 *   - Badge definitions and earned badges
 *   - Streak tracking
 *   - Leaderboard
 *
 * Anti-cheat: same place twice within 24 h is rejected (409).
 * Baghdad timezone (Asia/Baghdad, UTC+3) is used for streak and day boundaries.
 *
 * @public frozen contract — consumed by mobile-features/discover and mobile-features/account
 */

import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { PlaceId, UserId, paginated } from './common';

const c = initContract();

// ─── IDs ─────────────────────────────────────────────────────────────────────

export const CheckInId = z.string().uuid().brand('CheckInId');
export type CheckInId = z.infer<typeof CheckInId>;

export const BadgeId = z.string().uuid().brand('BadgeId');
export type BadgeId = z.infer<typeof BadgeId>;

// ─── Enums ───────────────────────────────────────────────────────────────────

/** How the check-in was triggered. */
export const CheckInMethod = z.enum([
  /** User tapped "Check in" manually from place card. */
  'manual',
  /** App detected the place automatically via geofence. */
  'auto',
  /** User scanned a QR code at the venue. */
  'qr',
]);
export type CheckInMethod = z.infer<typeof CheckInMethod>;

/** Leaderboard time window. */
export const LeaderboardTimeframe = z.enum(['weekly', 'monthly', 'all_time']);
export type LeaderboardTimeframe = z.infer<typeof LeaderboardTimeframe>;

// ─── Badge slugs (stable identifiers, never renamed) ────────────────────────

/**
 * Every badge the system can award.  The slug is the stable key used in the
 * service logic; titles and descriptions are stored per-locale in the service.
 */
export const BadgeSlug = z.enum([
  'first_checkin',           // First check-in ever
  'restaurant_lover',        // 10 restaurant check-ins
  'shrine_visitor',          // 5 shrine visits
  'explorer',                // 3 different places in one day
  'streak_7',                // 7-day check-in streak
  'streak_30',               // 30-day check-in streak
  'baghdad_king',            // 100 check-ins in Baghdad
  'ramadan_visitor',         // Check in during Ramadan
  'pioneer',                 // First check-in at a brand-new place
  'regular',                 // 10 visits to the same place
  'night_owl',               // Check in after midnight (Baghdad time)
  'early_bird',              // Check in before 7 am (Baghdad time)
  'weekend_warrior',         // 5 check-ins on Fridays
  'road_tripper',            // Check in 3 different cities
  'cafe_hopper',             // 15 café check-ins
  'history_buff',            // 10 historical site check-ins
  'shopaholic',              // 20 shopping mall check-ins
  'centurion',               // 100 total check-ins
  'social_butterfly',        // Check in with 5 different companions (future)
  'eid_celebrant',           // Check in on Eid al-Fitr or Eid al-Adha
]);
export type BadgeSlug = z.infer<typeof BadgeSlug>;

// ─── Core schemas ─────────────────────────────────────────────────────────────

/** A single visit to a place. */
export const CheckIn = z.object({
  id: CheckInId,
  userId: UserId,
  placeId: PlaceId,
  /** ISO 8601 timestamp (UTC). Clients display in Baghdad time (UTC+3). */
  timestamp: z.string().datetime(),
  method: CheckInMethod,
  /** Optional free-text note attached by the user (max 280 chars). */
  note: z.string().max(280).nullable(),
  /** Asset IDs of photos uploaded alongside this check-in (max 4). */
  photos: z.array(z.string().uuid()).max(4),
  /** Place display name resolved at check-in time (Arabic first). */
  placeName: z.string().max(300),
  /** Place category slug (e.g. "restaurant", "mosque"). */
  placeCategory: z.string().max(64).nullable(),
  /** City slug where the place is located. */
  citySlug: z.string().max(64).nullable(),
  /** Number of times the user has visited this place total (including now). */
  visitCount: z.number().int().min(1),
  /** True when this was the first-ever check-in at this place by anyone. */
  isPioneer: z.boolean(),
});
export type CheckIn = z.infer<typeof CheckIn>;

/** A badge definition as stored in the system. */
export const Badge = z.object({
  id: BadgeId,
  slug: BadgeSlug,
  /** Arabic title (primary display language). */
  title_ar: z.string().max(100),
  /** English title (fallback). */
  title_en: z.string().max(100),
  /** Arabic description shown on the badge detail screen. */
  description_ar: z.string().max(500),
  /** English description. */
  description_en: z.string().max(500),
  /** Emoji or icon key used by the mobile client. */
  icon: z.string().max(10),
  /** Hint shown when the badge is still locked (Arabic). */
  hint_ar: z.string().max(300),
  /** Hint shown when the badge is still locked (English). */
  hint_en: z.string().max(300),
  /** ISO 8601 datetime when the badge was earned, null if not yet earned. */
  earnedAt: z.string().datetime().nullable(),
  /** Whether the badge has been earned by the requesting user. */
  earned: z.boolean(),
  /** Relative progress toward earning this badge (0–1). */
  progress: z.number().min(0).max(1),
  /** How many check-ins or events are needed in total. */
  targetCount: z.number().int().min(1),
  /** How many the user has completed so far. */
  currentCount: z.number().int().min(0),
});
export type Badge = z.infer<typeof Badge>;

/** Current streak information for a user. */
export const Streak = z.object({
  userId: UserId,
  /** Number of consecutive days with at least one check-in (Baghdad calendar). */
  current: z.number().int().min(0),
  /** Longest streak the user has ever achieved. */
  longest: z.number().int().min(0),
  /** ISO 8601 datetime of the most recent check-in (UTC). */
  lastCheckIn: z.string().datetime().nullable(),
  /** Whether the streak is still active today (Baghdad date). */
  activeToday: z.boolean(),
  /** Whether the streak can still be continued tomorrow. */
  canExtend: z.boolean(),
});
export type Streak = z.infer<typeof Streak>;

/** One entry on the leaderboard. */
export const LeaderboardEntry = z.object({
  rank: z.number().int().min(1),
  userId: UserId,
  /** Display name (username or first name). */
  displayName: z.string().max(100),
  /** Avatar asset ID, null if not set. */
  avatarAssetId: z.string().uuid().nullable(),
  checkInCount: z.number().int().min(0),
  /** Badges earned count, shown as a prestige indicator. */
  badgeCount: z.number().int().min(0),
  /** True when this entry belongs to the requesting user. */
  isMe: z.boolean(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntry>;

// ─── Request / response shapes ────────────────────────────────────────────────

export const CheckInRequest = z.object({
  placeId: PlaceId,
  method: CheckInMethod,
  note: z.string().max(280).optional(),
  /** Asset IDs uploaded before calling this endpoint. */
  photos: z.array(z.string().uuid()).max(4).optional(),
});
export type CheckInRequest = z.infer<typeof CheckInRequest>;

export const CheckInResponse = z.object({
  checkIn: CheckIn,
  /** Badges unlocked by this specific check-in (may be empty). */
  newBadges: z.array(Badge),
  /** Updated streak after the check-in. */
  streak: Streak,
  /** True when this check-in hit a milestone (e.g. 10th, 50th, 100th). */
  isMilestone: z.boolean(),
  /** Milestone label in Arabic, null when isMilestone is false. */
  milestoneLabel_ar: z.string().nullable(),
  /** Milestone label in English, null when isMilestone is false. */
  milestoneLabel_en: z.string().nullable(),
});
export type CheckInResponse = z.infer<typeof CheckInResponse>;

export const LeaderboardResponse = z.object({
  timeframe: LeaderboardTimeframe,
  entries: z.array(LeaderboardEntry),
  /** The requesting user's own entry when not in the visible list. */
  myEntry: LeaderboardEntry.nullable(),
  /** When the leaderboard was last computed. */
  computedAt: z.string().datetime(),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponse>;

// ─── HTTP contract ────────────────────────────────────────────────────────────

export const checkInsContract = c.router({
  /** Record a new check-in.  Returns 409 if the user already checked in to
   *  the same place within the last 24 hours (Baghdad time). */
  checkIn: {
    method: 'POST',
    path: '/checkins',
    body: CheckInRequest,
    responses: {
      201: CheckInResponse,
      409: z.object({ code: z.literal('already_checked_in'), nextAllowedAt: z.string().datetime() }),
      404: z.object({ code: z.literal('place_not_found') }),
    },
    summary: 'Check in to a place',
  },

  /** Paginated list of the authenticated user's own check-ins. */
  getMyCheckIns: {
    method: 'GET',
    path: '/checkins/my',
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: paginated(CheckIn),
    },
    summary: 'My check-in history',
  },

  /** Paginated list of check-ins at a specific place (public). */
  getPlaceCheckIns: {
    method: 'GET',
    path: '/checkins/place/:placeId',
    pathParams: z.object({ placeId: PlaceId }),
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: paginated(CheckIn),
      404: z.object({ code: z.literal('place_not_found') }),
    },
    summary: 'Check-ins at a place',
  },

  /** All badges with earned/locked state for the authenticated user. */
  getMyBadges: {
    method: 'GET',
    path: '/checkins/badges',
    responses: {
      200: z.object({ badges: z.array(Badge) }),
    },
    summary: 'My badges',
  },

  /** Current and longest streak for the authenticated user. */
  getStreak: {
    method: 'GET',
    path: '/checkins/streak',
    responses: {
      200: Streak,
    },
    summary: 'My check-in streak',
  },

  /** Weekly / monthly / all-time leaderboard. */
  getLeaderboard: {
    method: 'GET',
    path: '/checkins/leaderboard',
    query: z.object({
      timeframe: LeaderboardTimeframe.default('weekly'),
    }),
    responses: {
      200: LeaderboardResponse,
    },
    summary: 'Check-in leaderboard',
  },
});

export type CheckInsContract = typeof checkInsContract;
