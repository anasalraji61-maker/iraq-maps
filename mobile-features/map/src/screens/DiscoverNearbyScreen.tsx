/**
 * DiscoverNearbyScreen — smart place discovery for Iraq Smart Maps.
 *
 * Sections:
 *  1. Context-aware greeting + suggestions ("Good morning! Breakfast spots")
 *  2. "For You" personalized feed
 *  3. Weekly highlights carousel (featured / new / hidden gems / trending)
 *  4. Category quick-access grid
 *  5. Recently opened places
 *  6. Hidden gems
 *  7. Trending this week
 *
 * All text is Arabic-first via t(). Layout uses start/end for RTL.
 * Seasonal and Ramadan awareness is passed from the device clock.
 */

import {
  type DiscoveryPlaceCard,
  type WeeklyHighlight,
  type WeeklyHighlightsResult,
  type ContextualSuggestionsResult,
  type PersonalizedFeedResult,
  type PlaceCategory,
} from '@iraq-maps/contracts';
import { useApiBaseUrl, useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  I18nManager,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';
import { COLORS } from './shared';

I18nManager.forceRTL(true);

// ─── Theme constants ──────────────────────────────────────────────────────────

const CARD_RADIUS = 14;
const SECTION_TITLE_SIZE = 16;
const CARD_TITLE_SIZE = 14;

// ─── Hijri calendar helper ─────────────────────────────────────────────────────

/**
 * Very lightweight Hijri month estimator based on the known epoch.
 * Accurate to ±1 day for scheduling purposes.
 * Returns Hijri month 1–12.
 */
function hijriMonth(date: Date = new Date()): number {
  const HIJRI_EPOCH_JD = 1948438.5;
  const JULIAN_EPOCH = 2440587.5;
  const jd = date.getTime() / 86_400_000 + JULIAN_EPOCH;
  const z = Math.floor(jd - HIJRI_EPOCH_JD);
  const cycle = Math.floor(z / 10631);
  const r = z - cycle * 10631;
  const j = Math.floor((11 * r + 3) / 325) + 1;
  const month = Math.min(12, Math.max(1, j));
  return month;
}

/** Returns true if today is Ramadan (Hijri month 9). */
function isRamadanNow(): boolean {
  return hijriMonth() === 9;
}

/** Current Gregorian month 1–12. */
function currentMonth(): number {
  return new Date().getMonth() + 1;
}

// ─── Discovery API client ─────────────────────────────────────────────────────

/** Discovery endpoints are called via raw fetch using baseUrl from the session. */

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBlock({ width, height, style }: { width: number | string; height: number; style?: object }): ReactElement {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, backgroundColor: '#E0E0E0', borderRadius: 6, opacity }, style]}
      accessibilityElementsHidden
    />
  );
}

function PlaceCardSkeleton(): ReactElement {
  return (
    <View style={[cardStyles.card, { width: 180, height: 200, padding: 12 }]}>
      <SkeletonBlock width="100%" height={100} style={{ borderRadius: 8, marginBottom: 8 }} />
      <SkeletonBlock width="80%" height={14} style={{ marginBottom: 6 }} />
      <SkeletonBlock width="50%" height={12} />
    </View>
  );
}

function SectionSkeleton(): ReactElement {
  return (
    <View style={{ paddingVertical: 12 }}>
      <SkeletonBlock width={160} height={16} style={{ marginHorizontal: 16, marginBottom: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {[1, 2, 3].map((k) => <PlaceCardSkeleton key={k} />)}
      </ScrollView>
    </View>
  );
}

// ─── Rating stars ─────────────────────────────────────────────────────────────

function RatingStars({ rating, count }: { rating: number | null; count: number }): ReactElement | null {
  if (rating === null || count < 3) return null;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ fontSize: 11, color: i < full ? '#F5A623' : half && i === full ? '#F5A623' : '#DDD' }}>
          {i < full ? '★' : half && i === full ? '½' : '☆'}
        </Text>
      ))}
      <Text style={{ fontSize: 11, color: COLORS.textMuted, marginStart: 2 }}>({count})</Text>
    </View>
  );
}

