import type { UserId } from '@iraq-maps/contracts';

export type ReputationLevel =
  | 'explorer'
  | 'contributor'
  | 'scout'
  | 'local_guide'
  | 'expert'
  | 'ambassador';

export interface LevelProgress {
  currentMin: number;
  nextMin: number | null;
  percentage: number;
}

export interface ReputationSummary {
  userId: UserId;
  totalPoints: number;
  level: ReputationLevel;
  levelProgress: LevelProgress;
  badgeCount: number;
  updatedAt: string;
}

export interface BadgeDefinition {
  id: string;
  nameAr: string;
  nameCkb: string;
  nameEn: string;
  descriptionAr: string;
  descriptionCkb: string;
  descriptionEn: string;
  emoji: string;
  category: 'contribution' | 'social' | 'explorer' | 'safety' | 'special';
  threshold?: number;
  sortOrder: number;
}

export interface UserBadge extends BadgeDefinition {
  earned: boolean;
  awardedAt: string | null;
}

export interface PointsEntry {
  id: string;
  points: number;
  reason: string;
  meta: Record<string, unknown>;
  city: string | null;
  createdAt: string;
}

export type LeaderboardPeriod = 'week' | 'month' | 'all_time';

export interface LeaderboardEntry {
  rank: number;
  userId: UserId;
  periodPoints: number;
  level: ReputationLevel;
  topBadgeId: string | null;
}

export interface LeaderboardResult {
  items: LeaderboardEntry[];
  period: LeaderboardPeriod;
  city: string;
}

export interface BadgeCheckContext {
  city?: string;
  counters?: {
    checkins?: number;
    reviews?: number;
    incidents?: number;
    distinctPlaces?: number;
    baghdadVisits?: number;
    photos?: number;
    messages?: number;
    helpfulVotes?: number;
  };
}
