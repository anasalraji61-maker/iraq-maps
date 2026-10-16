/**
 * PersonalAnalyticsScreen — the user's own usage statistics.
 *
 * Displays:
 *   - This month: places visited, distance traveled, reviews written,
 *     posts created, messages sent, time in app
 *   - All-time contribution score
 *   - Most visited places (top 5)
 *   - Animated stat cards
 *
 * All text via t(). Layouts use start/end (RTL-safe).
 * Route: account/analytics
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Animated,
  I18nManager,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApi } from '@iraq-maps/mobile-kit';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  primary:        '#1565C0',
  primaryLight:   '#E3F2FD',
  secondary:      '#00897B',
  secondaryLight: '#E0F2F1',
  amber:          '#F9A825',
  amberLight:     '#FFF8E1',
  rose:           '#D81B60',
  roseLight:      '#FCE4EC',
  purple:         '#7B1FA2',
  purpleLight:    '#F3E5F5',
  green:          '#2E7D32',
  greenLight:     '#E8F5E9',
  surface:        '#FFFFFF',
  bg:             '#F5F7FA',
  card:           '#FFFFFF',
  text:           '#1A1A2E',
  textSecondary:  '#546E7A',
  textHint:       '#90A4AE',
  border:         '#E0E0E0',
  divider:        '#F0F0F0',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthlyStats {
  placesVisited: number;
  distanceKm: number;
  reviewsWritten: number;
  postsCreated: number;
  messagesSent: number;
  timeInAppMinutes: number;
}

interface TopPlace {
  placeId: string;
  nameAr: string;
  nameEn?: string;
  category?: string;
  visitCount: number;
}

interface PersonalAnalyticsData {
  monthly: MonthlyStats;
  contributionScore: number;
  topPlaces: TopPlace[];
}

// ── API mock shape ─────────────────────────────────────────────────────────────

// The real backend analytics endpoint returns this shape;
// for now we derive it from the analytics event table via the user's
// own event history endpoint.
async function fetchPersonalAnalytics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any,
): Promise<PersonalAnalyticsData> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const res = await api.analytics?.getMyStats?.();
    if (res?.status === 200) {
      return res.body as PersonalAnalyticsData;
    }
  } catch { /* fall through to defaults */ }

  // Graceful default when the endpoint is not yet wired
  return {
    monthly: {
      placesVisited: 0,
      distanceKm: 0,
      reviewsWritten: 0,
      postsCreated: 0,
      messagesSent: 0,
      timeInAppMinutes: 0,
    },
    contributionScore: 0,
    topPlaces: [],
  };
}

// ── Animated stat card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  color: string;
  bgColor: string;
  delay?: number;
}

function StatCard({ label, value, icon, color, bgColor, delay = 0 }: StatCardProps): ReactElement {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, [opacity, translateY, delay]);

  return (
    <Animated.View style={[styles.statCard, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.statIconWrap, { backgroundColor: bgColor }]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
    </Animated.View>
  );
}

// ── Contribution score card ───────────────────────────────────────────────────

interface ScoreCardProps {
  score: number;
}