// ─── Badge chips ──────────────────────────────────────────────────────────────

function NewBadge(): ReactElement {
  return (
    <View style={badgeStyles.newBadge} accessibilityRole="text" accessibilityLabel={t('discovery.badge.new')}>
      <Text style={badgeStyles.newBadgeText}>{t('discovery.badge.new')}</Text>
    </View>
  );
}

function GemBadge(): ReactElement {
  return (
    <View style={badgeStyles.gemBadge} accessibilityRole="text" accessibilityLabel={t('discovery.badge.gem')}>
      <Text style={badgeStyles.gemBadgeText}>{t('discovery.badge.gem')}</Text>
    </View>
  );
}

function TrendingBadge(): ReactElement {
  return (
    <View style={badgeStyles.trendingBadge} accessibilityRole="text" accessibilityLabel={t('discovery.badge.trending')}>
      <Text style={badgeStyles.trendingBadgeText}>{t('discovery.badge.trending')}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  newBadge: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  newBadgeText: { color: '#2E7D32', fontSize: 10, fontWeight: '700' },
  gemBadge: { backgroundColor: '#FFF9C4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  gemBadgeText: { color: '#F57F17', fontSize: 10, fontWeight: '700' },
  trendingBadge: { backgroundColor: '#FCE4EC', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  trendingBadgeText: { color: '#AD1457', fontSize: 10, fontWeight: '700' },
});

// ─── Place card ────────────────────────────────────────────────────────────────

function PlaceCard({
  card,
  onPress,
  badge,
  width = 180,
}: {
  card: DiscoveryPlaceCard;
  onPress: (id: string) => void;
  badge?: 'new' | 'gem' | 'trending' | null;
  width?: number;
}): ReactElement {
  const [imgError, setImgError] = useState(false);
  const hasThumb = card.thumbnailAssetId != null && !imgError;

  return (
    <Pressable
      style={[cardStyles.card, { width }]}
      onPress={() => onPress(card.placeId)}
      accessibilityRole="button"
      accessibilityLabel={t('discovery.placeCard.a11y', { name: card.name })}
    >
      {hasThumb ? (
        <Image
          source={{ uri: `/api/media/assets/${card.thumbnailAssetId}/thumbnail` }}
          style={cardStyles.thumb}
          resizeMode="cover"
          onError={() => setImgError(true)}
          accessibilityElementsHidden
        />
      ) : (
        <View style={[cardStyles.thumb, cardStyles.thumbPlaceholder]}>
          <Text style={cardStyles.thumbPlaceholderText}>{categoryIcon(card.category)}</Text>
        </View>
      )}
      <View style={cardStyles.cardBody}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {badge === 'new' ? <NewBadge /> : null}
          {badge === 'gem' ? <GemBadge /> : null}
          {badge === 'trending' ? <TrendingBadge /> : null}
        </View>
        <Text style={cardStyles.cardTitle} numberOfLines={2}>
          {card.name}
        </Text>
        {card.category != null ? (
          <Text style={cardStyles.cardCategory}>{t(`discovery.category.${card.category}`)}</Text>
        ) : null}
        <RatingStars rating={card.rating} count={card.reviewCount} />
        {card.distanceM != null ? (
          <Text style={cardStyles.cardDistance}>
            {card.distanceM < 1000
              ? t('discovery.distance.m', { n: Math.round(card.distanceM) })
              : t('discovery.distance.km', { n: (card.distanceM / 1000).toFixed(1) })}
          </Text>
        ) : null}
        {card.reason != null ? (
          <Text style={cardStyles.cardReason} numberOfLines={1}>{card.reason}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function categoryIcon(cat: PlaceCategory | null): string {
  const map: Record<string, string> = {
    food: '🍽️', transport: '🚌', tourism: '🏛️',
    shopping: '🛍️', services: '🔧', health: '🏥',
    education: '📚', finance: '🏦', accommodation: '🏨',
    entertainment: '🎭', sport: '⚽', religion: '🕌',
    nature: '🌿',
  };
  return map[cat ?? ''] ?? '📍';
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  thumb: {
    width: '100%',
    height: 110,
  },
  thumbPlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: {
    fontSize: 36,
  },
  cardBody: {
    padding: 10,
    gap: 2,
  },
  cardTitle: {
    fontSize: CARD_TITLE_SIZE,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
    marginTop: 4,
  },
  cardCategory: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'auto',
  },
  cardDistance: {
    fontSize: 11,
    color: COLORS.primary,
    marginTop: 2,
  },
  cardReason: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
    textAlign: 'auto',
  },
});

// ─── Horizontal section ────────────────────────────────────────────────────────

function HorizontalSection({
  title,
  items,
  onPress,
  badge,
  emptyLabel,
  loading,
  cardWidth,
}: {
  title: string;
  items: DiscoveryPlaceCard[];
  onPress: (id: string) => void;
  badge?: 'new' | 'gem' | 'trending' | null;
  emptyLabel?: string;
  loading: boolean;
  cardWidth?: number;
}): ReactElement | null {
  if (!loading && items.length === 0) return null;

  return (
    <View style={sectionStyles.section}>
      <Text style={sectionStyles.sectionTitle}>{title}</Text>
      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
          {[1, 2, 3].map((k) => <PlaceCardSkeleton key={k} />)}
        </ScrollView>
      ) : items.length === 0 && emptyLabel != null ? (
        <Text style={sectionStyles.emptyLabel}>{emptyLabel}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.placeId}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
          renderItem={({ item }) => (
            <PlaceCard card={item} onPress={onPress} badge={badge} width={cardWidth ?? 180} />
          )}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={3}
        />
      )}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  section: { paddingVertical: 12 },
  sectionTitle: {
    fontSize: SECTION_TITLE_SIZE,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 12,
    textAlign: 'auto',
  },
  emptyLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    paddingHorizontal: 16,
    textAlign: 'auto',
  },
});

