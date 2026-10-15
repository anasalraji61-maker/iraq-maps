import { describe, it, expect, vi } from 'vitest';
import type { Job } from 'bullmq';
import { JOB_NAMES } from '@iraq-maps/job-kit';
import { processCleanupExpiredStories } from './cleanup-expired-stories.js';
import { processSendNotificationDigest } from './send-notification-digest.js';
import { processRecalculateTrendingScores } from './recalculate-trending-scores.js';
import { processCleanupOldNotifications } from './cleanup-old-notifications.js';
import { processGenerateProviderInsights } from './generate-provider-insights.js';

// Mock drizzle-orm sql tag
vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

type AnyDb = import('drizzle-orm/node-postgres').NodePgDatabase<Record<string, unknown>>;
function makeDb(rowCount = 0): AnyDb {
  return {
    execute: vi.fn().mockResolvedValue({ rowCount }),
  } as unknown as AnyDb;
}

type AnyJob = Job<Record<string, unknown>, Record<string, unknown>>;
function makeJob(name: string, data: Record<string, unknown>): AnyJob {
  return { name, data, id: 'test-id' } as unknown as AnyJob;
}

describe('CleanupExpiredStories processor', () => {
  it('returns deleted count from db rowCount', async () => {
    const db = makeDb(5);
    const job = makeJob(JOB_NAMES.CLEANUP_EXPIRED_STORIES, { olderThanMs: 3600000 });
    const result = await processCleanupExpiredStories(job, db);
    expect(result.deleted).toBe(5);
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it('uses default olderThanMs when not provided', async () => {
    const db = makeDb(0);
    const job = makeJob(JOB_NAMES.CLEANUP_EXPIRED_STORIES, {});
    const result = await processCleanupExpiredStories(job, db);
    expect(result.deleted).toBe(0);
  });
});

describe('SendNotificationDigest processor', () => {
  it('returns sent count', async () => {
    const db = makeDb(10);
    const job = makeJob(JOB_NAMES.SEND_NOTIFICATION_DIGEST, {});
    const result = await processSendNotificationDigest(job, db);
    expect(result.sent).toBe(10);
  });

  it('filters by userId when provided', async () => {
    const db = makeDb(3);
    const job = makeJob(JOB_NAMES.SEND_NOTIFICATION_DIGEST, { userId: 'user-1' });
    const result = await processSendNotificationDigest(job, db);
    expect(result.sent).toBe(3);
  });
});

describe('RecalculateTrendingScores processor', () => {
  it('returns updated count', async () => {
    const db = makeDb(42);
    const job = makeJob(JOB_NAMES.RECALCULATE_TRENDING_SCORES, {});
    const result = await processRecalculateTrendingScores(job, db);
    expect(result.updated).toBe(42);
  });
});

describe('CleanupOldNotifications processor', () => {
  it('returns deleted count', async () => {
    const db = makeDb(7);
    const job = makeJob(JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS, { olderThanDays: 14 });
    const result = await processCleanupOldNotifications(job, db);
    expect(result.deleted).toBe(7);
  });
});

describe('GenerateProviderInsights processor', () => {
  it('returns generated count', async () => {
    const db = makeDb(2);
    const job = makeJob(JOB_NAMES.GENERATE_PROVIDER_INSIGHTS, {});
    const result = await processGenerateProviderInsights(job, db);
    expect(result.generated).toBe(2);
  });
});
