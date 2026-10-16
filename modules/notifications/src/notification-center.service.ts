/**
 * NotificationCenterService
 *
 * Provides the full notification center and smart-alert system:
 *   - Paginated notification listing with type/read filtering
 *   - Per-notification and bulk read/delete actions
 *   - Unread badge count
 *   - Per-user notification preferences (per-type toggles, quiet hours,
 *     push / in-app / email channels, weekly digest)
 *   - Smart contextual alerts generated on demand
 *
 * Baghdad timezone: UTC+3, used for quiet-hours enforcement and
 * "time since last post" calculations.
 */

import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '@iraq-maps/db-kit';
import type { UserId } from '@iraq-maps/contracts';
import { notificationTable, prefsTable } from './schema';

// ─── Public types ─────────────────────────────────────────────────────────────

export type NotificationType =
  | 'message'
  | 'review'
  | 'like'
  | 'follow'
  | 'mention'
  | 'challenge'
  | 'promotion'
  | 'incident'
  | 'place_update'
  | 'system'
  | 'general';

export type NotificationChannel = 'push' | 'in_app' | 'both';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  /** Friendly relative label, e.g. "منذ ٣ دقائق" */
  relativeTime: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationListOpts {
  /** Filter to a specific type; omit for all types. */
  type?: NotificationType;
  /** If true, return only unread items. */
  unreadOnly?: boolean;
  /** Pagination cursor (ISO createdAt of last seen item, exclusive). */
  cursor?: string;
  /** Page size, capped at 50. Defaults to 20. */
  limit?: number;
}

/** Per-type on/off preferences plus channel and schedule settings. */
export interface NotificationPrefsExtended {
  // per-type toggles
  message: boolean;
  review: boolean;
  like: boolean;
  follow: boolean;
  mention: boolean;
  challenge: boolean;
  promotion: boolean;
  incident: boolean;
  place_update: boolean;
  system: boolean;
  // quiet hours (Baghdad UTC+3)
  quietHoursEnabled: boolean;
  quietStart: string; // "HH:MM"
  quietEnd: string;   // "HH:MM"
  criticalOverrideQuiet: boolean; // system/incident bypass quiet hours
  // channel
  channel: NotificationChannel;
  // email digest
  emailDigestEnabled: boolean;
}

export interface SmartAlert {
  id: string;
  type:
    | 'favorite_promo'
    | 'route_incident'
    | 'new_review_on_business'
    | 'engagement_nudge'
    | 'place_opened'
    | 'challenge_expiring';
  title: string;
  body: string;
  /** Deep-link data so the UI can navigate on tap. */
  data: Record<string, string>;
  /** When this alert was generated (ISO). */
  generatedAt: string;
}

// ─── Baghdad helpers ──────────────────────────────────────────────────────────

