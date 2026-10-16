/**
 * ChallengesScreen — full challenges hub
 *
 * Sections:
 *   - Active tab / Upcoming tab / Completed tab
 *   - Featured challenge carousel (horizontal scroll)
 *   - Category filter chips (reviews / navigation / photos / community)
 *   - Main list with ChallengeCard components
 *   - Completed challenges history section
 *   - Claim reward action with animated feedback
 */
import type { ChallengeType2 } from '@iraq-maps/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  I18nManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useChallengesClient } from '../socialClient';
import { t } from '../strings';
import { ChallengeCard } from '../components/ChallengeCard';
import { COLORS, sharedStyles } from './shared';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'active' | 'upcoming' | 'completed';

type CategoryKey = 'all' | 'reviews' | 'navigation' | 'photos' | 'community';

/** Map category to challenge types */
const CATEGORY_KINDS: Record<CategoryKey, string[]> = {
  all: [],
  reviews: ['review', 'review_count', 'first_review'],
  navigation: ['checkin', 'place_visit', 'category_explorer', 'neighborhood_mapper'],
  photos: ['photo', 'photo_upload'],
  community: ['incident_report', 'consecutive_login'],
};

// ─── Reward claim toast ───────────────────────────────────────────────────────

function ClaimToast({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: -20, duration: 400, useNativeDriver: true }),
          ]).start();
        }, 2200);
      });
    }
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      style={[toastStyles.container, { opacity, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <Text style={toastStyles.text}>{t('challenges.completedBanner')}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    start: 16,
    end: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    zIndex: 100,
    elevation: 10,
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ─── Featured carousel item ───────────────────────────────────────────────────

function FeaturedBanner({ challenge, onPress }: { challenge: ChallengeType2; onPress: () => void }) {
  const KIND_COLOR: Record<string, string> = {
    photo: '#7B61FF',
    review: '#FF9800',
    checkin: '#00B589',
    review_count: '#FF9800',
    place_visit: '#00B589',
    photo_upload: '#7B61FF',
    incident_report: '#F44336',
    consecutive_login: '#FF5722',
    category_explorer: '#2196F3',
    neighborhood_mapper: '#4CAF50',
    first_review: '#FFD700',
  };
  const accent = KIND_COLOR[challenge.type] ?? COLORS.primary;
  const pct = challenge.targetCount > 0 ? Math.min(1, challenge.myProgress / challenge.targetCount) : 0;

  return (
    <Pressable
      style={[featuredStyles.card, { backgroundColor: accent }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={featuredStyles.pill}>
        <Text style={featuredStyles.pillText}>{t('challenges.featured')}</Text>
      </View>
      <Text style={featuredStyles.title} numberOfLines={2}>{challenge.title}</Text>
      <View style={featuredStyles.progressRow}>
        <View style={featuredStyles.track}>
          <View style={[featuredStyles.fill, { width: `${pct * 100}%` as `${number}%` }]} />
        </View>
        <Text style={featuredStyles.progressText}>
          {challenge.myProgress}/{challenge.targetCount}
        </Text>
      </View>
      {challenge.reward && (
        <Text style={featuredStyles.reward} numberOfLines={1}>
          🎁 {challenge.reward}
        </Text>
      )}
    </Pressable>
  );
}

const featuredStyles = StyleSheet.create({
  card: {
    width: 260,
    borderRadius: 16,
    padding: 18,
    marginEnd: 12,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  pillText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  title: { color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 22, marginBottom: 12 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  fill: { height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  progressText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  reward: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 8 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ChallengesScreen() {
  const client = useChallengesClient();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('active');
  const [category, setCategory] = useState<CategoryKey>('all');
  const [items, setItems] = useState<ChallengeType2[]>([]);
  const [featured, setFeatured] = useState<ChallengeType2[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [claimToast, setClaimToast] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError(false);

        const [allRes, featuredRes] = await Promise.all([
          client.listChallenges({ query: { status: tab } }),
          client.listChallenges({ query: { status: 'active' } }),
        ]);

        if (allRes.status === 200) setItems(allRes.body.items);
        else setError(true);

        if (featuredRes.status === 200) setFeatured(featuredRes.body.items);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [client, tab],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleClaim = useCallback(
    async (challengeId: string) => {
      if (claimingId) return;
      setClaimingId(challengeId);
      try {
        const res = await client.recordProgress({
          params: { challengeId: challengeId as never },
          body: { increment: 1 },
        });
        if (res.status === 200 && res.body.completed) {
          setClaimToast(true);
          setTimeout(() => setClaimToast(false), 3000);
          void load(true);
        }
      } catch {
        Alert.alert(t('challenges.progressError'));
      } finally {
        setClaimingId(null);
      }
    },
    [client, claimingId, load],
  );

  // Filter by category
  const filteredItems = category === 'all'
    ? items
    : items.filter((c) => CATEGORY_KINDS[category].includes(c.type));

  const TABS: Tab[] = ['active', 'upcoming', 'completed'];
  const CATEGORIES: CategoryKey[] = ['all', 'reviews', 'navigation', 'photos', 'community'];

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <ClaimToast visible={claimToast} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>
          {t('challenges.title')}
        </Text>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabs, { borderBottomColor: COLORS.border }]}>
        {TABS.map((tabKey) => (
          <Pressable
            key={tabKey}
            style={[
              styles.tabBtn,
              tabKey === tab && { borderBottomColor: COLORS.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setTab(tabKey)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tabKey === tab }}
          >
            <Text
              style={[
                styles.tabText,
                { color: tabKey === tab ? COLORS.primary : COLORS.textSecondary },
              ]}
            >
              {t(`challenges.${tabKey}` as never)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={[sharedStyles.center, { flex: 1 }]}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : error ? (
        <View style={[sharedStyles.center, { flex: 1 }]}>
          <Text style={{ color: COLORS.textSecondary }}>{t('challenges.loadError')}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={{ color: COLORS.primary, fontWeight: '600' }}>
              {t('feed.retry')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
          }
          contentContainerStyle={{ paddingBottom: 80 }}
        >
          {/* Featured carousel — only show on active tab */}
          {tab === 'active' && featured.length > 0 && (
            <View style={styles.section}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingStart: 16, paddingEnd: 4 }}
              >
                {featured.map((c) => (
                  <FeaturedBanner
                    key={c.id}
                    challenge={c}
                    onPress={() => router.push(`/discover/challenges/${c.id}`)}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Category filter chips */}
          {tab === 'active' && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              style={{ marginBottom: 4 }}
            >
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: cat === category ? COLORS.primary : COLORS.surface,
                      borderColor: cat === category ? COLORS.primary : COLORS.border,
                    },
                  ]}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cat === category }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: cat === category ? '#fff' : COLORS.textSecondary },
                    ]}
                  >
                    {cat === 'all' ? t('feed.typeFilter.all') : t(`challenges.categories.${cat}` as never)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Challenge list */}
          <View style={styles.listContainer}>
            {filteredItems.length === 0 ? (
              <View style={[sharedStyles.center, { paddingVertical: 48 }]}>
                <Text style={{ color: COLORS.textSecondary, fontSize: 15 }}>
                  {t('challenges.empty')}
                </Text>
              </View>
            ) : (
              filteredItems.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  onPress={() => router.push(`/discover/challenges/${c.id}`)}
                  onClaim={() => handleClaim(c.id)}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8 },
  section: { marginBottom: 8 },
  chipRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginEnd: 4,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  listContainer: { paddingHorizontal: 16, paddingTop: 4 },
});
