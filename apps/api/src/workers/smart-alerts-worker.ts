/**
 * Smart Alerts Worker
 *
 * Runs nightly (02:30 Baghdad time = 23:30 UTC) to generate contextual
 * in-app notifications for every registered user based on:
 *
 *   1. Favorite place has a promotion today
 *   2. Active challenge expires within 24 hours
 *   3. Engagement nudge — user has not posted in 7+ days
 *   4. New place opened within 5 km of the user's last known location
 *   5. New review on the user's registered business
 *
 * Processing strategy: batch of 1,000 users at a time, iterated via
 * cursor pagination on identity.user.id.  Each alert type is deduplicated
 * within a 24-hour window (prevents duplicate rows on re-runs).
 *
 * All DB queries run as raw SQL so this worker has no compile-time
 * dependency on individual module schemas; it is safe to run even when
 * optional modules (discover, activity, places) are partially migrated.
 */

import type { Logger } from '@iraq-maps/observability';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('drizzle-orm/node-postgres').NodePgDatabase<any>;

export interface SmartAlertsJobData {
  /** If provided, resume pagination from this user id (exclusive). */
  offsetUserId?: string;
  /** Number of users to process per call. Default 1000. */
  batchSize?: number;
}

export interface SmartAlertsJobResult {
  processed: number;
  inserted: number;
  skippedDedupe: number;
  errors: number;
}

const BATCH_SIZE = 1_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Insert a notification row, deduplicating by (user_id, alertId) within 24h. */
async function insertIfNew(
  db: AnyDb,
  userId: string,
  alertId: string,
  alertType: string,
  title: string,
  body: string,
  data: Record<string, string>,
  log?: Logger,
): Promise<'inserted' | 'skipped'> {
  const { sql } = await import('drizzle-orm');

  // Dedup check
  const existing = await db.execute<{ id: string }>(sql`
    SELECT id
    FROM   notifications.notification
    WHERE  user_id = ${userId}::uuid
      AND  type    = 'system'
      AND  data->>'alertId' = ${alertId}
      AND  created_at >= now() - interval '24 hours'
    LIMIT  1
  `);

  if (existing.rows.length > 0) {
    return 'skipped';
  }

  try {
    await db.execute(sql`
      INSERT INTO notifications.notification
        (user_id, type, title, body, data)
      VALUES
        (${userId}::uuid, 'system', ${title}, ${body},
         ${JSON.stringify({ ...data, alertId, alertType })}::jsonb)
    `);
    return 'inserted';
  } catch (err) {
    log?.warn({ userId, alertId, err }, 'smart-alerts: insert failed');
    return 'skipped';
  }
}

// ─── Per-alert generators ─────────────────────────────────────────────────────

/** Alert 1: a favorited place has an active promotion today. */
async function checkFavoritePromos(
  db: AnyDb,
  userId: string,
  results: { inserted: number; skipped: number; errors: number },
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  try {
    const rows = await db.execute<{
      place_id: string;
      place_name: string;
      discount_pct: string;
    }>(sql`
      SELECT
        p.id          AS place_id,
        p.name_ar     AS place_name,
        pr.discount_pct::text AS discount_pct
      FROM   places.favorite f
      JOIN   places.place p   ON p.id = f.place_id
      JOIN   places.promotion pr ON pr.place_id = p.id
      WHERE  f.user_id   = ${userId}::uuid
        AND  pr.active_from <= now()
        AND  pr.active_until >= now()
      LIMIT  3
    `);

    for (const row of rows.rows) {
      const alertId = `fav_promo_${String(row.place_id)}_${new Date().toISOString().slice(0, 10)}`;
      const outcome = await insertIfNew(
        db, userId, alertId, 'favorite_promo',
        `عرض خاص في ${String(row.place_name)}`,
        `خصم ${String(row.discount_pct)}٪ اليوم فقط! لا تفوّته.`,
        { placeId: String(row.place_id), type: 'place_promo' },
        log,
      );
      if (outcome === 'inserted') results.inserted++;
      else results.skipped++;
    }
  } catch {
    results.errors++;
  }
}

