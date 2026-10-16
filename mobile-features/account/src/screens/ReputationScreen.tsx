/**
 * ReputationScreen — shows the current user's reputation:
 *   - Level badge + animated progress bar toward next level
 *   - Points summary card
 *   - Badges grid (earned vs locked)
 *   - Points history timeline
 *   - Level benefits accordion
 *   - Button to open the city leaderboard
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: account/reputation
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Animated,
  FlatList,
  I18nManager,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApi } from '@iraq-maps/mobile-kit';
import type {
  ReputationSummary,
  UserBadge,
  PointsEntry,
  ReputationLevel,
} from '@iraq-maps/contracts';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Palette ───────────────────────────────────────────────────────────────────

const ICON_UP = String.fromCharCode(0x25b2);
const ICON_DOWN = String.fromCharCode(0x25bc);

const C = {
  primary:       '#1565C0',
  primaryLight:  '#E3F2FD',
  gold:          '#F9A825',
  goldLight:     '#FFF8E1',
  silver:        '#78909C',
  bronze:        '#8D6E63',
  surface:       '#FFFFFF',
  bg:            '#F5F7FA',
  text:          '#1A1A2E',
  textSecondary: '#546E7A',
  textHint:      '#90A4AE',
  border:        '#E0E0E0',
  success:       '#2E7D32',
  successLight:  '#E8F5E9',
  locked:        '#CFD8DC',
  lockedText:    '#90A4AE',
  amber:         '#FF8F00',
  // Level colors
  explorer:      '#78909C',
  contributor:   '#43A047',
  scout:         '#1E88E5',
  local_guide:   '#8E24AA',
  expert:        '#F4511E',
  ambassador:    '#F9A825',
} as const;

// ── Level display ─────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<ReputationLevel, Parameters<typeof t>[0]> = {
  explorer:    'reputation.levelExplorer',
  contributor: 'reputation.levelContributor',
  scout:       'reputation.levelScout',
  local_guide: 'reputation.levelLocalGuide',
  expert:      'reputation.levelExpert',
  ambassador:  'reputation.levelAmbassador',
};

const LEVEL_EMOJIS: Record<ReputationLevel, string> = {
  explorer:    '🗺️',
  contributor: '✨',
  scout:       '🔭',
  local_guide: '📍',
  expert:      '🎯',
  ambassador:  '🌟',
};

const LEVEL_BENEFITS: Record<ReputationLevel, Parameters<typeof t>[0]> = {
  explorer:    'reputation.benefitExplorer',
  contributor: 'reputation.benefitContributor',
  scout:       'reputation.benefitScout',
  local_guide: 'reputation.benefitLocalGuide',
  expert:      'reputation.benefitExpert',
  ambassador:  'reputation.benefitAmbassador',
};

const ALL_LEVELS: ReputationLevel[] = [
  'explorer', 'contributor', 'scout', 'local_guide', 'expert', 'ambassador',
];

const BADGE_FILTERS = ['all', 'earned', 'locked'] as const;
type BadgeFilter = typeof BADGE_FILTERS[number];

const _LEVEL_MINS: Record<ReputationLevel, number> = {
  explorer:    0,
  contributor: 100,
  scout:       500,
  local_guide: 2000,
  expert:      5000,
  ambassador:  10000,
};

// ── Reason labels ─────────────────────────────────────────────────────────────

const REASON_KEYS: Record<string, Parameters<typeof t>[0]> = {
  add_place:          'reputation.reasonAddPlace',
  write_review:       'reputation.reasonWriteReview',
  review_helpful_10:  'reputation.reasonReviewHelpful10',
  report_incident:    'reputation.reasonReportIncident',
  incident_confirmed: 'reputation.reasonIncidentConfirmed',
  first_review_bonus: 'reputation.reasonFirstReviewBonus',
  post_likes_50:      'reputation.reasonPostLikes50',
  login_streak_7:     'reputation.reasonLoginStreak7',
  complete_profile:   'reputation.reasonCompleteProfile',
};

function reasonLabel(reason: string): string {
  const key = REASON_KEYS[reason];
  return key ? t(key) : reason;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface LevelCardProps {
  summary: ReputationSummary;
}

function LevelCard({ summary }: LevelCardProps): ReactElement {
  const { level, totalPoints, levelProgress } = summary;
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: levelProgress.percentage / 100,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [levelProgress.percentage, animWidth]);

  const levelColor = C[level] ?? C.primary;
  const emoji = LEVEL_EMOJIS[level];
  const levelName = t(LEVEL_LABELS[level]);
  const nextLevelEntry = ALL_LEVELS[ALL_LEVELS.indexOf(level) + 1];
  const isMax = levelProgress.nextMin === null;

  return (
    <View style={[styles.levelCard, { borderStartColor: levelColor }]}>
      {/* Top row: emoji + level + points */}
      <View style={styles.levelRow}>
        <View style={[styles.levelEmojiBadge, { backgroundColor: levelColor + '22' }]}>
          <Text style={styles.levelEmoji}>{emoji}</Text>
        </View>
        <View style={styles.levelInfo}>
          <Text style={[styles.levelName, { color: levelColor }]}>{levelName}</Text>
          <Text style={styles.levelPoints}>
            {t('reputation.pointsCount', { count: totalPoints })}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      {!isMax && (
        <View style={styles.progressSection}>
          <Text style={styles.progressLabel}>
            {t('reputation.progress', { level: t(LEVEL_LABELS[nextLevelEntry!]) })}
          </Text>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: levelColor,
                  width: animWidth.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressMin}>{levelProgress.currentMin}</Text>
            <Text style={styles.progressPct}>{levelProgress.percentage}%</Text>
            <Text style={styles.progressMax}>{levelProgress.nextMin}</Text>
          </View>
        </View>
      )}
      {isMax && (
        <Text style={[styles.maxLevelText, { color: levelColor }]}>
          {t('reputation.maxLevel')}
        </Text>
      )}
    </View>
  );
}