/** Current time in Baghdad (UTC+3) as "HH:MM". */
function baghdadHHMM(): string {
  const d = new Date(Date.now() + 3 * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** True if current Baghdad time falls inside the [start, end) quiet window.
 *  Handles overnight ranges, e.g. 23:00 – 08:00. */
function isQuietNow(start: string, end: string): boolean {
  const now = baghdadHHMM();
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // overnight
}

// ─── Relative time helper (Arabic numerals, Arabic labels) ───────────────────

function relativeTimeAr(createdAt: Date): string {
  const diffMs = Date.now() - createdAt.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days === 1) return 'أمس';
  if (days < 7) return `منذ ${days} أيام`;
  return createdAt.toLocaleDateString('ar-IQ');
}

// ─── Default prefs ────────────────────────────────────────────────────────────

const DEFAULT_PREFS: NotificationPrefsExtended = {
  message: true,
  review: true,
  like: true,
  follow: true,
  mention: true,
  challenge: true,
  promotion: true,
  incident: true,
  place_update: true,
  system: true,
  quietHoursEnabled: false,
  quietStart: '23:00',
  quietEnd: '08:00',
  criticalOverrideQuiet: true,
  channel: 'both',
  emailDigestEnabled: false,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationCenterService {
  constructor(private readonly db: Db) {}

  // ── Listing ────────────────────────────────────────────────────────────────

  /**
   * Return a paginated list of notifications for a user.
   *
   * Supports:
   *   - Type filter (e.g. only `message` notifications)
   *   - Unread-only filter
   *   - Cursor-based pagination (ISO createdAt, exclusive)
   */
  async getNotifications(
    userId: UserId,
    opts: NotificationListOpts = {},
  ): Promise<NotificationPage> {
    const pageSize = Math.min(opts.limit ?? 20, 50);
    const cursorDate = opts.cursor ? new Date(opts.cursor) : undefined;

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [
      eq(notificationTable.userId, userId),
    ];

    if (opts.unreadOnly) {
      conditions.push(isNull(notificationTable.readAt) as ReturnType<typeof eq>);
    }

    if (opts.type) {
      conditions.push(eq(notificationTable.type, opts.type) as ReturnType<typeof eq>);
    }

    if (cursorDate) {
      conditions.push(lt(notificationTable.createdAt, cursorDate) as ReturnType<typeof eq>);
    }

    const where = conditions.length === 1 ? conditions[0]! : and(...(conditions as Parameters<typeof and>));

    const rows = await this.db
      .select()
      .from(notificationTable)
      .where(where)
      .orderBy(desc(notificationTable.createdAt))
      .limit(pageSize + 1);

    const hasMore = rows.length > pageSize;
    const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

    // Unread count (total, not just this page) for the badge
    const unreadCount = await this._unreadCount(userId);

    const nextCursor = hasMore
      ? pageRows[pageRows.length - 1]!.createdAt.toISOString()
      : null;

    return {
      items: pageRows.map((r) => ({
        id: r.id,
        type: (r.type as NotificationType) ?? 'general',
        title: r.title,
        body: r.body,
        data: (r.data as Record<string, string> | undefined) ?? undefined,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        relativeTime: relativeTimeAr(r.createdAt),
      })),
      nextCursor,
      unreadCount,
    };
  }

  // ── Single-notification actions ────────────────────────────────────────────

  /**
   * Mark a single notification as read.
   * Returns false if the notification does not belong to the user or is
   * already read.
   */
  async markRead(userId: UserId, notifId: string): Promise<boolean> {
    const [updated] = await this.db
      .update(notificationTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationTable.id, notifId),
          eq(notificationTable.userId, userId),
          isNull(notificationTable.readAt),
        ),
      )
      .returning({ id: notificationTable.id });
    return updated !== undefined;
  }

  /**
   * Hard-delete a single notification.
   * Returns false if the row does not exist or belongs to a different user.
   */
  async deleteNotification(userId: UserId, notifId: string): Promise<boolean> {
    const result = await this.db
      .delete(notificationTable)
      .where(
        and(
          eq(notificationTable.id, notifId),
          eq(notificationTable.userId, userId),
        ),
      )
      .returning({ id: notificationTable.id });
    return result.length > 0;
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────

  /**
   * Mark every unread notification as read.
   * Returns the number of rows updated.
   */
  async markAllRead(userId: UserId): Promise<number> {
    const result = await this.db
      .update(notificationTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationTable.userId, userId),
          isNull(notificationTable.readAt),
        ),
      )
      .returning({ id: notificationTable.id });
    return result.length;
  }

  /**
   * Hard-delete all notifications for a user (GDPR erasure / "clear all").
   * Returns the number of rows deleted.
   */
  async clearAll(userId: UserId): Promise<number> {
    const result = await this.db
      .delete(notificationTable)
      .where(eq(notificationTable.userId, userId))
      .returning({ id: notificationTable.id });
    return result.length;
  }

  /**
   * Delete all notifications for a user — alias used by the GDPR data-erasure
   * flow.  Mirrors clearAll but has a more explicit name for audit logs.
   */
  async eraseAllForUser(userId: UserId): Promise<void> {
    await this.clearAll(userId);
  }

  // ── Badge count ────────────────────────────────────────────────────────────

  /** Returns the current unread notification count (for the app-icon badge). */
  async getUnreadCount(userId: UserId): Promise<number> {
    return this._unreadCount(userId);
  }

  // ── Preferences ───────────────────────────────────────────────────────────

  /** Load the user's extended notification preferences (all fields). */
  async getNotificationPrefs(userId: UserId): Promise<NotificationPrefsExtended> {
    const [row] = await this.db
      .select()
      .from(prefsTable)
      .where(eq(prefsTable.userId, userId));

    if (!row) return { ...DEFAULT_PREFS };

    return {
      message: row.messages ?? DEFAULT_PREFS.message,
      review: row.replyReceived ?? DEFAULT_PREFS.review,
      like: row.discoverLikes ?? DEFAULT_PREFS.like,
      follow: DEFAULT_PREFS.follow,
      mention: DEFAULT_PREFS.mention,
      challenge: DEFAULT_PREFS.challenge,
      promotion: DEFAULT_PREFS.promotion,
      incident: row.statusUpdate ?? DEFAULT_PREFS.incident,
      place_update: DEFAULT_PREFS.place_update,
      system: DEFAULT_PREFS.system,
      quietHoursEnabled: row.quietHoursEnabled ?? DEFAULT_PREFS.quietHoursEnabled,
      quietStart: row.quietStart ?? DEFAULT_PREFS.quietStart,
      quietEnd: row.quietEnd ?? DEFAULT_PREFS.quietEnd,
      criticalOverrideQuiet: DEFAULT_PREFS.criticalOverrideQuiet,
      channel: DEFAULT_PREFS.channel,
      emailDigestEnabled: DEFAULT_PREFS.emailDigestEnabled,
    };
  }

  /**
   * Persist changes to a user's notification preferences.
   * Any field that is omitted retains its current stored value.
   */
  async updateNotificationPrefs(
    userId: UserId,
    partial: Partial<NotificationPrefsExtended>,
  ): Promise<NotificationPrefsExtended> {
    const current = await this.getNotificationPrefs(userId);
    const merged: NotificationPrefsExtended = { ...current, ...partial };

    await this.db
      .insert(prefsTable)
      .values({
        userId,
        messages: merged.message,
        replyReceived: merged.review,
        discoverLikes: merged.like,
        discoverComments: merged.like, // keep in sync
        newInquiry: merged.message,
        statusUpdate: merged.incident,
        quietHoursEnabled: merged.quietHoursEnabled,
        quietStart: merged.quietStart,
        quietEnd: merged.quietEnd,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: prefsTable.userId,
        set: {
          messages: merged.message,
          replyReceived: merged.review,
          discoverLikes: merged.like,
          discoverComments: merged.like,
          newInquiry: merged.message,
          statusUpdate: merged.incident,
          quietHoursEnabled: merged.quietHoursEnabled,
          quietStart: merged.quietStart,
          quietEnd: merged.quietEnd,
          updatedAt: new Date(),
        },
      });

    return merged;
  }

  // ── Smart alerts ───────────────────────────────────────────────────────────

  /**
   * Generate contextual smart alerts for a user.
   *
   * These are derived at query time from the user's activity patterns and
   * nearby data.  They do NOT originate from the notifications table; they
   * are ephemeral and rendered in a dedicated "Smart Alerts" section above
   * the main notification list.
   *
   * Current alert types:
   *   favorite_promo       – A favorited place has an active promotion today
   *   route_incident       – Traffic jam / incident on the user's usual route
   *   new_review_on_business – A new review was left on the user's business
   *   engagement_nudge     – The user has not posted in 7+ days
   *   place_opened         – A new place near the user recently opened
   *   challenge_expiring   – One of the user's active challenges expires soon
   */
  async getSmartAlerts(userId: UserId): Promise<SmartAlert[]> {
    const now = new Date().toISOString();
    const alerts: SmartAlert[] = [];

    // ── 1. Favorite place has a promotion today ──────────────────────────────
    // Query: join user_favorites → promotions where active_until >= today
    try {
      const promos = await this.db.execute<{
        place_id: string;
        place_name: string;
        discount_pct: number;
      }>(sql`
        SELECT
          p.id          AS place_id,
          p.name_ar     AS place_name,
          pr.discount_pct
        FROM   places.favorite f
        JOIN   places.place p   ON p.id = f.place_id
        JOIN   places.promotion pr ON pr.place_id = p.id
        WHERE  f.user_id = ${userId}
          AND  pr.active_from <= now()
          AND  pr.active_until >= now()
        LIMIT  3
      `);

      for (const row of promos.rows) {
        alerts.push({
          id: `fav_promo_${row.place_id}`,
          type: 'favorite_promo',
          title: `عرض خاص في ${String(row.place_name)}`,
          body: `خصم ${String(row.discount_pct)}٪ اليوم فقط! لا تفوّته.`,
          data: { placeId: String(row.place_id), type: 'place_promo' },
          generatedAt: now,
        });
      }
    } catch {
      // Table may not exist in this milestone; skip gracefully.
    }

    // ── 2. Traffic incident on usual route ───────────────────────────────────
    try {
      const incidents = await this.db.execute<{
        segment_name: string;
        incident_type: string;
      }>(sql`
        SELECT
          ri.segment_name,
          ri.incident_type
        FROM   routing.route_incident ri
        JOIN   routing.user_common_route ucr
               ON ucr.segment_id = ri.segment_id
        WHERE  ucr.user_id = ${userId}
          AND  ri.resolved_at IS NULL
          AND  ri.created_at >= now() - interval '2 hours'
        LIMIT  2
      `);

      for (const row of incidents.rows) {
        alerts.push({
          id: `route_incident_${String(row.segment_name)}`,
          type: 'route_incident',
          title: 'ازدحام مروري على طريقك المعتاد',
          body: `تأخير متوقع في ${String(row.segment_name)}. ابحث عن طريق بديل.`,
          data: { segmentName: String(row.segment_name), type: 'route_incident' },
          generatedAt: now,
        });
      }
    } catch {
      // routing schema may not be ready; skip.
    }

    // ── 3. New review on the user's business ─────────────────────────────────
    try {
      const reviews = await this.db.execute<{
        provider_name: string;
        review_count: number;
        provider_id: string;
      }>(sql`
        SELECT
          pr.name_ar       AS provider_name,
          count(rv.id)::int AS review_count,
          pr.id            AS provider_id
        FROM   providers.provider pr
        JOIN   places.review rv ON rv.place_id = pr.place_id
        WHERE  pr.owner_user_id = ${userId}
          AND  rv.created_at >= now() - interval '24 hours'
        GROUP  BY pr.id, pr.name_ar
        HAVING count(rv.id) > 0
        LIMIT  1
      `);

      for (const row of reviews.rows) {
        alerts.push({
          id: `new_review_${String(row.provider_id)}`,
          type: 'new_review_on_business',
          title: 'تقييم جديد على نشاطك التجاري',
          body: `وصل ${String(row.review_count)} تقييم جديد على ${String(row.provider_name)}.`,
          data: { providerId: String(row.provider_id), type: 'business_review' },
          generatedAt: now,
        });
      }
    } catch {
      // providers schema may not be ready; skip.
    }

    // ── 4. Engagement nudge — user has not posted in 7 days ──────────────────
    try {
      const lastPostResult = await this.db.execute<{ last_at: Date }>(sql`
        SELECT max(created_at) AS last_at
        FROM   discover.post
        WHERE  user_id = ${userId}
      `);
      const lastPost = lastPostResult.rows[0];
      const lastAt = lastPost?.last_at ? new Date(lastPost.last_at) : null;
      const daysSince = lastAt
        ? Math.floor((Date.now() - lastAt.getTime()) / 86_400_000)
        : 999;

      if (daysSince >= 7) {
        alerts.push({
          id: `engagement_nudge_${userId}`,
          type: 'engagement_nudge',
          title: 'شارك تجربتك مع مجتمعك',
          body: `لم تنشر منذ ${daysSince} أيام. أضف منشوراً جديداً الآن!`,
          data: { type: 'engagement_nudge' },
          generatedAt: now,
        });
      }
    } catch {
      // discover schema may not be ready; skip.
    }

    // ── 5. New place opened nearby ────────────────────────────────────────────
    try {
      const places = await this.db.execute<{
        place_id: string;
        place_name: string;
      }>(sql`
        SELECT p.id AS place_id, p.name_ar AS place_name
        FROM   places.place p
        WHERE  p.opened_at >= now() - interval '7 days'
          AND  ST_DWithin(
                 p.location::geography,
                 (SELECT last_known_location::geography
                  FROM   identity.user_location
                  WHERE  user_id = ${userId}
                  LIMIT  1),
                 5000  -- 5 km
               )
        ORDER  BY p.opened_at DESC
        LIMIT  2
      `);

      for (const row of places.rows) {
        alerts.push({
          id: `place_opened_${String(row.place_id)}`,
          type: 'place_opened',
          title: `افتتاح جديد بالقرب منك`,
          body: `${String(row.place_name)} افتتح مؤخراً. اكتشفه الآن!`,
          data: { placeId: String(row.place_id), type: 'nearby_place' },
          generatedAt: now,
        });
      }
    } catch {
      // places/identity schema may not be ready; skip.
    }

    // ── 6. Challenge expiring soon (within 2 hours) ───────────────────────────
    try {
      const challenges = await this.db.execute<{
        challenge_id: string;
        challenge_name: string;
        expires_at: Date;
      }>(sql`
        SELECT
          uc.challenge_id,
          c.name_ar        AS challenge_name,
          uc.expires_at
        FROM   activity.user_challenge uc
        JOIN   activity.challenge c ON c.id = uc.challenge_id
        WHERE  uc.user_id  = ${userId}
          AND  uc.completed_at IS NULL
          AND  uc.expires_at BETWEEN now() AND now() + interval '2 hours'
        ORDER  BY uc.expires_at
        LIMIT  2
      `);

      for (const row of challenges.rows) {
        const expiresAt = new Date(row.expires_at);
        const minsLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 60_000);
        alerts.push({
          id: `challenge_expiring_${String(row.challenge_id)}`,
          type: 'challenge_expiring',
          title: 'تحديتك توشك على الانتهاء!',
          body: `${String(row.challenge_name)} تنتهي خلال ${minsLeft} دقيقة. أكملها الآن.`,
          data: { challengeId: String(row.challenge_id), type: 'challenge' },
          generatedAt: now,
        });
      }
    } catch {
      // activity schema may not be ready; skip.
    }

    return alerts;
  }

  // ── Quiet-hours check (public utility used by other services) ─────────────

  /**
   * Returns true when the current Baghdad time falls inside the user's
   * configured quiet hours.  Critical notifications (type = 'system' or
   * 'incident') bypass quiet hours when criticalOverrideQuiet is set.
   */
  async shouldSuppressPush(
    userId: UserId,
    notifType: NotificationType,
  ): Promise<boolean> {
    const prefs = await this.getNotificationPrefs(userId);

    // Per-type opt-out
    const typeKey = notifType as keyof NotificationPrefsExtended;
    if (typeKey in prefs && prefs[typeKey] === false) return true;

    if (!prefs.quietHoursEnabled) return false;

    // Critical override
    if (
      prefs.criticalOverrideQuiet &&
      (notifType === 'system' || notifType === 'incident')
    ) {
      return false;
    }

    return isQuietNow(prefs.quietStart, prefs.quietEnd);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async _unreadCount(userId: UserId): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationTable)
      .where(
        and(
          eq(notificationTable.userId, userId),
          isNull(notificationTable.readAt),
        ),
      );
    return row?.count ?? 0;
  }
}

