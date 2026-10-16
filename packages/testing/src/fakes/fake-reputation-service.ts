/**
 * FakeReputationService — in-memory reputation system fake for testing.
 * Covers points, badges, leaderboard, review likes, incident confirmation.
 */

type UserId = string;
type ReviewId = string;
type BadgeSlug = string;
type IncidentId = string;

export interface PointEntry {
  userId: UserId;
  delta: number;
  reason: PointReason;
  referenceId?: string;
  createdAt: Date;
}

export type PointReason =
  | 'review_written'
  | 'review_liked'
  | 'review_reached_threshold'
  | 'incident_reported'
  | 'incident_confirmed'
  | 'badge_awarded'
  | 'first_review'
  | 'manual_adjustment';

export interface Badge {
  slug: BadgeSlug;
  name: string;
  description: string;
  threshold?: number;
  icon?: string;
}

export interface UserBadge {
  userId: UserId;
  badgeSlug: BadgeSlug;
  awardedAt: Date;
}

export interface ReviewLike {
  reviewId: ReviewId;
  likerId: UserId;
  createdAt: Date;
}

export interface Incident {
  id: IncidentId;
  reporterId: UserId;
  type: string;
  placeId: string;
  description: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: Date;
  resolvedAt?: Date;
}

/** Default badge definitions */
const DEFAULT_BADGES: Badge[] = [
  { slug: 'first_review', name: 'المراجع الأول', description: 'كتبت مراجعتك الأولى', threshold: 1 },
  { slug: 'reviewer_5', name: 'مراجع نشيط', description: '5 مراجعات', threshold: 5 },
  { slug: 'reviewer_25', name: 'مراجع محترف', description: '25 مراجعة', threshold: 25 },
  { slug: 'helpful_10', name: 'مفيد', description: '10 إعجابات على مراجعاتك', threshold: 10 },
  { slug: 'incident_reporter', name: 'مبلّغ أمين', description: 'أبلغت عن حادثة أولى', threshold: 1 },
  { slug: 'points_100', name: 'مساهم', description: '100 نقطة', threshold: 100 },
  { slug: 'points_500', name: 'خبير', description: '500 نقطة', threshold: 500 },
];

/** Points awarded per action */
const POINT_VALUES: Record<PointReason, number> = {
  review_written: 10,
  review_liked: 2,
  review_reached_threshold: 20,
  incident_reported: 5,
  incident_confirmed: 25,
  badge_awarded: 0,
  first_review: 15,
  manual_adjustment: 0,
};

/** Like count threshold for the bonus */
const LIKE_THRESHOLD = 5;

export class FakeReputationService {
  private readonly ledger: PointEntry[] = [];
  private readonly userBadges: UserBadge[] = [];
  private readonly badges: Map<BadgeSlug, Badge> = new Map(
    DEFAULT_BADGES.map((b) => [b.slug, b]),
  );
  private readonly reviewLikes: ReviewLike[] = [];
  private readonly incidents: Map<IncidentId, Incident> = new Map();
  private readonly reviewCounts = new Map<UserId, number>();
  private incidentSeq = 0;

  // ─── Points ───────────────────────────────────────────────────────────────

  private award(userId: UserId, reason: PointReason, referenceId?: string, customDelta?: number): void {
    const delta = customDelta ?? POINT_VALUES[reason];
    if (delta === 0) return;
    this.ledger.push({ userId, delta, reason, referenceId, createdAt: new Date() });
  }

  getTotalPoints(userId: UserId): number {
    return this.ledger
      .filter((e) => e.userId === userId)
      .reduce((sum, e) => sum + e.delta, 0);
  }

  getPointHistory(userId: UserId): PointEntry[] {
    return this.ledger.filter((e) => e.userId === userId);
  }