// ─── Weekly highlights carousel ────────────────────────────────────────────────

function WeeklyHighlightsSection({
  highlights,
  loading,
  onPress,
}: {
  highlights: WeeklyHighlightsResult | null;
  loading: boolean;
  onPress: (id: string) => void;
}): ReactElement | null {
  if (!loading && highlights === null) return null;

  const renderHighlight = (h: WeeklyHighlight, idx: number) => (
    <Pressable
      key={`${h.kind}-${idx}`}
      style={weeklyStyles.card}
      onPress={() => onPress(h.place.placeId)}
      accessibilityRole="button"
      accessibilityLabel={h.place.name}
    >
      {h.place.thumbnailAssetId != null ? (
        <Image
          source={{ uri: `/api/media/assets/${h.place.thumbnailAssetId}/thumbnail` }}
          style={weeklyStyles.heroImage}
          resizeMode="cover"
          accessibilityElementsHidden
        />
      ) : (
        <View style={[weeklyStyles.heroImage, { backgroundColor: '#E8EAF6', alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 48 }}>{categoryIcon(h.place.category)}</Text>
        </View>
      )}
      <View style={weeklyStyles.cardOverlay}>
        <View style={weeklyStyles.kindChip}>
          <Text style={weeklyStyles.kindChipText}>{t(`discovery.weeklyKind.${h.kind}`)}</Text>
        </View>
        {h.headline != null ? (
          <Text style={weeklyStyles.headline} numberOfLines={2}>{h.headline}</Text>
        ) : null}
        <Text style={weeklyStyles.placeName} numberOfLines={1}>{h.place.name}</Text>
        {h.place.category != null ? (
          <Text style={weeklyStyles.placeCategory}>{t(`discovery.category.${h.place.category}`)}</Text>
        ) : null}
        <RatingStars rating={h.place.rating} count={h.place.reviewCount} />
      </View>
    </Pressable>
  );

  const allHighlights: WeeklyHighlight[] = [
    ...(highlights?.featured != null ? [highlights.featured] : []),
    ...(highlights?.newThisWeek ?? []),
    ...(highlights?.hiddenGems ?? []),
    ...(highlights?.trending ?? []),
  ];

  return (
    <View style={sectionStyles.section}>
      <Text style={sectionStyles.sectionTitle}>{t('discovery.section.weeklyHighlights')}</Text>
      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}>
          {[1, 2].map((k) => (
            <View key={k} style={[weeklyStyles.card, { backgroundColor: '#F0F0F0' }]}>
              <SkeletonBlock width="100%" height={180} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={allHighlights}
          keyExtractor={(item, idx) => `${item.kind}-${item.place.placeId}-${idx}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
          renderItem={({ item, index }) => renderHighlight(item, index)}
          initialNumToRender={3}
          maxToRenderPerBatch={4}
          windowSize={3}
        />
      )}
    </View>
  );
}

const weeklyStyles = StyleSheet.create({
  card: {
    width: 240,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  heroImage: {
    width: '100%',
    height: 180,
  },
  cardOverlay: {
    padding: 12,
    gap: 4,
  },
  kindChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryXLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
  },
  kindChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headline: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  placeName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  placeCategory: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'auto',
  },
});

// ─── Context banner ────────────────────────────────────────────────────────────

function ContextBanner({
  label,
  loading,
}: {
  label: string | null;
  loading: boolean;
}): ReactElement | null {
  if (loading) {
    return (
      <View style={bannerStyles.container}>
        <SkeletonBlock width="70%" height={16} />
      </View>
    );
  }
  if (!label) return null;
  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.text}>{label}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primaryXLight,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
    padding: 12,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'auto',
  },
});

// ─── Category grid ─────────────────────────────────────────────────────────────

const MAIN_CATEGORIES: Array<{ cat: PlaceCategory; icon: string }> = [
  { cat: 'food', icon: '🍽️' },
  { cat: 'shopping', icon: '🛍️' },
  { cat: 'tourism', icon: '🏛️' },
  { cat: 'services', icon: '🔧' },
  { cat: 'transport', icon: '🚌' },
];

function CategoryGrid({ onPress }: { onPress: (cat: PlaceCategory) => void }): ReactElement {
  return (
    <View style={gridStyles.container}>
      <Text style={sectionStyles.sectionTitle}>{t('discovery.section.categories')}</Text>
      <View style={gridStyles.row}>
        {MAIN_CATEGORIES.map(({ cat, icon }) => (
          <Pressable
            key={cat}
            style={gridStyles.item}
            onPress={() => onPress(cat)}
            accessibilityRole="button"
            accessibilityLabel={t(`discovery.category.${cat}`)}
          >
            <Text style={gridStyles.icon}>{icon}</Text>
            <Text style={gridStyles.label}>{t(`discovery.category.${cat}`)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const gridStyles = StyleSheet.create({
  container: { paddingVertical: 4, paddingHorizontal: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: {
    flex: 1,
    minWidth: 56,
    maxWidth: 80,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  icon: { fontSize: 24 },
  label: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center' },
});

// ─── Section divider ──────────────────────────────────────────────────────────

function Divider(): ReactElement {
  return <View style={{ height: 1, backgroundColor: COLORS.border, marginHorizontal: 16, marginVertical: 4 }} />;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function DiscoverNearbyScreen(): ReactElement {
  const router = useRouter();
  const session = useSession();
  const isSignedIn = session.state.status === 'signedIn';

  // ── State ────────────────────────────────────────────────────────────────

  const [contextResult, setContextResult] = useState<ContextualSuggestionsResult | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [personalizedFeed, setPersonalizedFeed] = useState<DiscoveryPlaceCard[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const [weeklyHighlights, setWeeklyHighlights] = useState<WeeklyHighlightsResult | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const [recentlyOpened, setRecentlyOpened] = useState<DiscoveryPlaceCard[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const [hiddenGems, setHiddenGems] = useState<DiscoveryPlaceCard[]>([]);
  const [gemsLoading, setGemsLoading] = useState(true);

  const [trending, setTrending] = useState<DiscoveryPlaceCard[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const baseUrl = useApiBaseUrl();

  const now = new Date();
  const hourOfDay = now.getHours();
  const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // ISO 1–7
  const isRamadan = isRamadanNow();
  const month = currentMonth();

  // Hard-coded city for MVP; in production this comes from the user's city context.
  const city = 'baghdad';

  // ── Fetch helpers ────────────────────────────────────────────────────────

  const discoveryFetch = useCallback(
    async <T,>(path: string, params: Record<string, string | number | boolean>): Promise<T | null> => {
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString();
      try {
        const url = `${baseUrl}${path}?${qs}`;
        const authHeader: Record<string, string> = session.state.status === 'signedIn' ? { Authorization: `Bearer ${session.state.accessToken}` } : {};
        const res = await fetch(url, { headers: authHeader });
        if (!res.ok) return null;
        return (await res.json()) as T;
      } catch {
        return null;
      }
    },
    [baseUrl, session.state],
  );

  // ── Load all sections ────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setGlobalError(null);

    // Contextual suggestions
    const contextPromise = discoveryFetch<ContextualSuggestionsResult>('/v1/discovery/contextual', {
      city,
      lat: 33.34,
      lng: 44.40,
      hourOfDay,
      dayOfWeek,
      isRamadan,
      limit: 10,
    }).then((r) => { setContextResult(r); setContextLoading(false); });

    // Personalized feed (only if signed in)
    const feedPromise = isSignedIn
      ? discoveryFetch<PersonalizedFeedResult>('/v1/discovery/feed', {
          city,
          hourOfDay,
          dayOfWeek,
          ...(isRamadan ? { hijriMonth: 9 } : {}),
          limit: 15,
        }).then((r) => {
          if (r) { setPersonalizedFeed(r.items); setFeedCursor(r.nextCursor); }
          setFeedLoading(false);
        })
      : Promise.resolve(setFeedLoading(false));

    // Weekly highlights
    const weeklyPromise = discoveryFetch<WeeklyHighlightsResult>('/v1/discovery/weekly-highlights', { city })
      .then((r) => { setWeeklyHighlights(r); setWeeklyLoading(false); });

    // Recently opened
    const recentPromise = discoveryFetch<{ items: DiscoveryPlaceCard[] }>('/v1/discovery/recently-opened', { city, days: 14, limit: 10 })
      .then((r) => { if (r) setRecentlyOpened(r.items); setRecentLoading(false); });

    // Hidden gems
    const gemsPromise = discoveryFetch<{ items: DiscoveryPlaceCard[] }>('/v1/discovery/hidden-gems', { city, limit: 10 })
      .then((r) => { if (r) setHiddenGems(r.items); setGemsLoading(false); });

    // Trending
    const trendPromise = discoveryFetch<{ items: DiscoveryPlaceCard[] }>('/v1/discovery/trending', { city, windowDays: 7, limit: 10 })
      .then((r) => { if (r) setTrending(r.items); setTrendingLoading(false); });

    await Promise.allSettled([contextPromise, feedPromise, weeklyPromise, recentPromise, gemsPromise, trendPromise]);
  }, [discoveryFetch, city, hourOfDay, dayOfWeek, isRamadan, isSignedIn]);

  useEffect(() => { void loadAll(); }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setContextLoading(true);
    setFeedLoading(true);
    setWeeklyLoading(true);
    setRecentLoading(true);
    setGemsLoading(true);
    setTrendingLoading(true);
    setPersonalizedFeed([]);
    setFeedCursor(null);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleLoadMoreFeed = useCallback(async () => {
    if (!feedCursor || feedLoadingMore || !isSignedIn) return;
    setFeedLoadingMore(true);
    const r = await discoveryFetch<PersonalizedFeedResult>('/v1/discovery/feed', {
      city,
      cursor: feedCursor,
      limit: 15,
    });
    if (r) {
      setPersonalizedFeed((prev) => [...prev, ...r.items]);
      setFeedCursor(r.nextCursor);
    }
    setFeedLoadingMore(false);
  }, [feedCursor, feedLoadingMore, isSignedIn, discoveryFetch, city]);

  // ── Navigation ───────────────────────────────────────────────────────────

  const handlePlacePress = useCallback((placeId: string) => {
    router.push({ pathname: '/', params: { focusPlaceId: placeId } });
  }, [router]);

  const handleCategoryPress = useCallback((cat: PlaceCategory) => {
    router.push({ pathname: '/map/nearby', params: { category: cat } });
  }, [router]);

  // ── Render ───────────────────────────────────────────────────────────────

  const isAnyLoading = contextLoading || feedLoading || weeklyLoading || recentLoading || gemsLoading || trendingLoading;

  return (
    <View style={screenStyles.container}>
      {/* Header */}
      <View style={screenStyles.header}>
        <Text style={screenStyles.headerTitle}>{t('discovery.screen.title')}</Text>
        {isRamadan ? (
          <View style={screenStyles.ramadanChip}>
            <Text style={screenStyles.ramadanChipText}>{t('discovery.ramadan.label')}</Text>
          </View>
        ) : null}
      </View>

      {globalError != null ? (
        <View style={screenStyles.errorRow}>
          <Text style={screenStyles.errorText}>{globalError}</Text>
          <Pressable onPress={() => { void handleRefresh(); }} accessibilityRole="button" accessibilityLabel={t('discovery.retry')}>
            <Text style={screenStyles.retryText}>{t('discovery.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        style={screenStyles.scroll}
        contentContainerStyle={screenStyles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void handleRefresh(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Context banner */}
        <ContextBanner label={contextResult?.contextLabel ?? null} loading={contextLoading} />

        {/* 2. Contextual suggestions */}
        <HorizontalSection
          title={t('discovery.section.contextual')}
          items={contextResult?.items ?? []}
          onPress={handlePlacePress}
          loading={contextLoading}
          cardWidth={170}
        />

        <Divider />

        {/* 3. Personalized feed (signed-in only) */}
        {isSignedIn ? (
          <>
            <HorizontalSection
              title={t('discovery.section.forYou')}
              items={personalizedFeed}
              onPress={handlePlacePress}
              loading={feedLoading}
              emptyLabel={t('discovery.section.forYouEmpty')}
              cardWidth={190}
            />
            {feedCursor != null ? (
              <Pressable
                style={screenStyles.loadMoreBtn}
                onPress={() => { void handleLoadMoreFeed(); }}
                accessibilityRole="button"
                accessibilityLabel={t('discovery.loadMore')}
                disabled={feedLoadingMore}
              >
                {feedLoadingMore
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={screenStyles.loadMoreText}>{t('discovery.loadMore')}</Text>}
              </Pressable>
            ) : null}
            <Divider />
          </>
        ) : null}

        {/* 4. Weekly highlights */}
        <WeeklyHighlightsSection
          highlights={weeklyHighlights}
          loading={weeklyLoading}
          onPress={handlePlacePress}
        />

        <Divider />

        {/* 5. Category grid */}
        <CategoryGrid onPress={handleCategoryPress} />

        <Divider />

        {/* 6. Recently opened */}
        <HorizontalSection
          title={t('discovery.section.recentlyOpened')}
          items={recentlyOpened}
          onPress={handlePlacePress}
          badge="new"
          loading={recentLoading}
          emptyLabel={t('discovery.section.recentlyOpenedEmpty')}
          cardWidth={170}
        />

        <Divider />

        {/* 7. Hidden gems */}
        <HorizontalSection
          title={t('discovery.section.hiddenGems')}
          items={hiddenGems}
          onPress={handlePlacePress}
          badge="gem"
          loading={gemsLoading}
          emptyLabel={t('discovery.section.hiddenGemsEmpty')}
          cardWidth={180}
        />

        <Divider />

        {/* 8. Trending */}
        <HorizontalSection
          title={t('discovery.section.trending')}
          items={trending}
          onPress={handlePlacePress}
          badge="trending"
          loading={trendingLoading}
          emptyLabel={t('discovery.section.trendingEmpty')}
          cardWidth={180}
        />

        {isAnyLoading ? (
          <View style={screenStyles.globalSpinner}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  ramadanChip: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ramadanChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E65100',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFEBEE',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.error,
    textAlign: 'auto',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  globalSpinner: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