/** Alert 2: a challenge the user joined is expiring within 24 hours. */
async function checkChallengeExpiry(
  db: AnyDb,
  userId: string,
  results: { inserted: number; skipped: number; errors: number },
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  try {
    const rows = await db.execute<{
      challenge_id: string;
      challenge_name: string;
      expires_at: string;
    }>(sql`
      SELECT
        uc.challenge_id,
        c.name_ar    AS challenge_name,
        uc.expires_at::text
      FROM   activity.user_challenge uc
      JOIN   activity.challenge c ON c.id = uc.challenge_id
      WHERE  uc.user_id      = ${userId}::uuid
        AND  uc.completed_at IS NULL
        AND  uc.expires_at   BETWEEN now() AND now() + interval '24 hours'
      ORDER  BY uc.expires_at
      LIMIT  3
    `);

    for (const row of rows.rows) {
      const expiresAt = new Date(String(row.expires_at));
      const hoursLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000);
      const alertId = `challenge_exp_${String(row.challenge_id)}_${new Date().toISOString().slice(0, 10)}`;
      const outcome = await insertIfNew(
        db, userId, alertId, 'challenge_expiring',
        'تحديتك توشك على الانتهاء!',
        `${String(row.challenge_name)} تنتهي خلال ${hoursLeft} ساعة. أكملها الآن.`,
        { challengeId: String(row.challenge_id), type: 'challenge' },
        log,
      );
      if (outcome === 'inserted') results.inserted++;
      else results.skipped++;
    }
  } catch {
    results.errors++;
  }
}

/** Alert 3: user has not posted in 7 days (engagement nudge). */
async function checkEngagementNudge(
  db: AnyDb,
  userId: string,
  results: { inserted: number; skipped: number; errors: number },
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  try {
    const rows = await db.execute<{ last_at: string | null }>(sql`
      SELECT max(created_at)::text AS last_at
      FROM   discover.post
      WHERE  user_id = ${userId}::uuid
    `);

    const lastAt = rows.rows[0]?.last_at ? new Date(String(rows.rows[0].last_at)) : null;
    const daysSince = lastAt
      ? Math.floor((Date.now() - lastAt.getTime()) / 86_400_000)
      : 999;

    if (daysSince < 7) return;

    const alertId = `engagement_nudge_${userId}_${new Date().toISOString().slice(0, 10)}`;
    const outcome = await insertIfNew(
      db, userId, alertId, 'engagement_nudge',
      'شارك تجربتك مع مجتمعك',
      `لم تنشر منذ ${daysSince} أيام. أضف منشوراً جديداً الآن!`,
      { type: 'engagement_nudge' },
      log,
    );
    if (outcome === 'inserted') results.inserted++;
    else results.skipped++;
  } catch {
    results.errors++;
  }
}

/** Alert 4: a new place opened within 5 km of the user's last known location. */
async function checkNearbyOpenings(
  db: AnyDb,
  userId: string,
  results: { inserted: number; skipped: number; errors: number },
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  try {
    const rows = await db.execute<{
      place_id: string;
      place_name: string;
    }>(sql`
      SELECT p.id AS place_id, p.name_ar AS place_name
      FROM   places.place p
      WHERE  p.opened_at >= now() - interval '7 days'
        AND  EXISTS (
               SELECT 1
               FROM   identity.user_location ul
               WHERE  ul.user_id = ${userId}::uuid
                 AND  ST_DWithin(
                        p.location::geography,
                        ul.last_known_location::geography,
                        5000
                      )
             )
      ORDER  BY p.opened_at DESC
      LIMIT  2
    `);

    for (const row of rows.rows) {
      const alertId = `place_opened_${String(row.place_id)}_${new Date().toISOString().slice(0, 10)}`;
      const outcome = await insertIfNew(
        db, userId, alertId, 'place_opened',
        'افتتاح جديد بالقرب منك',
        `${String(row.place_name)} افتتح مؤخراً. اكتشفه الآن!`,
        { placeId: String(row.place_id), type: 'nearby_place' },
        log,
      );
      if (outcome === 'inserted') results.inserted++;
      else results.skipped++;
    }
  } catch {
    results.errors++;
  }
}

