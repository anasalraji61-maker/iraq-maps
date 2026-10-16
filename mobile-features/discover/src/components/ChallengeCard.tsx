/**
 * ChallengeCard — rich card for displaying a challenge with animated
 * progress ring, type icon, days-remaining countdown, reward preview,
 * and Join / Claim action button.
 *
 * Props:
 *   challenge  – ChallengeType2 (from @iraq-maps/contracts)
 *   onPress    – navigate to detail screen
 *   onClaim    – called when user taps "Claim Reward" (challenge completed)
 *   compact    – render smaller variant for carousels
 */
import type { ChallengeType2 } from '@iraq-maps/contracts';
import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from '../screens/shared';

I18nManager.forceRTL(true);

// ─── Constants ────────────────────────────────────────────────────────────────

const RING_SIZE = 64;
const RING_STROKE = 6;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Map ChallengeType to a single emoji icon. */
const KIND_ICON: Record<string, string> = {
  photo: '📷',
  checkin: '📍',
  review: '⭐',
  review_count: '✍️',
  place_visit: '🗺️',
  photo_upload: '🖼️',
  incident_report: '⚠️',
  consecutive_login: '🔥',
  category_explorer: '🧭',
  neighborhood_mapper: '🏘️',
  first_review: '🥇',
};

/** Map ChallengeType to a thematic accent colour. */
const KIND_COLOR: Record<string, string> = {
  photo: '#7B61FF',
  checkin: '#00B589',
  review: '#FF9800',
  review_count: '#FF9800',
  place_visit: '#00B589',
  photo_upload: '#7B61FF',
  incident_report: '#F44336',
  consecutive_login: '#FF5722',
  category_explorer: '#2196F3',
  neighborhood_mapper: '#4CAF50',
  first_review: '#FFD700',
};

// ─── Progress Ring ────────────────────────────────────────────────────────────

interface ProgressRingProps {
  value: number;
  max: number;
  accent: string;
  size?: number;
  stroke?: number;
}

function ProgressRing({ value, max, accent, size = RING_SIZE, stroke = RING_STROKE }: ProgressRingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const animPct = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animPct, {
      toValue: pct,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [pct, animPct]);

  const strokeDashoffset = animPct.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const pctInt = Math.round(pct * 100);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background track */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: `${accent}30`,
        }}
      />
      {/* Foreground arc — approximated with a border on one side */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: accent,
          borderTopColor: 'transparent',
          borderEndColor: 'transparent',
          transform: [
            {
              rotate: animPct.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: ['135deg', '315deg', '495deg'],
              }),
            },
          ],
        }}
      />
      <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{pctInt}%</Text>
    </View>
  );
}

// ─── Days Remaining ───────────────────────────────────────────────────────────

function daysRemaining(endsAt: string): number {
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ─── ChallengeCard ────────────────────────────────────────────────────────────

interface ChallengeCardProps {
  challenge: ChallengeType2;
  onPress: () => void;
  onClaim?: () => void;
  compact?: boolean;
}

export function ChallengeCard({ challenge, onPress, onClaim, compact = false }: ChallengeCardProps) {
  const accent = KIND_COLOR[challenge.type] ?? COLORS.primary;
  const icon = KIND_ICON[challenge.type] ?? '🏆';
  const days = daysRemaining(challenge.endsAt);
  const isCompleted = challenge.status === 'completed' || challenge.myProgress >= challenge.targetCount;
  const canClaim = isCompleted && typeof (challenge as Record<string, unknown>).myRewardClaimed === 'boolean'
    ? !(challenge as Record<string, unknown>).myRewardClaimed
    : isCompleted;

  const handleAction = useCallback(
    (e: { stopPropagation?: () => void }) => {
      e.stopPropagation?.();
      if (canClaim && onClaim) {
        onClaim();
      } else {
        onPress();
      }
    },
    [canClaim, onClaim, onPress],
  );

  if (compact) {
    return (
      <Pressable
        style={[compactStyles.card, { backgroundColor: COLORS.surface, borderLeftColor: accent }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={challenge.title}
      >
        <View style={compactStyles.iconWrap}>
          <Text style={compactStyles.icon}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[compactStyles.title, { color: COLORS.textPrimary }]} numberOfLines={1}>
            {challenge.title}
          </Text>
          <View style={compactStyles.progressTrack}>
            <View
              style={[
                compactStyles.progressFill,
                {
                  width: `${Math.min(100, challenge.targetCount > 0 ? (challenge.myProgress / challenge.targetCount) * 100 : 0)}%` as `${number}%`,
                  backgroundColor: accent,
                },
              ]}
            />
          </View>
        </View>
        <ProgressRing value={challenge.myProgress} max={challenge.targetCount} accent={accent} size={40} stroke={4} />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.card, { backgroundColor: COLORS.surface }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        {/* Type icon badge */}
        <View style={[styles.iconBadge, { backgroundColor: `${accent}20` }]}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>

        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={[styles.title, { color: COLORS.textPrimary }]} numberOfLines={2}>
            {challenge.title}
          </Text>
          <View style={styles.typePillRow}>
            <View style={[styles.typePill, { backgroundColor: accent }]}>
              <Text style={styles.typePillText}>
                {t(`challenges.types.${challenge.type}` as never)}
              </Text>
            </View>
            {challenge.status === 'active' && (
              <View style={[styles.typePill, { backgroundColor: COLORS.border }]}>
                <Text style={[styles.typePillText, { color: COLORS.textSecondary }]}>
                  {t('challenges.daysLeft', { days })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Progress ring */}
        <ProgressRing value={challenge.myProgress} max={challenge.targetCount} accent={accent} />
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(100, challenge.targetCount > 0 ? (challenge.myProgress / challenge.targetCount) * 100 : 0)}%` as `${number}%`,
              backgroundColor: accent,
            },
          ]}
        />
      </View>

      {/* Progress text + participants */}
      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: COLORS.textSecondary }]}>
          {t('challenges.progress', { current: challenge.myProgress, total: challenge.targetCount })}
        </Text>
        <Text style={[styles.metaText, { color: COLORS.textSecondary }]}>
          {t('challenges.participants', { count: challenge.totalParticipants })}
        </Text>
      </View>

      {/* Reward row */}
      {challenge.reward ? (
        <View style={styles.rewardRow}>
          <Text style={styles.rewardIcon}>🎁</Text>
          <Text style={[styles.rewardText, { color: accent }]}>
            {t('challenges.reward', { reward: challenge.reward })}
          </Text>
        </View>
      ) : null}

      {/* Rank row */}
      {challenge.myRank ? (
        <View style={styles.rankRow}>
          <Text style={[styles.rankText, { color: accent }]}>
            {t('challenges.myRank', { rank: challenge.myRank })}
          </Text>
        </View>
      ) : null}

      {/* Action button */}
      {challenge.status === 'active' || isCompleted ? (
        <Pressable
          style={[
            styles.actionBtn,
            {
              backgroundColor: canClaim ? accent : `${accent}20`,
              borderColor: accent,
            },
          ]}
          onPress={handleAction}
          accessibilityRole="button"
        >
          <Text style={[styles.actionBtnText, { color: canClaim ? '#fff' : accent }]}>
            {canClaim
              ? t('challenges.claimReward')
              : isCompleted
              ? t('challenges.completed')
              : t('challenges.participate')}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 6,
  },
  typePillRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typePillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaText: {
    fontSize: 11,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  rewardIcon: {
    fontSize: 14,
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rankRow: {
    marginTop: 4,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

const compactStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    borderStartWidth: 3,
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
});
