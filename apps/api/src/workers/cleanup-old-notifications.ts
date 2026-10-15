import type { Job } from 'bullmq';
import type { CleanupOldNotificationsData, CleanupOldNotificationsResult } from '@iraq-maps/job-kit';
import type { Logger } from '@iraq-maps/observability';

const DEFAULT_OLDER_THAN_DAYS = 30;

/**
 * Processor: hard-deletes notifications that were read and are older than the threshold.
 */
export async function processCleanupOldNotifications(
  job: Job<CleanupOldNotificationsData, CleanupOldNotificationsResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("drizzle-orm/node-postgres").NodePgDatabase<any>,
  log?: Logger,
): Promise<CleanupOldNotificationsResult> {
  const { sql } = await import('drizzle-orm');
  const olderThanDays = job.data.olderThanDays ?? DEFAULT_OLDER_THAN_DAYS;

  const res = await db.execute(
    sql`DELETE FROM notifications.notification WHERE read_at IS NOT NULL AND created_at < now() - (${olderThanDays} || ' days')::interval`,
  );
  const deleted = (res as unknown as { rowCount: number }).rowCount ?? 0;
  log?.info({ deleted, olderThanDays }, 'CleanupOldNotifications complete');
  return { deleted };
}
