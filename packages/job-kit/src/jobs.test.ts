import { describe, it, expect } from 'vitest';
import { JOB_NAMES } from './jobs.js';

describe('JOB_NAMES', () => {
  it('has all six job names', () => {
    expect(JOB_NAMES.CLEANUP_EXPIRED_STORIES).toBe('CleanupExpiredStories');
    expect(JOB_NAMES.SEND_NOTIFICATION_DIGEST).toBe('SendNotificationDigest');
    expect(JOB_NAMES.RECALCULATE_TRENDING_SCORES).toBe('RecalculateTrendingScores');
    expect(JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS).toBe('CleanupOldNotifications');
    expect(JOB_NAMES.GENERATE_PROVIDER_INSIGHTS).toBe('GenerateProviderInsights');
    expect(JOB_NAMES.RECALCULATE_PROVIDER_SCORES).toBe('RecalculateProviderScores');
  });

  it('has exactly six entries', () => {
    expect(Object.keys(JOB_NAMES)).toHaveLength(6);
  });
});
