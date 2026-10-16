/**
 * CommunityLeaderboardScreen – top contributors for a city and time period.
 *
 * Sections:
 *  - City selector (Baghdad, Basra, Mosul, Erbil)
 *  - Period tabs: this week / this month / all time
 *  - Top 50 ranked contributors with badge tier
 *  - My rank card (pinned at the bottom)
 *  - Points explainer expandable section
 *
 * All text goes through t(). Layouts use start/end.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import type { ContributorEntry, LeaderboardResponse } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS, sharedStyles } from './shared';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CITIES: Array<{ id: string; labelKey: Parameters<typeof t>[0] }> = [
  { id: 'baghdad', labelKey: 'leaderboard.cityBaghdad' },
  { id: 'basra',   labelKey: 'leaderboard.cityBasra' },
  { id: 'mosul',   labelKey: 'leaderboard.cityMosul' },
  { id: 'erbil',   labelKey: 'leaderboard.cityErbil' },
];

const PERIODS: Array<{
  value: 'week' | 'month' | 'allTime';
  labelKey: Parameters<typeof t>[0];
}> = [
  { value: 'week',    labelKey: 'leaderboard.periodWeek' },
  { value: 'month',   labelKey: 'leaderboard.periodMonth' },
  { value: 'allTime', labelKey: 'leaderboard.periodAllTime' },
];

const BADGE_CONFIG: Record<
  ContributorEntry['badgeTier'],
  { emoji: string; color: string; labelKey: Parameters<typeof t>[0] }
> = {
  bronze:   { emoji: '🥉', color: '#CD7F32', labelKey: 'leaderboard.badgeBronze' },
  silver:   { emoji: '🥈', color: '#A8A9AD', labelKey: 'leaderboard.badgeSilver' },
  gold:     { emoji: '🥇', color: '#FFD700', labelKey: 'leaderboard.badgeGold' },
  platinum: { emoji: '💎', color: '#00BFFF', labelKey: 'leaderboard.badgePlatinum' },
};

const POINTS_BREAKDOWN: Array<{
  emoji: string;
  labelKey: Parameters<typeof t>[0];
  pts: number;
}> = [
  { emoji: '🚨', labelKey: 'leaderboard.pointsIncident', pts: 10 },
  { emoji: '⭐', labelKey: 'leaderboard.pointsReview',   pts: 15 },
  { emoji: '📍', labelKey: 'leaderboard.pointsPlace',    pts: 20 },
  { emoji: '📷', labelKey: 'leaderboard.pointsPhoto',    pts: 5  },
];

const RANK_PODIUM_BG: Record<number, string> = {
  1: '#FFD700',
  2: '#A8A9AD',
  3: '#CD7F32',
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function CommunityLeaderboardScreen(): ReactElement {
  const api = useApi();
  const [cityId, setCityId] = useState('baghdad');
  const [period, setPeriod] = useState<'week' | 'month' | 'allTime'>('month');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPoints, setShowPoints] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.incidents.leaderboard({
        query: { cityId, period },
      });
      if (res.status === 200) {
        setData(res.body);
      } else {
        setError(t('leaderboard.errorMsg'));
      }
    } catch {
      setError(t('leaderboard.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api, cityId, period]);

  useEffect(() => { void load(); }, [load]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('leaderboard.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('leaderboard.subtitle')}</Text>
      </View>

      {/* City selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.citySelectorContent}
        style={styles.citySelector}
      >
        {CITIES.map((city) => (
          <Pressable
            key={city.id}
            style={[styles.cityChip, cityId === city.id && styles.cityChipActive]}
            onPress={() => setCityId(city.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: cityId === city.id }}
            accessibilityLabel={t(city.labelKey)}
          >
            <Text style={[styles.cityChipText, cityId === city.id && styles.cityChipTextActive]}>
              {t(city.labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Period tabs */}
      <View style={styles.periodRow}>
        {PERIODS.map(({ value, labelKey }) => (
          <Pressable
            key={value}
            style={[styles.periodTab, period === value && styles.periodTabActive]}
            onPress={() => setPeriod(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: period === value }}
          >
            <Text style={[styles.periodTabText, period === value && styles.periodTabTextActive]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={sharedStyles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={[sharedStyles.center, { flex: 1 }]}>
          <Text style={sharedStyles.errorText}>{error}</Text>
          <Pressable onPress={() => { void load(); }} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t('leaderboard.retry')}</Text>
          </Pressable>
        </View>
      ) : data ? (
        <FlatList
          data={data.entries}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <ListHeader
              data={data}
              showPoints={showPoints}
              onTogglePoints={() => setShowPoints((v) => !v)}
            />
          }
          ListEmptyComponent={
            <View style={[sharedStyles.emptyContainer, { paddingTop: 32 }]}>
              <Text style={{ fontSize: 36 }}>🏆</Text>
              <Text style={sharedStyles.emptyText}>{t('leaderboard.empty')}</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <ContributorRow entry={item} rank={index + 1} />
          )}
          ListFooterComponent={
            data.myEntry ? (
              <MyRankCard entry={data.myEntry} />
            ) : null
          }
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// List header: podium + points explainer
// ---------------------------------------------------------------------------

function ListHeader({
  data,
  showPoints,
  onTogglePoints,
}: {
  data: LeaderboardResponse;
  showPoints: boolean;
  onTogglePoints: () => void;
}): ReactElement {
  const top3 = data.entries.slice(0, 3);

  return (
    <View>
      {/* Podium */}
      {top3.length > 0 && (
        <View style={styles.podium}>
          {top3.length > 1 && (
            <PodiumSlot entry={top3[1]!} rank={2} height={72} />
          )}
          <PodiumSlot entry={top3[0]!} rank={1} height={96} />
          {top3.length > 2 && (
            <PodiumSlot entry={top3[2]!} rank={3} height={56} />
          )}
        </View>
      )}

      {/* Points explainer toggle */}
      <Pressable
        style={styles.pointsToggle}
        onPress={onTogglePoints}
        accessibilityRole="button"
        accessibilityState={{ expanded: showPoints }}
      >
        <Text style={styles.pointsToggleText}>{t('leaderboard.pointsExplainerTitle')}</Text>
        <Text style={styles.pointsToggleArrow}>{showPoints ? '▲' : '▼'}</Text>
      </Pressable>

      {showPoints && (
        <View style={styles.pointsExplainer}>
          {POINTS_BREAKDOWN.map(({ emoji, labelKey, pts }) => (
            <View key={labelKey} style={styles.pointsRow}>
              <Text style={styles.pointsEmoji}>{emoji}</Text>
              <Text style={styles.pointsLabel}>{t(labelKey)}</Text>
              <Text style={styles.pointsValue}>+{pts} {t('leaderboard.pts')}</Text>
            </View>
          ))}
          <View style={styles.tierDivider} />
          <Text style={styles.tierTitle}>{t('leaderboard.tierTitle')}</Text>
          <View style={styles.tiersRow}>
            {(Object.entries(BADGE_CONFIG) as Array<[ContributorEntry['badgeTier'], typeof BADGE_CONFIG[ContributorEntry['badgeTier']]]>).map(([tier, cfg]) => (
              <View key={tier} style={styles.tierChip}>
                <Text style={styles.tierEmoji}>{cfg.emoji}</Text>
                <Text style={[styles.tierLabel, { color: cfg.color }]}>{t(cfg.labelKey)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.tierDetail}>
            {t('leaderboard.tierDetail')}
          </Text>
        </View>
      )}

      <Text style={styles.listSectionLabel}>{t('leaderboard.rankingsLabel')}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Podium slot
// ---------------------------------------------------------------------------

function PodiumSlot({
  entry,
  rank,
  height,
}: {
  entry: ContributorEntry;
  rank: number;
  height: number;
}): ReactElement {
  const badgeCfg = BADGE_CONFIG[entry.badgeTier];
  const podiumBg = RANK_PODIUM_BG[rank] ?? COLORS.primary;

  return (
    <View style={styles.podiumSlot}>
      {/* Avatar */}
      <View style={[styles.podiumAvatar, { borderColor: podiumBg }]}>
        <Text style={styles.podiumAvatarText}>
          {(entry.displayName ?? entry.userId).slice(0, 1).toUpperCase()}
        </Text>
      </View>

      {/* Badge */}
      <Text style={styles.podiumBadgeEmoji}>{badgeCfg.emoji}</Text>

      {/* Name */}
      <Text style={styles.podiumName} numberOfLines={1}>
        {entry.displayName ?? entry.userId.slice(0, 8)}
      </Text>

      {/* Points */}
      <Text style={styles.podiumPoints}>{entry.totalPoints} {t('leaderboard.pts')}</Text>

      {/* Platform */}
      <View style={[styles.podiumPlatform, { height, backgroundColor: podiumBg }]}>
        <Text style={styles.podiumRankText}>#{rank}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contributor row
// ---------------------------------------------------------------------------

function ContributorRow({
  entry,
  rank,
}: {
  entry: ContributorEntry;
  rank: number;
}): ReactElement {
  const badgeCfg = BADGE_CONFIG[entry.badgeTier];
  const isTop3 = rank <= 3;

  return (
    <View style={[styles.row, isTop3 && styles.rowTop3]}>
      {/* Rank */}
      <View style={styles.rankBox}>
        <Text style={[styles.rankText, isTop3 && { color: RANK_PODIUM_BG[rank] ?? COLORS.primary }]}>
          {rank}
        </Text>
      </View>

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: badgeCfg.color + '33' }]}>
        <Text style={[styles.avatarText, { color: badgeCfg.color }]}>
          {(entry.displayName ?? entry.userId).slice(0, 1).toUpperCase()}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.displayName ?? entry.userId.slice(0, 8)}
          </Text>
          <Text style={styles.badgeEmoji} accessibilityLabel={t(badgeCfg.labelKey)}>
            {badgeCfg.emoji}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <StatPill emoji="🚨" count={entry.incidentCount} />
          <StatPill emoji="⭐" count={entry.reviewCount} />
          <StatPill emoji="📍" count={entry.placeCount} />
          <StatPill emoji="📷" count={entry.photoCount} />
        </View>
      </View>

      {/* Points */}
      <View style={styles.pointsBox}>
        <Text style={styles.rowPoints}>{entry.totalPoints}</Text>
        <Text style={styles.rowPtsLabel}>{t('leaderboard.pts')}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stat pill
// ---------------------------------------------------------------------------

function StatPill({ emoji, count }: { emoji: string; count: number }): ReactElement | null {
  if (count === 0) return null;
  return (
    <View style={styles.statPill}>
      <Text style={styles.statPillEmoji}>{emoji}</Text>
      <Text style={styles.statPillCount}>{count}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// My rank card
// ---------------------------------------------------------------------------

function MyRankCard({ entry }: { entry: ContributorEntry }): ReactElement {
  const badgeCfg = BADGE_CONFIG[entry.badgeTier];

  return (
    <View style={styles.myCard}>
      <View style={styles.myCardLeft}>
        <Text style={styles.myCardLabel}>{t('leaderboard.myRank')}</Text>
        <Text style={styles.myCardRank}>#{entry.rank}</Text>
      </View>

      <View style={[styles.myCardAvatar, { backgroundColor: badgeCfg.color + '33' }]}>
        <Text style={[styles.myCardAvatarText, { color: badgeCfg.color }]}>
          {(entry.displayName ?? entry.userId).slice(0, 1).toUpperCase()}
        </Text>
      </View>

      <View style={styles.myCardMiddle}>
        <View style={styles.myCardBadgeRow}>
          <Text style={styles.myCardBadgeEmoji}>{badgeCfg.emoji}</Text>
          <Text style={[styles.myCardTier, { color: badgeCfg.color }]}>
            {t(badgeCfg.labelKey)}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <StatPill emoji="🚨" count={entry.incidentCount} />
          <StatPill emoji="⭐" count={entry.reviewCount} />
          <StatPill emoji="📍" count={entry.placeCount} />
          <StatPill emoji="📷" count={entry.photoCount} />
        </View>
      </View>

      <View style={styles.myCardRight}>
        <Text style={styles.myCardPoints}>{entry.totalPoints}</Text>
        <Text style={styles.myCardPtsLabel}>{t('leaderboard.pts')}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  citySelector: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    maxHeight: 52,
  },
  citySelectorContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.inputBg,
  },
  cityChipActive: {
    backgroundColor: COLORS.primary,
  },
  cityChipText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  cityChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  periodTabActive: {
    borderBottomWidth: 2.5,
    borderBottomColor: COLORS.primary,
  },
  periodTabText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  periodTabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 120,
  },
  // Podium
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    backgroundColor: COLORS.surface,
    gap: 4,
  },
  podiumSlot: {
    flex: 1,
    alignItems: 'center',
  },
  podiumAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    marginBottom: 4,
  },
  podiumAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
  },
  podiumBadgeEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumPoints: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  podiumPlatform: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopStartRadius: 6,
    borderTopEndRadius: 6,
  },
  podiumRankText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  // Points explainer
  pointsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    marginTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pointsToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  pointsToggleArrow: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  pointsExplainer: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  pointsEmoji: {
    fontSize: 16,
    width: 24,
  },
  pointsLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  pointsValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tierDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.divider,
    marginVertical: 10,
  },
  tierTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tiersRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tierChip: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    gap: 2,
  },
  tierEmoji: {
    fontSize: 22,
  },
  tierLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  tierDetail: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 8,
    lineHeight: 16,
  },
  listSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  // Contributor row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  rowTop3: {
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  rankBox: {
    width: 28,
    alignItems: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  badgeEmoji: {
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
  },
  statPillEmoji: {
    fontSize: 11,
  },
  statPillCount: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  pointsBox: {
    alignItems: 'center',
  },
  rowPoints: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  rowPtsLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  // My rank card
  myCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  myCardLeft: {
    alignItems: 'center',
  },
  myCardLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  myCardRank: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
  },
  myCardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myCardAvatarText: {
    fontSize: 20,
    fontWeight: '800',
  },
  myCardMiddle: {
    flex: 1,
    gap: 4,
  },
  myCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  myCardBadgeEmoji: {
    fontSize: 16,
  },
  myCardTier: {
    fontSize: 13,
    fontWeight: '700',
  },
  myCardRight: {
    alignItems: 'center',
  },
  myCardPoints: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
  },
  myCardPtsLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
});