// ── Badge item ─────────────────────────────────────────────────────────────────

interface BadgeItemProps {
  badge: UserBadge;
  locale: string;
}

function BadgeItem({ badge, locale }: BadgeItemProps): ReactElement {
  const name =
    locale === 'ar' ? badge.nameAr :
    locale === 'ckb' ? badge.nameCkb :
    badge.nameEn;
  const description =
    locale === 'ar' ? badge.descriptionAr :
    locale === 'ckb' ? badge.descriptionCkb :
    badge.descriptionEn;

  return (
    <View style={[styles.badgeItem, !badge.earned && styles.badgeItemLocked]}>
      <Text style={[styles.badgeEmoji, !badge.earned && styles.badgeEmojiLocked]}>
        {badge.emoji}
      </Text>
      <Text
        style={[styles.badgeName, !badge.earned && styles.badgeNameLocked]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text
        style={[styles.badgeDesc, !badge.earned && styles.badgeDescLocked]}
        numberOfLines={2}
      >
        {description}
      </Text>
      {badge.earned && (
        <View style={styles.earnedDot} />
      )}
    </View>
  );
}

// ── Points history item ────────────────────────────────────────────────────────

interface HistoryItemProps {
  entry: PointsEntry;
  isLast: boolean;
}

function HistoryItem({ entry, isLast }: HistoryItemProps): ReactElement {
  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });

  return (
    <View style={styles.historyItem}>
      {/* Timeline line */}
      <View style={styles.historyTimeline}>
        <View style={styles.historyDot} />
        {!isLast && <View style={styles.historyLine} />}
      </View>
      {/* Content */}
      <View style={styles.historyContent}>
        <View style={styles.historyRow}>
          <Text style={styles.historyReason}>{reasonLabel(entry.reason)}</Text>
          <Text style={styles.historyPoints}>+{entry.points}</Text>
        </View>
        <Text style={styles.historyDate}>{dateStr}</Text>
      </View>
    </View>
  );
}