// ─── Batch smart-alert processing (used by the worker) ───────────────────────

/**
 * Run smart-alert checks for up to `batchSize` users and insert notification
 * rows for any alerts that are newly relevant.
 *
 * Called nightly by smart-alerts-worker.ts.
 */
export async function processBatchSmartAlerts(
  db: Db,
  opts: {
    offsetUserId?: string;
    batchSize?: number;
    log?: (msg: string, meta?: Record<string, unknown>) => void;
  } = {},
): Promise<{ processed: number; inserted: number }> {
  const batchSize = opts.batchSize ?? 1_000;

  // Fetch a page of users (ordered by id for stable pagination).
  const users = await db.execute<{ user_id: string }>(sql`
    SELECT id AS user_id
    FROM   identity.user
    ${opts.offsetUserId ? sql`WHERE id > ${opts.offsetUserId}` : sql``}
    ORDER  BY id
    LIMIT  ${batchSize}
  `);

  let inserted = 0;

  for (const { user_id } of users.rows) {
    const svc = new NotificationCenterService(db);
    const alerts = await svc.getSmartAlerts(user_id as UserId);

    for (const alert of alerts) {
      // Deduplicate: skip if an identical alert was already inserted today.
      const existingResult = await db.execute<{ id: string }>(sql`
        SELECT id FROM notifications.notification
        WHERE  user_id = ${user_id}
          AND  type    = ${'smart_alert'}
          AND  data->>'alertId' = ${alert.id}
          AND  created_at >= now() - interval '24 hours'
        LIMIT  1
      `);
      const existing = existingResult.rows[0];

      if (existing) continue;

      await db.insert(notificationTable).values({
        userId: user_id as UserId,
        type: 'system',
        title: alert.title,
        body: alert.body,
        data: { ...alert.data, alertId: alert.id, alertType: alert.type },
      });
      inserted++;
    }
  }

  opts.log?.('processBatchSmartAlerts complete', {
    processed: users.rows.length,
    inserted,
  });

  return { processed: users.rows.length, inserted };
}
