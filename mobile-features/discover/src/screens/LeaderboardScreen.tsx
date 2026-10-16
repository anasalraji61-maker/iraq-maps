/**
 * LeaderboardScreen — city reputation leaderboard with:
 *   - City selector (Baghdad / Basra / Mosul / Erbil)
 *   - Period tabs: week / month / all time
 *   - Category tabs: overall / reviews / places / safety
 *   - Podium (top 3) with special styling
 *   - Full ranked list (FlatList)
 *   - My rank card pinned at the bottom
 *   - Badge emoji next to each user
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: discover/leaderboard
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useApi } from '@iraq-maps/mobile-kit';
import type {
  LeaderboardEntry,
  LeaderboardResult,
  ReputationLevel,
  UserBadge,
} from '@iraq-maps/contracts';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  primary:       '#1565C0',
  primaryLight:  '#E3F2FD',
  surface:       '#FFFFFF',
  bg:            '#F5F7FA',
  text:          '#1A1A2E',
  textSecondary: '#546E7A',
  textHint:      '#90A4AE',
  border:        '#E0E0E0',
  gold:          '#FFD600',
  goldBg:        '#FFFDE7',
  silver:        '#9E9E9E',
  silverBg:      '#F5F5F5',
  bronze:        '#BF8F6A',
  bronzeBg:      '#FBF0E8',
  podiumGold:    '#F9A825',
  podiumSilver:  '#78909C',
  podiumBronze:  '#A1887F',
  myRankBg:      '#E8F5E9',
  myRankBorder:  '#2E7D32',
  danger:        '#C62828',
  // Level colors
  explorer:      '#78909C',
  contributor:   '#43A047',
  scout:         '#1E88E5',
  local_guide:   '#8E24AA',
  expert:        '#F4511E',
  ambassador:    '#F9A825',
} as const;

// ── Config ────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'all_time';
type Category = 'overall' | 'reviews' | 'places' | 'safety';

const CITIES: Array<{ id: string; labelKey: Parameters<typeof t>[0] }> = [
  { id: 'baghdad', labelKey: 'repLeaderboard.cityBaghdad' },
  { id: 'basra',   labelKey: 'repLeaderboard.cityBasra' },
  { id: 'mosul',   labelKey: 'repLeaderboard.cityMosul' },
  { id: 'erbil',   labelKey: 'repLeaderboard.cityErbil' },
];

const PERIODS: Array<{ value: Period; labelKey: Parameters<typeof t>[0] }> = [
  { value: 'week',     labelKey: 'repLeaderboard.periodWeek' },
  { value: 'month',    labelKey: 'repLeaderboard.periodMonth' },
  { value: 'all_time', labelKey: 'repLeaderboard.periodAllTime' },
];

const CATEGORIES: Array<{ value: Category; labelKey: Parameters<typeof t>[0] }> = [
  { value: 'overall', labelKey: 'repLeaderboard.categoryOverall' },
  { value: 'reviews', labelKey: 'repLeaderboard.categoryReviews' },
  { value: 'places',  labelKey: 'repLeaderboard.categoryPlaces' },
  { value: 'safety',  labelKey: 'repLeaderboard.categorySafety' },
];

const LEVEL_COLORS: Record<ReputationLevel, string> = {
  explorer:    C.explorer,
  contributor: C.contributor,
  scout:       C.scout,
  local_guide: C.local_guide,
  expert:      C.expert,
  ambassador:  C.ambassador,
};

const LEVEL_EMOJIS: Record<ReputationLevel, string> = {
  explorer:    '🗺️',
  contributor: '✨',
  scout:       '🔭',
  local_guide: '📍',
  expert:      '🎯',
  ambassador:  '🌟',
};

// ── Badge catalog (minimal copy to render emoji offline) ──────────────────────

const BADGE_EMOJIS: Record<string, string> = {
  first_steps:       '🗺️',
  reviewer:          '⭐',
  top_reviewer:      '🏆',
  safety_first:      '🚨',
  explorer:          '📍',
  baghdad_pro:       '🏙️',
  photographer:      '📷',
  conversationalist: '💬',
  community_pillar:  '🤝',
  local_expert:      '🌟',
};

// ── Podium component ──────────────────────────────────────────────────────────

interface PodiumProps {
  top3: LeaderboardEntry[];
  badgeMap: Map<string, string>;
}

function Podium({ top3, badgeMap }: PodiumProps): ReactElement {
  const first  = top3[0];
  const second = top3[1];
  const third  = top3[2];

  const podiumHeights = [110, 80, 60] as const;
  const podiumColors  = [C.podiumGold, C.podiumSilver, C.podiumBronze] as const;
  const podiumBgs     = [C.goldBg, C.silverBg, C.bronzeBg] as const;
  const medals        = ['🥇', '🥈', '🥉'] as const;

  // Render order: second (left), first (center), third (right) — visually
  const slots: Array<LeaderboardEntry | undefined> = [second, first, third];

  return (
    <View style={styles.podiumContainer}>
      {slots.map((entry, slotIdx) => {
        // Map slot index back to rank index (0=1st, 1=2nd, 2=3rd)
        const rankIdx = slotIdx === 0 ? 1 : slotIdx === 1 ? 0 : 2;
        if (!entry) return <View key={slotIdx} style={styles.podiumSlotEmpty} />;

        const badgeEmoji = entry.topBadgeId ? badgeMap.get(entry.topBadgeId) : null;
        const podiumH = podiumHeights[rankIdx];
        const podiumColor = podiumColors[rankIdx];
        const podiumBg = podiumBgs[rankIdx];
        const medal = medals[rankIdx];
        const levelColor = LEVEL_COLORS[entry.level];

        return (
          <View key={entry.userId as string} style={styles.podiumSlot}>
            {/* User avatar circle */}
            <View style={[styles.podiumAvatar, { borderColor: podiumColor }]}>
              <Text style={styles.podiumAvatarEmoji}>
                {LEVEL_EMOJIS[entry.level]}
              </Text>
              {badgeEmoji && (
                <Text style={styles.podiumBadgeEmoji}>{badgeEmoji}</Text>
              )}
            </View>

            {/* Medal */}
            <Text style={styles.podiumMedal}>{medal}</Text>

            {/* Points */}
            <Text style={[styles.podiumPoints, { color: podiumColor }]}>
              {t('repLeaderboard.points', { count: entry.periodPoints })}
            </Text>

            {/* Platform */}
            <View
              style={[
                styles.podiumPlatform,
                { height: podiumH, backgroundColor: podiumBg, borderTopColor: podiumColor },
              ]}
            >
              <Text style={[styles.podiumRankNum, { color: podiumColor }]}>
                {entry.rank}
              </Text>
              <View style={[styles.podiumLevelDot, { backgroundColor: levelColor }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Rank list item ─────────────────────────────────────────────────────────────

interface RankItemProps {
  entry: LeaderboardEntry;
  badgeMap: Map<string, string>;
  isMe: boolean;
}

function RankItem({ entry, badgeMap, isMe }: RankItemProps): ReactElement {
  const levelColor = LEVEL_COLORS[entry.level];
  const badgeEmoji = entry.topBadgeId ? badgeMap.get(entry.topBadgeId) : null;

  return (
    <View style={[styles.rankItem, isMe && styles.rankItemMe]}>
      {/* Rank number */}
      <View style={styles.rankNumContainer}>
        <Text style={[styles.rankNum, isMe && styles.rankNumMe]}>{entry.rank}</Text>
      </View>

      {/* Avatar */}
      <View style={[styles.rankAvatar, { borderColor: levelColor }]}>
        <Text style={styles.rankAvatarEmoji}>{LEVEL_EMOJIS[entry.level]}</Text>
      </View>

      {/* Name / level / badge */}
      <View style={styles.rankInfo}>
        <View style={styles.rankNameRow}>
          <Text style={styles.rankUserId} numberOfLines={1}>
            {(entry.userId as string).slice(0, 8)}...
          </Text>
          {badgeEmoji && (
            <Text style={styles.rankBadgeEmoji}>{badgeEmoji}</Text>
          )}
          {isMe && (
            <View style={styles.meBadge}>
              <Text style={styles.meBadgeText}>أنا</Text>
            </View>
          )}
        </View>
        <View style={[styles.rankLevelDot, { backgroundColor: levelColor }]}>
          <Text style={styles.rankLevelText}>{entry.level.replace('_', ' ')}</Text>
        </View>
      </View>

      {/* Points */}
      <Text style={[styles.rankPoints, isMe && styles.rankPointsMe]}>
        {entry.periodPoints}
      </Text>
    </View>
  );
}

// ── My rank footer ─────────────────────────────────────────────────────────────

interface MyRankProps {
  rank: number | null;
  periodPoints: number;
}

function MyRankCard({ rank, periodPoints }: MyRankProps): ReactElement {
  return (
    <View style={styles.myRankCard}>
      <View style={styles.myRankLeft}>
        <Text style={styles.myRankLabel}>{t('repLeaderboard.myRank')}</Text>
        <Text style={styles.myRankValue}>
          {rank
            ? t('repLeaderboard.myRankValue', { rank })
            : t('repLeaderboard.notRanked')}
        </Text>
      </View>
      <View style={styles.myRankRight}>
        <Text style={styles.myRankPoints}>
          {t('repLeaderboard.points', { count: periodPoints })}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface MyRankData {
  rank: number | null;
  periodPoints: number;
}

export function LeaderboardScreen(): ReactElement {
  const api = useApi();

  const [city,     setCity]     = useState('baghdad');
  const [period,   setPeriod]   = useState<Period>('all_time');
  const [category, setCategory] = useState<Category>('overall');
  const [result,   setResult]   = useState<LeaderboardResult | null>(null);
  const [myRank,   setMyRank]   = useState<MyRankData | null>(null);
  const [badgeMap, setBadgeMap] = useState<Map<string, string>>(new Map());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Fake "my user id" from context – placeholder
  const myUserId: string | null = null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lbRes, rankRes] = await Promise.all([
        (api as any).reputation.getLeaderboard({
          query: { city, period, category, limit: 50 },
        }),
        (api as any).reputation.getMyRank({ query: { city, period } }),
      ]);

      const lb = (lbRes.status === 200 ? lbRes.body : null) as LeaderboardResult | null;
      if (!lb) { setError(t('repLeaderboard.errorMsg')); return; }
      setResult(lb);
      setMyRank(rankRes.status === 200 ? rankRes.body as MyRankData : null);

      // Build badge emoji lookup from top badge ids in the list
      const badgeIds = [...new Set(lb.items.map((e) => e.topBadgeId).filter(Boolean))] as string[];
      if (badgeIds.length > 0) {
        const map = new Map<string, string>();
        for (const id of badgeIds) {
          map.set(id, BADGE_EMOJIS[id] ?? '🏅');
        }
        setBadgeMap(map);
      }
    } catch {
      setError(t('repLeaderboard.errorMsg'));
    } finally {
      setLoading(false);
    }
  }, [api, city, period, category]);

  useEffect(() => { load(); }, [load]);

  const top3  = result?.items.slice(0, 3) ?? [];
  const rest  = result?.items.slice(3) ?? [];

  const renderRankItem = useCallback(
    ({ item }: ListRenderItemInfo<LeaderboardEntry>) => (
      <RankItem
        entry={item}
        badgeMap={badgeMap}
        isMe={myUserId ? (item.userId as string) === myUserId : false}
      />
    ),
    [badgeMap, myUserId],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* City selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cityScroll}
          contentContainerStyle={styles.cityRow}
        >
          {CITIES.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.cityChip, city === c.id && styles.cityChipActive]}
              onPress={() => setCity(c.id)}
            >
              <Text
                style={[
                  styles.cityChipText,
                  city === c.id && styles.cityChipTextActive,
                ]}
              >
                {t(c.labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Period tabs */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.value}
              style={[styles.periodTab, period === p.value && styles.periodTabActive]}
              onPress={() => setPeriod(p.value)}
            >
              <Text
                style={[
                  styles.periodTabText,
                  period === p.value && styles.periodTabTextActive,
                ]}
              >
                {t(p.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={styles.catRow}
        >
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.value}
              style={[styles.catTab, category === cat.value && styles.catTabActive]}
              onPress={() => setCategory(cat.value)}
            >
              <Text
                style={[
                  styles.catTabText,
                  category === cat.value && styles.catTabTextActive,
                ]}
              >
                {t(cat.labelKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Main content */}
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={C.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorCenter}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>{t('repLeaderboard.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : !result || result.items.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Text style={styles.emptyText}>{t('repLeaderboard.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={rest}
            keyExtractor={(e) => e.userId as string}
            renderItem={renderRankItem}
            ListHeaderComponent={
              top3.length > 0 ? (
                <Podium top3={top3} badgeMap={badgeMap} />
              ) : null
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        {/* My rank card – pinned at bottom */}
        {myRank !== null && (
          <MyRankCard rank={myRank.rank} periodPoints={myRank.periodPoints} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },

  // City selector
  cityScroll: { flexGrow: 0, backgroundColor: C.surface },
  cityRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  cityChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  cityChipText: { fontSize: 14, color: C.textSecondary },
  cityChipTextActive: { color: '#fff', fontWeight: '700' },

  // Period tabs
  periodRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  periodTabActive: { borderBottomColor: C.primary },
  periodTabText: { fontSize: 13, color: C.textSecondary },
  periodTabTextActive: { color: C.primary, fontWeight: '700' },

  // Category tabs
  catScroll: { flexGrow: 0, backgroundColor: C.surface },
  catRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  catTabActive: { backgroundColor: C.primaryLight, borderColor: C.primary },
  catTabText: { fontSize: 13, color: C.textSecondary },
  catTabTextActive: { color: C.primary, fontWeight: '600' },

  // States
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorCenter:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyCenter:   { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:     { fontSize: 15, color: C.danger, textAlign: 'center', marginBottom: 16 },
  emptyText:     { fontSize: 15, color: C.textHint, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.primary,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },

  // List
  listContent: { paddingBottom: 8 },
  separator: { height: 1, backgroundColor: C.border, marginStart: 72 },

  // Podium
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
    backgroundColor: C.surface,
    marginBottom: 8,
  },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumSlotEmpty: { flex: 1 },
  podiumAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatarEmoji: { fontSize: 24 },
  podiumBadgeEmoji: {
    position: 'absolute',
    bottom: -4,
    insetInlineEnd: -4,
    fontSize: 14,
  },
  podiumMedal: { fontSize: 20, marginTop: 4 },
  podiumPoints: { fontSize: 11, fontWeight: '700', marginTop: 2, marginBottom: 4 },
  podiumPlatform: {
    width: '90%',
    borderTopWidth: 3,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  podiumRankNum: { fontSize: 22, fontWeight: '900' },
  podiumLevelDot: { width: 8, height: 8, borderRadius: 4 },

  // Rank list item
  rankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    gap: 12,
  },
  rankItemMe: { backgroundColor: C.myRankBg },
  rankNumContainer: { width: 28, alignItems: 'center' },
  rankNum: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  rankNumMe: { color: C.myRankBorder },
  rankAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankAvatarEmoji: { fontSize: 18 },
  rankInfo: { flex: 1 },
  rankNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankUserId: { fontSize: 13, fontWeight: '600', color: C.text, flex: 1 },
  rankBadgeEmoji: { fontSize: 14 },
  meBadge: {
    backgroundColor: C.myRankBorder,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  meBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  rankLevelDot: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 3,
  },
  rankLevelText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  rankPoints: { fontSize: 15, fontWeight: '700', color: C.text },
  rankPointsMe: { color: C.myRankBorder },

  // My rank footer
  myRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.myRankBg,
    borderTopWidth: 2,
    borderTopColor: C.myRankBorder,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  myRankLeft: {},
  myRankLabel: { fontSize: 12, color: C.myRankBorder, fontWeight: '600' },
  myRankValue: { fontSize: 20, fontWeight: '900', color: C.myRankBorder, marginTop: 2 },
  myRankRight: {},
  myRankPoints: { fontSize: 16, fontWeight: '700', color: C.myRankBorder },
});