// ── Level benefits accordion ───────────────────────────────────────────────────

interface BenefitsProps {
  currentLevel: ReputationLevel;
}

function LevelBenefits({ currentLevel }: BenefitsProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.benefitsCard}>
      <Pressable
        style={styles.benefitsHeader}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <Text style={styles.benefitsTitle}>{t('reputation.benefitsTitle')}</Text>
        <Text style={styles.benefitsChevron} accessibilityElementsHidden>{open ? ICON_UP : ICON_DOWN}</Text>
      </Pressable>
      {open && (
        <View style={styles.benefitsList}>
          {ALL_LEVELS.map((lvl) => {
            const unlocked = ALL_LEVELS.indexOf(lvl) <= ALL_LEVELS.indexOf(currentLevel);
            const lvlColor = C[lvl];
            return (
              <View key={lvl} style={styles.benefitRow}>
                <View
                  style={[
                    styles.benefitDot,
                    { backgroundColor: unlocked ? lvlColor : C.locked },
                  ]}
                />
                <Text style={styles.benefitLevelName}>
                  {LEVEL_EMOJIS[lvl]} {t(LEVEL_LABELS[lvl])}
                </Text>
                <Text
                  style={[
                    styles.benefitText,
                    !unlocked && styles.benefitTextLocked,
                  ]}
                >
                  {t(LEVEL_BENEFITS[lvl])}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ReputationScreen(): ReactElement {
  const router = useRouter();
  const api = useApi();

  const [summary, setSummary] = useState<ReputationSummary | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [history, setHistory] = useState<PointsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilter>('all');

  // Locale – default Arabic
  const locale = 'ar';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reputationApi = (api as unknown as Record<string, any>).reputation;
      const [repRes, badgesRes, histRes] = await Promise.all([
        reputationApi.getMyReputation(),
        reputationApi.getUserBadges({ params: { userId: 'me' } }),
        reputationApi.getPointsHistory({
          params: { userId: 'me' },
          query: { limit: 20 },
        }),
      ]);
      if (repRes.status === 200) setSummary(repRes.body as ReputationSummary);
      if (badgesRes.status === 200) setBadges((badgesRes.body as { items: UserBadge[] }).items);
      if (histRes.status === 200) setHistory((histRes.body as { items: PointsEntry[] }).items);
    } catch {
      setError(t('reputation.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filteredBadges = badges.filter((b) => {
    if (badgeFilter === 'earned') return b.earned;
    if (badgeFilter === 'locked') return !b.earned;
    return true;
  });

  const earnedCount = badges.filter((b) => b.earned).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !summary) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? t('reputation.errors.loadFailed')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>{t('actions.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Level card */}
        <LevelCard summary={summary} />

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{summary.totalPoints}</Text>
            <Text style={styles.statLabel}>{t('reputation.points')}</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxMiddle]}>
            <Text style={styles.statValue}>{earnedCount}</Text>
            <Text style={styles.statLabel}>{t('reputation.badges')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.statBox, styles.statBoxLink]}
            onPress={() => router.push('/discover/leaderboard')}
          >
            <Text style={[styles.statValue, { color: C.primary }]}>→</Text>
            <Text style={[styles.statLabel, { color: C.primary }]}>
              {t('reputation.leaderboard')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Badges section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reputation.badges')}</Text>

          {/* Filter tabs */}
          <View style={styles.filterRow}>
            {BADGE_FILTERS.map((f) => (
              <Pressable
                key={f}
                style={[styles.filterTab, badgeFilter === f && styles.filterTabActive]}
                onPress={() => setBadgeFilter(f)}
              >
                <Text
                  style={[
                    styles.filterTabText,
                    badgeFilter === f && styles.filterTabTextActive,
                  ]}
                >
                  {f === 'all' ? t('actions.viewAll') : f === 'earned' ? t('reputation.earned') : t('reputation.locked')}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Badges grid */}
          <FlatList
            data={filteredBadges}
            keyExtractor={(b) => b.id}
            numColumns={3}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <BadgeItem badge={item} locale={locale} />
            )}
            columnWrapperStyle={styles.badgesRow}
            contentContainerStyle={styles.badgesGrid}
          />
        </View>

        {/* Points history */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reputation.history')}</Text>
          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>{t('reputation.historyEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {history.map((entry, i) => (
                <HistoryItem key={entry.id} entry={entry} isLast={i === history.length - 1} />
              ))}
            </View>
          )}
        </View>

        {/* Level benefits */}
        <LevelBenefits currentLevel={summary.level} />

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  // Level card
  levelCard: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 20,
    borderStartWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  levelEmojiBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelEmoji: { fontSize: 28 },
  levelInfo: { flex: 1 },
  levelName: { fontSize: 20, fontWeight: '700' },
  levelPoints: { fontSize: 14, color: C.textSecondary, marginTop: 2 },

  progressSection: { marginTop: 16 },
  progressLabel: { fontSize: 12, color: C.textSecondary, marginBottom: 6 },
  progressTrack: {
    height: 10,
    backgroundColor: C.border,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressMin: { fontSize: 11, color: C.textHint },
  progressPct: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  progressMax: { fontSize: 11, color: C.textHint },
  maxLevelText: { marginTop: 12, fontSize: 14, fontWeight: '600', textAlign: 'center' },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statBoxMiddle: {},
  statBoxLink: { borderColor: C.primary, borderWidth: 1 },
  statValue: { fontSize: 22, fontWeight: '700', color: C.text },
  statLabel: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

  // Section
  section: {
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 12,
  },

  // Filter tabs
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.border,
  },
  filterTabActive: { backgroundColor: C.primary },
  filterTabText: { fontSize: 13, color: C.textSecondary },
  filterTabTextActive: { color: '#fff', fontWeight: '600' },

  // Badges grid
  badgesGrid: { paddingBottom: 4 },
  badgesRow: { gap: 10, marginBottom: 10 },
  badgeItem: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minHeight: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeItemLocked: { backgroundColor: '#F5F5F5', opacity: 0.65 },
  badgeEmoji: { fontSize: 26, marginBottom: 4 },
  badgeEmojiLocked: { opacity: 0.4 },
  badgeName: {
    fontSize: 11,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  badgeNameLocked: { color: C.lockedText },
  badgeDesc: {
    fontSize: 10,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  badgeDescLocked: { color: C.lockedText },
  earnedDot: {
    position: 'absolute',
    top: 8,
    insetInlineEnd: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.success,
  },

  // History
  historyList: { paddingStart: 4 },
  historyItem: { flexDirection: 'row', marginBottom: 8 },
  historyTimeline: { alignItems: 'center', width: 20, marginEnd: 12 },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.primary,
    marginTop: 4,
  },
  historyLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 2 },
  historyContent: { flex: 1, paddingBottom: 12 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  historyReason: { fontSize: 14, color: C.text, fontWeight: '500', flex: 1 },
  historyPoints: { fontSize: 14, fontWeight: '700', color: C.success },
  historyDate: { fontSize: 12, color: C.textHint, marginTop: 2 },
  emptyHistory: { paddingVertical: 24, alignItems: 'center' },
  emptyHistoryText: { fontSize: 14, color: C.textHint, textAlign: 'center' },

  // Benefits accordion
  benefitsCard: {
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  benefitsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  benefitsTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  benefitsChevron: { fontSize: 12, color: C.textSecondary },
  benefitsList: { paddingHorizontal: 16, paddingBottom: 16 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  benefitDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  benefitLevelName: { fontSize: 13, fontWeight: '700', color: C.text, width: 90 },
  benefitText: { flex: 1, fontSize: 13, color: C.textSecondary },
  benefitTextLocked: { color: C.locked },

  // Misc
  bottomSpace: { height: 24 },
  loadingText: { fontSize: 16, color: C.textHint },
  errorText: { fontSize: 15, color: '#C62828', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: C.primary,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
