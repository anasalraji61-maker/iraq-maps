import type { Job } from 'bullmq';
import type { CleanupExpiredStoriesData, CleanupExpiredStoriesResult } from '@iraq-maps/job-kit';
import type { Logger } from '@iraq-maps/observability';

const DEFAULT_OLDER_THAN_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Processor: deletes expired discover stories (posts with expiry < now).
 * Stories table is in the discover schema.
 */
export async function processCleanupExpiredStories(
  job: Job<CleanupExpiredStoriesData, CleanupExpiredStoriesResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import('drizzle-orm/node-postgres').NodePgDatabase<any>,
  log?: Logger,
): Promise<CleanupExpiredStoriesResult> {
  const olderThanMs = job.data.olderThanMs ?? DEFAULT_OLDER_THAN_MS;
  const cutoff = new Date(Date.now() - olderThanMs);
  const { sql } = await import('drizzle-orm');
  const res = await db.execute(
    sql`DELETE FROM discover.post WHERE expires_at IS NOT NULL AND expires_at < ${cutoff}`,
  );
  const deleted = (res as unknown as { rowCount: number }).rowCount ?? 0;
  log?.info({ deleted, cutoff }, 'CleanupExpiredStories complete');
  return { deleted };
}
