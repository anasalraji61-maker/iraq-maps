import type { Job } from 'bullmq';
import type { RecalculateTrendingScoresData, RecalculateTrendingScoresResult } from '@iraq-maps/job-kit';
import type { Logger } from '@iraq-maps/observability';

const DEFAULT_WINDOW_HOURS = 24;

/**
 * Processor: recalculates trending scores for discover posts based on likes+comments in the window.
 */
export async function processRecalculateTrendingScores(
  job: Job<RecalculateTrendingScoresData, RecalculateTrendingScoresResult>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: import("drizzle-orm/node-postgres").NodePgDatabase<any>,
  log?: Logger,
): Promise<RecalculateTrendingScoresResult> {
  const { sql } = await import('drizzle-orm');
  const windowHours = job.data.windowHours ?? DEFAULT_WINDOW_HOURS;

  // Score = likes in window * 2 + comments in window
  const res = await db.execute(sql`
    UPDATE discover.post p
    SET trending_score = (
      SELECT COUNT(*) * 2
      FROM discover.post_like l
      WHERE l.post_id = p.id AND l.created_at > now() - (${windowHours} || ' hours')::interval
    ) + (
      SELECT COUNT(*)
      FROM discover.comment c
      WHERE c.post_id = p.id AND c.created_at > now() - (${windowHours} || ' hours')::interval
    )
    WHERE p.deleted_at IS NULL
  `);
  const updated = (res as unknown as { rowCount: number }).rowCount ?? 0;
  log?.info({ updated, windowHours }, 'RecalculateTrendingScores complete');
  return { updated };
}
