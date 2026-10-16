import { JobQueue, JobWorker, JOB_NAMES } from '@iraq-maps/job-kit';
import type { Logger } from '@iraq-maps/observability';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = import('drizzle-orm/node-postgres').NodePgDatabase<any>;
import { processCleanupExpiredStories } from './cleanup-expired-stories.js';
import { processSendNotificationDigest } from './send-notification-digest.js';
import { processRecalculateTrendingScores } from './recalculate-trending-scores.js';
import { processCleanupOldNotifications } from './cleanup-old-notifications.js';
import { processGenerateProviderInsights } from './generate-provider-insights.js';
import { processRecalculateProviderScores } from './ranking-worker.js';
import { processSmartAlerts } from './smart-alerts-worker.js';

/** Job name constant for smart alerts (pending job-kit contract addition in docs/contract-requests). */
const SMART_ALERTS_JOB = 'SmartAlerts' as const;

export const BACKGROUND_QUEUE_NAME = 'background';

/** CRON schedules for each recurring job. */
const SCHEDULES: Record<string, string> = {
  [JOB_NAMES.CLEANUP_EXPIRED_STORIES]: '0 * * * *',           // every hour
  [JOB_NAMES.SEND_NOTIFICATION_DIGEST]: '*/15 * * * *',        // every 15 min
  [JOB_NAMES.RECALCULATE_TRENDING_SCORES]: '*/30 * * * *',     // every 30 min
  [JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS]: '0 2 * * *',          // daily at 2am UTC
  [JOB_NAMES.GENERATE_PROVIDER_INSIGHTS]: '0 3 * * *',         // daily at 3am UTC
  [JOB_NAMES.RECALCULATE_PROVIDER_SCORES]: '0 4 * * *',        // daily at 4am UTC
  [SMART_ALERTS_JOB]: '30 23 * * *',                           // daily 23:30 UTC = 02:30 Baghdad
};

/** Creates the background job queue and registers all CRON schedules. */
export async function createJobQueue(redisUrl: string): Promise<JobQueue> {
  const queue = new JobQueue(BACKGROUND_QUEUE_NAME, redisUrl);
  await queue.schedule(JOB_NAMES.CLEANUP_EXPIRED_STORIES, SCHEDULES[JOB_NAMES.CLEANUP_EXPIRED_STORIES]!, {});
  await queue.schedule(JOB_NAMES.SEND_NOTIFICATION_DIGEST, SCHEDULES[JOB_NAMES.SEND_NOTIFICATION_DIGEST]!, {});
  await queue.schedule(JOB_NAMES.RECALCULATE_TRENDING_SCORES, SCHEDULES[JOB_NAMES.RECALCULATE_TRENDING_SCORES]!, {});
  await queue.schedule(JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS, SCHEDULES[JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS]!, {});
  await queue.schedule(JOB_NAMES.GENERATE_PROVIDER_INSIGHTS, SCHEDULES[JOB_NAMES.GENERATE_PROVIDER_INSIGHTS]!, {});
  await queue.schedule(JOB_NAMES.RECALCULATE_PROVIDER_SCORES, SCHEDULES[JOB_NAMES.RECALCULATE_PROVIDER_SCORES]!, {});
  await queue.schedule(SMART_ALERTS_JOB, SCHEDULES[SMART_ALERTS_JOB]!, {});
  return queue;
}

/** Creates the background job worker with all processors registered. */
export function createJobWorker(
  redisUrl: string,
  db: AnyDb,
  log?: Logger,
): JobWorker {
  return new JobWorker(
    BACKGROUND_QUEUE_NAME,
    redisUrl,
    {
      [JOB_NAMES.CLEANUP_EXPIRED_STORIES]: (job) => processCleanupExpiredStories(job, db, log),
      [JOB_NAMES.SEND_NOTIFICATION_DIGEST]: (job) => processSendNotificationDigest(job, db, log),
      [JOB_NAMES.RECALCULATE_TRENDING_SCORES]: (job) => processRecalculateTrendingScores(job, db, log),
      [JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS]: (job) => processCleanupOldNotifications(job, db, log),
      [JOB_NAMES.GENERATE_PROVIDER_INSIGHTS]: (job) => processGenerateProviderInsights(job, db, log),
      [JOB_NAMES.RECALCULATE_PROVIDER_SCORES]: (job) => processRecalculateProviderScores(job, db, log),
      [SMART_ALERTS_JOB]: (job) => processSmartAlerts(job, db, log),
    },
    log,
  );
}

export {
  processCleanupExpiredStories,
  processSendNotificationDigest,
  processRecalculateTrendingScores,
  processCleanupOldNotifications,
  processGenerateProviderInsights,
  processRecalculateProviderScores,
  processSmartAlerts,
};
