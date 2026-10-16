/**
 * Typed job definitions for all background jobs in iraq-maps.
 * Each job has a name and a typed data/result contract.
 */

export const JOB_NAMES = {
  CLEANUP_EXPIRED_STORIES: 'CleanupExpiredStories',
  SEND_NOTIFICATION_DIGEST: 'SendNotificationDigest',
  RECALCULATE_TRENDING_SCORES: 'RecalculateTrendingScores',
  CLEANUP_OLD_NOTIFICATIONS: 'CleanupOldNotifications',
  GENERATE_PROVIDER_INSIGHTS: 'GenerateProviderInsights',
  RECALCULATE_PROVIDER_SCORES: 'RecalculateProviderScores',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface CleanupExpiredStoriesData {
  olderThanMs?: number;
}
export interface CleanupExpiredStoriesResult {
  deleted: number;
}

export interface SendNotificationDigestData {
  userId?: string;
}
export interface SendNotificationDigestResult {
  sent: number;
}

export interface RecalculateTrendingScoresData {
  windowHours?: number;
}
export interface RecalculateTrendingScoresResult {
  updated: number;
}

export interface CleanupOldNotificationsData {
  olderThanDays?: number;
}
export interface CleanupOldNotificationsResult {
  deleted: number;
}

export interface GenerateProviderInsightsData {
  providerId?: string;
}
export interface GenerateProviderInsightsResult {
  generated: number;
}

export interface RecalculateProviderScoresData {
  /** When set, only recalculate the score for this provider. */
  providerId?: string;
}
export interface RecalculateProviderScoresResult {
  processed:  number;
  errors:     number;
  durationMs: number;
}

export type JobDataMap = {
  [JOB_NAMES.CLEANUP_EXPIRED_STORIES]: CleanupExpiredStoriesData;
  [JOB_NAMES.SEND_NOTIFICATION_DIGEST]: SendNotificationDigestData;
  [JOB_NAMES.RECALCULATE_TRENDING_SCORES]: RecalculateTrendingScoresData;
  [JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS]: CleanupOldNotificationsData;
  [JOB_NAMES.GENERATE_PROVIDER_INSIGHTS]: GenerateProviderInsightsData;
  [JOB_NAMES.RECALCULATE_PROVIDER_SCORES]: RecalculateProviderScoresData;
};

export type JobResultMap = {
  [JOB_NAMES.CLEANUP_EXPIRED_STORIES]: CleanupExpiredStoriesResult;
  [JOB_NAMES.SEND_NOTIFICATION_DIGEST]: SendNotificationDigestResult;
  [JOB_NAMES.RECALCULATE_TRENDING_SCORES]: RecalculateTrendingScoresResult;
  [JOB_NAMES.CLEANUP_OLD_NOTIFICATIONS]: CleanupOldNotificationsResult;
  [JOB_NAMES.GENERATE_PROVIDER_INSIGHTS]: GenerateProviderInsightsResult;
  [JOB_NAMES.RECALCULATE_PROVIDER_SCORES]: RecalculateProviderScoresResult;
};
