/**
 * FakeChallengesService — in-memory challenges system fake for testing.
 * Covers challenge lifecycle: create, progress tracking, completion, reward claiming,
 * expiry, double-claim prevention, leaderboard participation.
 */

type UserId = string;
type ChallengeId = string;
type ParticipantId = string;

export type ChallengeType =
  | 'review_count'
  | 'place_checkin'
  | 'incident_report'
  | 'photo_upload'
  | 'streak_login'
  | 'social_share';

export type ChallengeStatus = 'active' | 'completed' | 'expired' | 'draft';

export type RewardType = 'points' | 'badge' | 'discount_code';

export interface ChallengeReward {
  type: RewardType;
  points?: number;
  badgeId?: string;
  discountCode?: string;
  discountPercent?: number;
}

export interface Challenge {
  id: ChallengeId;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  type: ChallengeType;
  targetCount: number;
  reward: ChallengeReward;
  status: ChallengeStatus;
  cityId: string | null;
  maxParticipants: number | null;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChallengeParticipant {
  id: ParticipantId;
  challengeId: ChallengeId;
  userId: UserId;
  currentCount: number;
  completedAt: Date | null;
  rewardClaimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChallengeProgressEvent {
  participantId: ParticipantId;
  challengeId: ChallengeId;
  userId: UserId;
  delta: number;
  newCount: number;
  referenceId?: string;
  eventType: ChallengeType;
  createdAt: Date;
}

export interface CreateChallengeInput {
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  descriptionEn?: string;
  type: ChallengeType;
  targetCount: number;
  reward: ChallengeReward;
  cityId?: string;
  maxParticipants?: number;
  startsAt: Date;
  endsAt: Date;
}

export interface UpdateProgressInput {
  userId: UserId;
  challengeId: ChallengeId;
  delta?: number;
  referenceId?: string;
}

export class FakeChallengesService {
  private readonly challenges = new Map<ChallengeId, Challenge>();
  private readonly participants = new Map<ParticipantId, ChallengeParticipant>();
  private readonly events: ChallengeProgressEvent[] = [];
  private challengeSeq = 0;
  private participantSeq = 0;

  // ─── Challenge management ─────────────────────────────────────────────────

  createChallenge(input: CreateChallengeInput): Challenge {
    if (input.endsAt <= input.startsAt) {
      throw Object.assign(new Error('endsAt must be after startsAt'), { code: 'INVALID_RANGE' });
    }
    if (input.targetCount <= 0) {
      throw Object.assign(new Error('targetCount must be positive'), { code: 'INVALID_TARGET' });
    }

    const id: ChallengeId = `challenge-${++this.challengeSeq}`;
    const now = new Date();
    const challenge: Challenge = {
      id,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr ?? '',
      descriptionEn: input.descriptionEn ?? '',
      type: input.type,
      targetCount: input.targetCount,
      reward: input.reward,
      status: now >= input.startsAt && now < input.endsAt ? 'active' : 'draft',
      cityId: input.cityId ?? null,
      maxParticipants: input.maxParticipants ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: now,
      updatedAt: now,
    };
    this.challenges.set(id, challenge);
    return challenge;
  }

  getChallenge(challengeId: ChallengeId): Challenge | null {
    return this.challenges.get(challengeId) ?? null;
  }

  listActiveChallenges(opts: { cityId?: string; limit?: number } = {}): Challenge[] {
    const { cityId, limit = 50 } = opts;
    const now = new Date();
    return [...this.challenges.values()]
      .filter((c) => c.status === 'active')
      .filter((c) => now >= c.startsAt && now < c.endsAt)
      .filter((c) => (cityId ? c.cityId === cityId || c.cityId === null : true))
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
      .slice(0, limit);
  }

  updateChallengeStatus(challengeId: ChallengeId): Challenge {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw Object.assign(new Error('Challenge not found'), { code: 'NOT_FOUND' });

    const now = new Date();
    let status: ChallengeStatus = challenge.status;
    if (now >= challenge.endsAt) {
      status = 'expired';
    } else if (now >= challenge.startsAt) {
      status = 'active';
    }

    const updated = { ...challenge, status, updatedAt: now };
    this.challenges.set(challengeId, updated);
    return updated;
  }

  expireChallenge(challengeId: ChallengeId): Challenge {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw Object.assign(new Error('Challenge not found'), { code: 'NOT_FOUND' });
    const updated = { ...challenge, status: 'expired' as ChallengeStatus, updatedAt: new Date() };
    this.challenges.set(challengeId, updated);
    return updated;
  }

  // ─── Participation ─────────────────────────────────────────────────────────

  joinChallenge(userId: UserId, challengeId: ChallengeId): ChallengeParticipant {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw Object.assign(new Error('Challenge not found'), { code: 'NOT_FOUND' });
    if (challenge.status !== 'active') {
      throw Object.assign(
        new Error(`Cannot join challenge with status: ${challenge.status}`),
        { code: 'CHALLENGE_NOT_ACTIVE' },
      );
    }

    // Check capacity
    if (challenge.maxParticipants !== null) {
      const count = this.getParticipantCount(challengeId);
      if (count >= challenge.maxParticipants) {
        throw Object.assign(new Error('Challenge is full'), { code: 'CHALLENGE_FULL' });
      }
    }

    // Idempotent: return existing participant
    const existing = this.findParticipant(userId, challengeId);
    if (existing) return existing;

    const id: ParticipantId = `participant-${++this.participantSeq}`;
    const now = new Date();
    const participant: ChallengeParticipant = {
      id,
      challengeId,
      userId,
      currentCount: 0,
      completedAt: null,
      rewardClaimedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.participants.set(id, participant);
    return participant;
  }

  // ─── Progress ─────────────────────────────────────────────────────────────

  updateProgress(input: UpdateProgressInput): ChallengeParticipant {
    const { userId, challengeId, delta = 1, referenceId } = input;
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw Object.assign(new Error('Challenge not found'), { code: 'NOT_FOUND' });
    if (challenge.status !== 'active') {
      throw Object.assign(new Error('Challenge is not active'), { code: 'CHALLENGE_NOT_ACTIVE' });
    }

    let participant = this.findParticipant(userId, challengeId);
    if (!participant) {
      participant = this.joinChallenge(userId, challengeId);
    }

    const newCount = Math.min(participant.currentCount + delta, challenge.targetCount);
    const now = new Date();
    const completedAt =
      newCount >= challenge.targetCount && !participant.completedAt ? now : participant.completedAt;

    const updated: ChallengeParticipant = {
      ...participant,
      currentCount: newCount,
      completedAt,
      updatedAt: now,
    };
    this.participants.set(participant.id, updated);

    // Record event
    this.events.push({
      participantId: participant.id,
      challengeId,
      userId,
      delta,
      newCount,
      referenceId,
      eventType: challenge.type,
      createdAt: now,
    });

    return updated;
  }

  getProgress(userId: UserId, challengeId: ChallengeId): ChallengeParticipant | null {
    return this.findParticipant(userId, challengeId) ?? null;
  }

  getProgressPercentage(userId: UserId, challengeId: ChallengeId): number {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) return 0;
    const participant = this.findParticipant(userId, challengeId);
    if (!participant) return 0;
    return Math.round((participant.currentCount / challenge.targetCount) * 100);
  }

  // ─── Completion & rewards ──────────────────────────────────────────────────

  isCompleted(userId: UserId, challengeId: ChallengeId): boolean {
    const participant = this.findParticipant(userId, challengeId);
    return participant?.completedAt !== null && participant?.completedAt !== undefined;
  }

  isRewardClaimable(userId: UserId, challengeId: ChallengeId): boolean {
    const participant = this.findParticipant(userId, challengeId);
    if (!participant) return false;
    return participant.completedAt !== null && participant.rewardClaimedAt === null;
  }

  claimReward(userId: UserId, challengeId: ChallengeId): { reward: ChallengeReward; participant: ChallengeParticipant } {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw Object.assign(new Error('Challenge not found'), { code: 'NOT_FOUND' });

    const participant = this.findParticipant(userId, challengeId);
    if (!participant) throw Object.assign(new Error('Not participating'), { code: 'NOT_PARTICIPATING' });
    if (!participant.completedAt) {
      throw Object.assign(new Error('Challenge not completed'), { code: 'NOT_COMPLETED' });
    }
    if (participant.rewardClaimedAt) {
      throw Object.assign(new Error('Reward already claimed'), { code: 'ALREADY_CLAIMED' });
    }

    const now = new Date();
    const updated: ChallengeParticipant = {
      ...participant,
      rewardClaimedAt: now,
      updatedAt: now,
    };
    this.participants.set(participant.id, updated);

    return { reward: challenge.reward, participant: updated };
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  getChallengeLeaderboard(
    challengeId: ChallengeId,
    opts: { limit?: number } = {},
  ): Array<{ userId: UserId; currentCount: number; rank: number; completedAt: Date | null }> {
    const { limit = 20 } = opts;
    const challengeParticipants = [...this.participants.values()]
      .filter((p) => p.challengeId === challengeId)
      .sort((a, b) => {
        if (b.currentCount !== a.currentCount) return b.currentCount - a.currentCount;
        // Completed earlier = higher rank
        if (a.completedAt && b.completedAt) return a.completedAt.getTime() - b.completedAt.getTime();
        if (a.completedAt) return -1;
        if (b.completedAt) return 1;
        return 0;
      })
      .slice(0, limit);

    return challengeParticipants.map((p, index) => ({
      userId: p.userId,
      currentCount: p.currentCount,
      rank: index + 1,
      completedAt: p.completedAt,
    }));
  }

  getUserChallenges(
    userId: UserId,
    opts: { status?: 'active' | 'completed' | 'all' } = {},
  ): Array<{ challenge: Challenge; participant: ChallengeParticipant }> {
    const { status = 'all' } = opts;
    const userParticipants = [...this.participants.values()].filter((p) => p.userId === userId);

    return userParticipants
      .map((participant) => {
        const challenge = this.challenges.get(participant.challengeId);
        if (!challenge) return null;
        return { challenge, participant };
      })
      .filter((item): item is { challenge: Challenge; participant: ChallengeParticipant } => item !== null)
      .filter(({ participant }) => {
        if (status === 'completed') return participant.completedAt !== null;
        if (status === 'active') return participant.completedAt === null;
        return true;
      });
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  adminUpdateChallenge(
    challengeId: ChallengeId,
    updates: Partial<Pick<Challenge, 'titleAr' | 'titleEn' | 'status' | 'endsAt' | 'targetCount'>>,
  ): Challenge {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw Object.assign(new Error('Challenge not found'), { code: 'NOT_FOUND' });
    const updated = { ...challenge, ...updates, updatedAt: new Date() };
    this.challenges.set(challengeId, updated);
    return updated;
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  getChallengeStats(challengeId: ChallengeId): {
    participantCount: number;
    completedCount: number;
    claimedCount: number;
    averageProgress: number;
  } {
    const ps = [...this.participants.values()].filter((p) => p.challengeId === challengeId);
    const challenge = this.challenges.get(challengeId);
    const target = challenge?.targetCount ?? 1;

    return {
      participantCount: ps.length,
      completedCount: ps.filter((p) => p.completedAt !== null).length,
      claimedCount: ps.filter((p) => p.rewardClaimedAt !== null).length,
      averageProgress:
        ps.length > 0
          ? ps.reduce((sum, p) => sum + (p.currentCount / target) * 100, 0) / ps.length
          : 0,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private findParticipant(userId: UserId, challengeId: ChallengeId): ChallengeParticipant | null {
    for (const p of this.participants.values()) {
      if (p.userId === userId && p.challengeId === challengeId) return p;
    }
    return null;
  }

  private getParticipantCount(challengeId: ChallengeId): number {
    let count = 0;
    for (const p of this.participants.values()) {
      if (p.challengeId === challengeId) count++;
    }
    return count;
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  reset(): void {
    this.challenges.clear();
    this.participants.clear();
    this.events.length = 0;
    this.challengeSeq = 0;
    this.participantSeq = 0;
  }

  // ─── Introspection ────────────────────────────────────────────────────────

  get allChallenges(): Challenge[] {
    return [...this.challenges.values()];
  }

  get allParticipants(): ChallengeParticipant[] {
    return [...this.participants.values()];
  }

  get allEvents(): ChallengeProgressEvent[] {
    return [...this.events];
  }
}