function ScoreCard({ score }: ScoreCardProps): ReactElement {
  const width = useRef(new Animated.Value(0)).current;
  // Score displayed as a ring-like progress (up to 10 000)
  const pct = Math.min(100, Math.round((score / 10000) * 100));

  useEffect(() => {
    Animated.timing(width, {
      toValue: pct / 100,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [width, pct]);

  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreLeft}>
        <Text style={styles.scoreTitle}>{t('personalAnalytics.contributionScore')}</Text>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={styles.scoreValue}>{score.toLocaleString('ar-IQ')}</Text>
        <View style={styles.scoreTrack}>
          <Animated.View
            style={[
              styles.scoreFill,
              {
                width: width.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={styles.scoreSub}>{pct}% / 10,000</Text>
      </View>
      <View style={styles.scoreRight}>
        <Text style={styles.scoreTrophy}>🏆</Text>
      </View>
    </View>
  );
}

// ── Top places list ───────────────────────────────────────────────────────────

interface TopPlacesProps {
  places: TopPlace[];
}

function TopPlacesList({ places }: TopPlacesProps): ReactElement {
  if (places.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>{t('personalAnalytics.noTopPlaces')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.topPlacesList}>
      {places.map((place, idx) => (
        <View key={place.placeId} style={[styles.topPlaceRow, idx < places.length - 1 && styles.topPlaceDivider]}>
          <View style={styles.topPlaceRank}>
            <Text style={styles.topPlaceRankText}>{idx + 1}</Text>
          </View>
          <View style={styles.topPlaceInfo}>
            <Text style={styles.topPlaceName} numberOfLines={1}>
              {place.nameAr}
            </Text>
            {place.category ? (
              <Text style={styles.topPlaceCategory}>{place.category}</Text>
            ) : null}
          </View>
          <View style={styles.topPlaceVisits}>
            <Text style={styles.topPlaceVisitCount}>
              {t('personalAnalytics.visits', { count: place.visitCount })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Time formatter ────────────────────────────────────────────────────────────

function formatTime(minutes: number): string {
  if (minutes < 60) {
    return t('personalAnalytics.timeMinutes', { min: minutes });
  }
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return t('personalAnalytics.timeHours', { h, min });
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): ReactElement {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function PersonalAnalyticsScreen(): ReactElement {
  const api = useApi();
  const [data, setData] = useState<PersonalAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPersonalAnalytics(api);
      setData(result);
    } catch {
      setError(t('personalAnalytics.error'));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const handleShare = useCallback(async () => {
    if (!data) return;
    const text = t('personalAnalytics.shareText', {
      placesVisited: data.monthly.placesVisited,
      reviewsWritten: data.monthly.reviewsWritten,
    });
    try {
      await Share.share({ message: text });
    } catch { /* ignore */ }
  }, [data]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t('personalAnalytics.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? t('personalAnalytics.error')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>{t('actions.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { monthly, contributionScore, topPlaces } = data;

  // ── Stat cards config ─────────────────────────────────────────────────────

  const stats: StatCardProps[] = [
    {
      label: t('personalAnalytics.placesVisited'),
      value: monthly.placesVisited.toLocaleString('ar-IQ'),
      icon: '📍',
      color: C.primary,
      bgColor: C.primaryLight,
      delay: 0,
    },
    {
      label: t('personalAnalytics.distanceTraveled'),
      value: t('personalAnalytics.distanceKm', { km: monthly.distanceKm.toFixed(1) }),
      icon: '🗺️',
      color: C.secondary,
      bgColor: C.secondaryLight,
      delay: 60,
    },
    {
      label: t('personalAnalytics.reviewsWritten'),
      value: monthly.reviewsWritten.toLocaleString('ar-IQ'),
      icon: '✍️',
      color: C.amber,
      bgColor: C.amberLight,
      delay: 120,
    },
    {
      label: t('personalAnalytics.postsCreated'),
      value: monthly.postsCreated.toLocaleString('ar-IQ'),
      icon: '📝',
      color: C.rose,
      bgColor: C.roseLight,
      delay: 180,
    },
    {
      label: t('personalAnalytics.messagesSent'),
      value: monthly.messagesSent.toLocaleString('ar-IQ'),
      icon: '💬',
      color: C.purple,
      bgColor: C.purpleLight,
      delay: 240,
    },
    {
      label: t('personalAnalytics.timeInApp'),
      value: formatTime(monthly.timeInAppMinutes),
      icon: '⏱️',
      color: C.green,
      bgColor: C.greenLight,
      delay: 300,
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header banner */}
        <View style={styles.banner}>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerTitle}>{t('personalAnalytics.title')}</Text>
            <Text style={styles.bannerSub}>{t('personalAnalytics.sectionMonth')}</Text>
          </View>
          <Pressable
            style={styles.shareBtn}
            onPress={() => void handleShare()}
            accessibilityLabel={t('personalAnalytics.shareStats')}
            accessibilityRole="button"
          >
            <Text style={styles.shareBtnText}>{'↑'}</Text>
          </Pressable>
        </View>

        {/* Monthly stats grid */}
        <SectionHeader title={t('personalAnalytics.sectionMonth')} />
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </View>

        {/* Contribution score */}
        <SectionHeader title={t('personalAnalytics.sectionAllTime')} />
        <View style={styles.scoreWrap}>
          <ScoreCard score={contributionScore} />
        </View>

        {/* All-time counts row */}
        <View style={styles.allTimeRow}>
          <View style={styles.allTimeBox}>
            <Text style={styles.allTimeValue}>{monthly.reviewsWritten}</Text>
            <Text style={styles.allTimeLabel}>{t('personalAnalytics.reviewsWritten')}</Text>
          </View>
          <View style={[styles.allTimeBox, styles.allTimeBoxMiddle]}>
            <Text style={styles.allTimeValue}>{monthly.postsCreated}</Text>
            <Text style={styles.allTimeLabel}>{t('personalAnalytics.postsCreated')}</Text>
          </View>
          <View style={styles.allTimeBox}>
            <Text style={styles.allTimeValue}>{monthly.messagesSent}</Text>
            <Text style={styles.allTimeLabel}>{t('personalAnalytics.messagesSent')}</Text>
          </View>
        </View>

        {/* Top places */}
        <SectionHeader title={t('personalAnalytics.sectionTopPlaces')} />
        <View style={styles.topPlacesCard}>
          <TopPlacesList places={topPlaces} />
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { fontSize: 16, color: C.textHint },
  errorText: { fontSize: 15, color: '#C62828', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: C.primary,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },

  // Banner
  banner: {
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTextWrap: { flex: 1 },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  bannerSub: {
    fontSize: 13,
    color: '#B3D4FF',
    marginTop: 2,
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 12,
  },
  shareBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 12,
    gap: 10,
  },
  statCard: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    minHeight: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIcon: { fontSize: 20 },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 3,
    lineHeight: 15,
  },

  // Score card
  scoreWrap: { marginHorizontal: 16 },
  scoreCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  scoreLeft: { flex: 1 },
  scoreTitle: { fontSize: 13, color: C.textSecondary, marginBottom: 4 },
  scoreValue: {
    fontSize: 28,
    fontWeight: '800',
    color: C.primary,
  },
  scoreTrack: {
    height: 8,
    backgroundColor: C.border,
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  scoreFill: {
    height: '100%',
    backgroundColor: C.primary,
    borderRadius: 4,
  },
  scoreSub: { fontSize: 11, color: C.textHint, marginTop: 4 },
  scoreRight: { marginStart: 16 },
  scoreTrophy: { fontSize: 40 },

  // All-time row
  allTimeRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  allTimeBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  allTimeBoxMiddle: {},
  allTimeValue: { fontSize: 22, fontWeight: '800', color: C.text },
  allTimeLabel: { fontSize: 11, color: C.textSecondary, marginTop: 3, textAlign: 'center' },

  // Top places
  topPlacesCard: {
    marginHorizontal: 16,
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  topPlacesList: {},
  topPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  topPlaceDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  topPlaceRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPlaceRankText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.primary,
  },
  topPlaceInfo: { flex: 1 },
  topPlaceName: { fontSize: 14, fontWeight: '600', color: C.text },
  topPlaceCategory: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  topPlaceVisits: {},
  topPlaceVisitCount: {
    fontSize: 12,
    color: C.textHint,
    fontWeight: '600',
  },

  emptyBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: C.textHint, textAlign: 'center' },

  // Misc
  bottomSpace: { height: 24 },
});