/** Alert 5: a new review was posted on the user's registered business in the last 24h. */
async function checkNewBusinessReviews(
  db: AnyDb,
  userId: string,
  results: { inserted: number; skipped: number; errors: number },
  log?: Logger,
): Promise<void> {
  const { sql } = await import('drizzle-orm');
  try {
    const rows = await db.execute<{
      provider_id: string;
      provider_name: string;
      review_count: string;
    }>(sql`
      SELECT
        pr.id              AS provider_id,
        pr.name_ar         AS provider_name,
        count(rv.id)::text AS review_count
      FROM   providers.provider pr
      JOIN   places.review rv ON rv.place_id = pr.place_id
      WHERE  pr.owner_user_id = ${userId}::uuid
        AND  rv.created_at   >= now() - interval '24 hours'
      GROUP  BY pr.id, pr.name_ar
      HAVING count(rv.id) > 0
      LIMIT  1
    `);

    for (const row of rows.rows) {
      const alertId = `biz_review_${String(row.provider_id)}_${new Date().toISOString().slice(0, 10)}`;
      const outcome = await insertIfNew(
        db, userId, alertId, 'new_review_on_business',
        'تقييم جديد على نشاطك التجاري',
        `وصل ${String(row.review_count)} تقييم جديد على ${String(row.provider_name)}.`,
        { providerId: String(row.provider_id), type: 'business_review' },
        log,
      );
      if (outcome === 'inserted') results.inserted++;
      else results.skipped++;
    }
  } catch {
    results.errors++;
  }
}

// ─── Main processor ───────────────────────────────────────────────────────────

/**
 * Process smart alerts for a batch of users.
 *
 * Designed to be called from BullMQ as:
 *   [JOB_NAMES.SMART_ALERTS]: (job) => processSmartAlerts(job, db, log)
 *
 * Also callable directly for testing / one-off runs.
 */
export async function processSmartAlerts(
  job: { data: SmartAlertsJobData },
  db: AnyDb,
  log?: Logger,
): Promise<SmartAlertsJobResult> {
  const { sql } = await import('drizzle-orm');
  const batchSize = job.data.batchSize ?? BATCH_SIZE;
  const offsetUserId = job.data.offsetUserId;

  // Fetch a page of users, ordered by id for stable cursor pagination
  const userRows = await db.execute<{ user_id: string }>(sql`
    SELECT id AS user_id
    FROM   identity.user
    ${offsetUserId ? sql`WHERE id > ${offsetUserId}::uuid` : sql``}
    ORDER  BY id
    LIMIT  ${batchSize}
  `).catch(() => ({ rows: [] as { user_id: string }[] }));

  const totals = { processed: 0, inserted: 0, skippedDedupe: 0, errors: 0 };

  for (const { user_id } of userRows.rows) {
    totals.processed++;

    const perUser = { inserted: 0, skipped: 0, errors: 0 };

    // Run all five alert checks in parallel; each catches its own errors
    await Promise.all([
      checkFavoritePromos(db, user_id, perUser, log),
      checkChallengeExpiry(db, user_id, perUser, log),
      checkEngagementNudge(db, user_id, perUser, log),
      checkNearbyOpenings(db, user_id, perUser, log),
      checkNewBusinessReviews(db, user_id, perUser, log),
    ]);

    totals.inserted      += perUser.inserted;
    totals.skippedDedupe += perUser.skipped;
    totals.errors        += perUser.errors;
  }

  log?.info(
    { ...totals, batchSize, offsetUserId },
    'SmartAlertsWorker: batch complete',
  );

  return totals;
}