  getUserProfile(userId: UserId): {
    userId: UserId;
    points: number;
    badges: UserBadge[];
    reviewCount: number;
  } {
    return {
      userId,
      points: this.getTotalPoints(userId),
      badges: this.userBadges.filter((ub) => ub.userId === userId),
      reviewCount: this.reviewCounts.get(userId) ?? 0,
    };
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────

  onReviewWritten(reviewerId: UserId, reviewId: ReviewId): void {
    const count = (this.reviewCounts.get(reviewerId) ?? 0) + 1;
    this.reviewCounts.set(reviewerId, count);

    if (count === 1) {
      this.award(reviewerId, 'first_review', reviewId);
    }
    this.award(reviewerId, 'review_written', reviewId);
    this.checkBadges(reviewerId);
  }

  // ─── Review likes ──────────────────────────────────────────────────────────

  onReviewLiked(reviewerId: UserId, reviewId: ReviewId, likerId: UserId): void {
    if (reviewerId === likerId) {
      throw Object.assign(new Error('Cannot like your own review'), { code: 'SELF_LIKE' });
    }

    const alreadyLiked = this.reviewLikes.some(
      (l) => l.reviewId === reviewId && l.likerId === likerId,
    );
    if (alreadyLiked) {
      throw Object.assign(new Error('Already liked'), { code: 'DUPLICATE_LIKE' });
    }

    this.reviewLikes.push({ reviewId, likerId, createdAt: new Date() });
    this.award(reviewerId, 'review_liked', reviewId);

    // Bonus at threshold
    const likeCount = this.getLikeCount(reviewId);
    if (likeCount === LIKE_THRESHOLD) {
      this.award(reviewerId, 'review_reached_threshold', reviewId);
    }

    this.checkBadges(reviewerId);
  }

  getLikeCount(reviewId: ReviewId): number {
    return this.reviewLikes.filter((l) => l.reviewId === reviewId).length;
  }

  hasLiked(reviewId: ReviewId, userId: UserId): boolean {
    return this.reviewLikes.some((l) => l.reviewId === reviewId && l.likerId === userId);
  }

  getTotalLikesForUser(userId: UserId): number {
    return this.ledger
      .filter((e) => e.userId === userId && e.reason === 'review_liked')
      .length;
  }

  // ─── Incidents ────────────────────────────────────────────────────────────

  reportIncident(
    reporterId: UserId,
    input: { type: string; placeId: string; description: string },
  ): Incident {
    const VALID_TYPES = ['price_mismatch', 'wrong_location', 'closed', 'fake_listing', 'other'];
    if (!VALID_TYPES.includes(input.type)) {
      throw Object.assign(new Error(`Invalid incident type: ${input.type}`), { code: 'INVALID_TYPE' });
    }

    const id: IncidentId = `incident-${++this.incidentSeq}`;
    const incident: Incident = {
      id,
      reporterId,
      ...input,
      status: 'pending',
      createdAt: new Date(),
    };
    this.incidents.set(id, incident);
    this.award(reporterId, 'incident_reported', id);
    this.checkBadges(reporterId);
    return incident;
  }

  confirmIncident(incidentId: IncidentId): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    if (incident.status !== 'pending') {
      throw Object.assign(new Error('Already resolved'), { code: 'ALREADY_RESOLVED' });
    }

    this.incidents.set(incidentId, {
      ...incident,
      status: 'confirmed',
      resolvedAt: new Date(),
    });
    this.award(incident.reporterId, 'incident_confirmed', incidentId);
    this.checkBadges(incident.reporterId);
  }

  rejectIncident(incidentId: IncidentId): void {
    const incident = this.incidents.get(incidentId);
    if (!incident) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    this.incidents.set(incidentId, {
      ...incident,
      status: 'rejected',
      resolvedAt: new Date(),
    });
  }

  getIncident(incidentId: IncidentId): Incident | null {
    return this.incidents.get(incidentId) ?? null;
  }

  getUserIncidents(userId: UserId): Incident[] {
    return [...this.incidents.values()].filter((i) => i.reporterId === userId);
  }

  // ─── Badges ───────────────────────────────────────────────────────────────

  private checkBadges(userId: UserId): void {
    const points = this.getTotalPoints(userId);
    const reviews = this.reviewCounts.get(userId) ?? 0;
    const incidents = this.getUserIncidents(userId).filter((i) => i.status === 'confirmed').length;
    const totalLikes = this.getTotalLikesForUser(userId);

    const conditions: Array<{ slug: BadgeSlug; met: boolean }> = [
      { slug: 'first_review', met: reviews >= 1 },
      { slug: 'reviewer_5', met: reviews >= 5 },
      { slug: 'reviewer_25', met: reviews >= 25 },
      { slug: 'incident_reporter', met: incidents >= 1 },
      { slug: 'helpful_10', met: totalLikes >= 10 },
      { slug: 'points_100', met: points >= 100 },
      { slug: 'points_500', met: points >= 500 },
    ];

    for (const { slug, met } of conditions) {
      if (met && !this.hasBadge(userId, slug)) {
        this.awardBadge(userId, slug);
      }
    }
  }

  private hasBadge(userId: UserId, slug: BadgeSlug): boolean {
    return this.userBadges.some((ub) => ub.userId === userId && ub.badgeSlug === slug);
  }

  private awardBadge(userId: UserId, slug: BadgeSlug): void {
    this.userBadges.push({ userId, badgeSlug: slug, awardedAt: new Date() });
  }

  getUserBadges(userId: UserId): Array<Badge & { awardedAt: Date }> {
    return this.userBadges
      .filter((ub) => ub.userId === userId)
      .map((ub) => ({
        ...this.badges.get(ub.badgeSlug)!,
        awardedAt: ub.awardedAt,
      }))
      .filter(Boolean);
  }

  getAllBadges(): Badge[] {
    return [...this.badges.values()];
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  getLeaderboard(
    opts: { limit?: number; offset?: number } = {},
  ): Array<{ userId: UserId; points: number; rank: number }> {
    const { limit = 20, offset = 0 } = opts;

    const userIds = new Set<UserId>();
    for (const entry of this.ledger) userIds.add(entry.userId);

    const ranked = [...userIds]
      .map((userId) => ({ userId, points: this.getTotalPoints(userId) }))
      .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));

    return ranked
      .slice(offset, offset + limit)
      .map((entry, index) => ({ ...entry, rank: offset + index + 1 }));
  }

  getUserRank(userId: UserId): number | null {
    const board = this.getLeaderboard({ limit: 10_000 });
    const entry = board.find((e) => e.userId === userId);
    return entry?.rank ?? null;
  }

  // ─── Manual adjustment (admin) ─────────────────────────────────────────────

  adjustPoints(userId: UserId, delta: number, reason = 'manual_adjustment' as PointReason): void {
    this.award(userId, reason, undefined, delta);
    this.checkBadges(userId);
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  reset(): void {
    this.ledger.length = 0;
    this.userBadges.length = 0;
    this.reviewLikes.length = 0;
    this.incidents.clear();
    this.reviewCounts.clear();
    this.incidentSeq = 0;
  }
}
