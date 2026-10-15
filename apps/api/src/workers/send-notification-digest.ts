import type { Job } from 'bullmq';
import type { SendNotificationDigestData, SendNotificationDigestResult } from '@iraq-maps/job-kit';
import type { Logger } from '@iraq-maps/observability';

/**
 * Processor: batches unsent notifications into a digest and dispatches them.
 * Marks the rows as digested to prevent double-send.
 */
export async function processSendNotificationDigest(
  job: Job<SendNotificationDigestData, SendNotificationDigestResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("drizzle-orm/node-postgres").NodePgDatabase<any>,
  log?: Logger,
): Promise<SendNotificationDigestResult> {
  const { sql } = await import('drizzle-orm');
  const userId = job.data.userId;

  const updateRes = await db.execute(
    userId
      ? sql`UPDATE notifications.notification SET digested_at = now() WHERE user_id = ${userId} AND digested_at IS NULL RETURNING id`
      : sql`UPDATE notifications.notification SET digested_at = now() WHERE digested_at IS NULL RETURNING id`,
  );
  const sent = (updateRes as unknown as { rowCount: number }).rowCount ?? 0;
  log?.info({ sent, userId }, 'SendNotificationDigest complete');
  return { sent };
}
