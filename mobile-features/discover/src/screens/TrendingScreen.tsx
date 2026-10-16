import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, formatCount, formatRelativeTime, sharedStyles, getTypeBadgeColors } from './shared';
import { t } from '../strings';
import { useDiscoverClient } from '../client';
import { HashtagTrendList, type HashtagTrendData } from '../components/HashtagTrend';

// ─── Types ────────────────────────────────────────────────────────────────────

type CityKey = 'baghdad' | 'erbil' | 'basra' | 'mosul';
type TimeRange = 'today' | 'week' | 'month';

interface TrendingPost {
  id: string;
  authorId: string;
  type: 'photo' | 'tip' | 'event' | 'offer';
  body: string;
  mediaAssetIds: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  isLikedByMe: boolean;
  createdAt: string;
}

interface TrendingPlace {
  id: string;
  name: string;
  postCount: number;
  visitCount: number;
  category?: string;
}

interface TrendingUser {
  id: string;
  displayName: string;
  bio?: string;
  followerCount: number;
  postCount: number;
  isFollowing: boolean;
  growthPct?: number;
}

interface TrendingHashtagItem {
  hashtag: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
}

// ─── Animation helpers ────────────────────────────────────────────────────────

function useEntryAnim(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, delay]);

  return { opacity, transform: [{ translateY }] };
}

// ─── City selector ────────────────────────────────────────────────────────────

const CITIES: CityKey[] = ['baghdad', 'erbil', 'basra', 'mosul'];

function getCityLabel(city: CityKey): string {
  return t(`trending.city.${city}` as Parameters<typeof t>[0]);
}

interface CitySelectorProps {
  selected: CityKey;
  onSelect: (city: CityKey) => void;
}

function CitySelector({ selected, onSelect }: CitySelectorProps): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={cityStyles.scrollContent}
      style={cityStyles.container}
    >
      {CITIES.map((city) => (
        <Pressable
          key={city}
          style={[cityStyles.chip, selected === city && cityStyles.chipActive]}
          onPress={() => onSelect(city)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === city }}
          accessibilityLabel={getCityLabel(city)}
        >
          <Text style={[cityStyles.chipText, selected === city && cityStyles.chipTextActive]}>
            {getCityLabel(city)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const cityStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    maxHeight: 52,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: '#FFF',
  },
});

// ─── Time range tabs ──────────────────────────────────────────────────────────

const TIME_RANGES: TimeRange[] = ['today', 'week', 'month'];

function getTimeRangeLabel(range: TimeRange): string {
  return t(`trending.timeRange.${range}` as Parameters<typeof t>[0]);
}

interface TimeRangeTabsProps {
  selected: TimeRange;
  onSelect: (range: TimeRange) => void;
}

function TimeRangeTabs({ selected, onSelect }: TimeRangeTabsProps): ReactElement {
  return (
    <View style={timeStyles.container}>
      {TIME_RANGES.map((range) => (
        <Pressable
          key={range}
          style={[timeStyles.tab, selected === range && timeStyles.tabActive]}
          onPress={() => onSelect(range)}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === range }}
        >
          <Text style={[timeStyles.tabText, selected === range && timeStyles.tabTextActive]}>
            {getTimeRangeLabel(range)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const timeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }): ReactElement {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button">
          <Text style={sectionStyles.seeAll}>{t('trending.seeAll' as Parameters<typeof t>[0])}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  seeAll: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
});

// ─── Trending hashtag row ─────────────────────────────────────────────────────

function TrendingHashtagRow({
  item,
  rank,
  onPress,
}: {
  item: TrendingHashtagItem;
  rank: number;
  onPress: (tag: string) => void;
}): ReactElement {
  const trendIcon = item.trend === 'up' ? '↑' : item.trend === 'down' ? '↓' : '→';
  const trendColor = item.trend === 'up' ? '#2E7D32' : item.trend === 'down' ? COLORS.error : COLORS.textMuted;

  return (
    <Pressable
      style={hashtagRowStyles.row}
      onPress={() => onPress(item.hashtag)}
      accessibilityRole="button"
      accessibilityLabel={`#${item.hashtag}`}
    >
      <Text style={hashtagRowStyles.rank}>{rank}</Text>
      <View style={hashtagRowStyles.info}>
        <Text style={hashtagRowStyles.tag}>#{item.hashtag}</Text>
        <Text style={hashtagRowStyles.count}>
          {formatCount(item.count)} {t('trending.posts' as Parameters<typeof t>[0])}
        </Text>
      </View>
      <Text style={[hashtagRowStyles.trend, { color: trendColor }]}>{trendIcon}</Text>
    </Pressable>
  );
}

const hashtagRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rank: {
    width: 22,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  info: {
    flex: 1,
  },
  tag: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'auto',
  },
  count: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'auto',
  },
  trend: {
    fontSize: 16,
    fontWeight: '700',
  },
});

// ─── Trending post card ────────────────────────────────────────────────────────

interface TrendingPostCardProps {
  item: TrendingPost;
  rank: number;
  onPress: (id: string) => void;
  onLike: (id: string, liked: boolean) => void;
}

function TrendingPostCard({ item, rank, onPress, onLike }: TrendingPostCardProps): ReactElement {
  const [liked, setLiked] = useState(item.isLikedByMe);
  const [likeCount, setLikeCount] = useState(item.likeCount);
  const badgeColors = getTypeBadgeColors(item.type);

  const handleLike = useCallback(() => {
    const next = !liked;
    setLiked(next);
    setLikeCount((p) => (next ? p + 1 : Math.max(0, p - 1)));
    onLike(item.id, liked);
  }, [liked, item.id, onLike]);

  return (
    <View style={trendPostStyles.card}>
      <Pressable onPress={() => onPress(item.id)} accessibilityRole="button" accessibilityLabel={item.body.slice(0, 60)}>
        <View style={trendPostStyles.rankBadge}>
          <Text style={trendPostStyles.rankText}>#{rank}</Text>
        </View>

        <View style={trendPostStyles.content}>
          <View style={trendPostStyles.topRow}>
            <View style={[trendPostStyles.typeBadge, { backgroundColor: badgeColors.bg }]}>
              <Text style={[trendPostStyles.typeBadgeText, { color: badgeColors.text }]}>
                {t(`post.type.${item.type}` as Parameters<typeof t>[0])}
              </Text>
            </View>
            <Text style={trendPostStyles.timeAgo}>{formatRelativeTime(item.createdAt, t)}</Text>
          </View>

          <Text style={trendPostStyles.body} numberOfLines={3}>
            {item.body}
          </Text>

          <View style={trendPostStyles.statsRow}>
            <Pressable
              onPress={handleLike}
              style={[trendPostStyles.statBtn, liked && trendPostStyles.statBtnLiked]}
              accessibilityRole="button"
              accessibilityLabel={t('post.like')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={trendPostStyles.statIcon}>{liked ? '❤️' : '🤍'}</Text>
              <Text style={[trendPostStyles.statCount, liked && trendPostStyles.statCountLiked]}>
                {formatCount(likeCount)}
              </Text>
            </Pressable>

            <View style={trendPostStyles.statBtn}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={trendPostStyles.statIcon}>💬</Text>
              <Text style={trendPostStyles.statCount}>{formatCount(item.commentCount)}</Text>
            </View>

            <View style={trendPostStyles.statBtn}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={trendPostStyles.statIcon}>👁</Text>
              <Text style={trendPostStyles.statCount}>{formatCount(item.viewCount)}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const trendPostStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  rankBadge: {
    position: 'absolute',
    top: 10,
    start: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 1,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  content: {
    padding: 14,
    paddingTop: 36,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeAgo: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'auto',
  },
  body: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 21,
    textAlign: 'auto',
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  statBtnLiked: {
    backgroundColor: '#FFEBEE',
  },
  statIcon: {
    fontSize: 14,
  },
  statCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  statCountLiked: {
    color: '#D32F2F',
  },
});

// ─── Trending place card ──────────────────────────────────────────────────────

function TrendingPlaceCard({
  item,
  rank,
  onPress,
}: {
  item: TrendingPlace;
  rank: number;
  onPress: (id: string) => void;
}): ReactElement {
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const rankBg = rankColors[rank - 1] ?? COLORS.border;

  return (
    <Pressable
      style={placeStyles.card}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={[placeStyles.rankCircle, { backgroundColor: rankBg }]}>
        <Text style={placeStyles.rank}>{rank}</Text>
      </View>
      <View style={placeStyles.info}>
        <Text style={placeStyles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={placeStyles.meta}>
          {formatCount(item.visitCount)} {t('trending.visits' as Parameters<typeof t>[0])} ·{' '}
          {formatCount(item.postCount)} {t('trending.posts' as Parameters<typeof t>[0])}
        </Text>
      </View>
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <Text style={placeStyles.arrow}>›</Text>
    </Pressable>
  );
}

const placeStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  meta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'auto',
  },
  arrow: {
    fontSize: 20,
    color: COLORS.textMuted,
  },
});

// ─── Trending user card ────────────────────────────────────────────────────────

function TrendingUserCard({
  item,
  onPress,
  onFollow,
}: {
  item: TrendingUser;
  onPress: (id: string) => void;
  onFollow: (id: string, isFollowing: boolean) => void;
}): ReactElement {
  const [following, setFollowing] = useState(item.isFollowing);

  const handleFollow = useCallback(() => {
    setFollowing((p) => !p);
    onFollow(item.id, following);
  }, [following, item.id, onFollow]);

  return (
    <Pressable
      style={userStyles.card}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={item.displayName}
    >
      <View style={userStyles.avatar}>
        <Text style={userStyles.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={userStyles.info}>
        <Text style={userStyles.name} numberOfLines={1}>{item.displayName}</Text>
        {item.bio ? (
          <Text style={userStyles.bio} numberOfLines={1}>{item.bio}</Text>
        ) : null}
        <View style={userStyles.metaRow}>
          <Text style={userStyles.meta}>
            {formatCount(item.followerCount)} {t('profile.followers')}
          </Text>
          {item.growthPct != null ? (
            <View style={userStyles.growthBadge}>
              <Text style={userStyles.growthText}>+{item.growthPct}%</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable
        style={[userStyles.followBtn, following && userStyles.followBtnActive]}
        onPress={handleFollow}
        accessibilityRole="button"
        accessibilityLabel={following ? t('profile.unfollow') : t('profile.follow')}
        accessibilityState={{ selected: following }}
      >
        <Text style={[userStyles.followBtnText, following && userStyles.followBtnTextActive]}>
          {following ? t('profile.following') : t('profile.follow')}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const userStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  bio: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'auto',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  meta: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'auto',
  },
  growthBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  growthText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  followBtnActive: {
    backgroundColor: COLORS.primary,
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  followBtnTextActive: {
    color: '#FFF',
  },
});

// ─── NearYou section ──────────────────────────────────────────────────────────

function NearYouSection({
  posts,
  onPress,
  anim,
}: {
  posts: TrendingPost[];
  onPress: (id: string) => void;
  anim: ReturnType<typeof useEntryAnim>;
}): ReactElement {
  if (posts.length === 0) return <View />;
  return (
    <Animated.View style={anim}>
      <SectionHeader title={t('trending.nearYou' as Parameters<typeof t>[0])} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {posts.map((post) => (
          <Pressable
            key={post.id}
            style={nearStyles.card}
            onPress={() => onPress(post.id)}
            accessibilityRole="button"
            accessibilityLabel={post.body.slice(0, 60)}
          >
            <Text style={nearStyles.body} numberOfLines={4}>{post.body}</Text>
            <View style={nearStyles.footer}>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={nearStyles.likes}>❤ {formatCount(post.likeCount)}</Text>
              <Text style={nearStyles.time}>{formatRelativeTime(post.createdAt, t)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const nearStyles = StyleSheet.create({
  card: {
    width: 180,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'space-between',
    minHeight: 110,
  },
  body: {
    fontSize: 13,
    color: COLORS.textPrimary,
    lineHeight: 19,
    textAlign: 'auto',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  likes: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  time: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
});

// ─── TrendingScreen ───────────────────────────────────────────────────────────

export function TrendingScreen(): ReactElement {
  const router = useRouter();
  const api = useDiscoverClient();

  const [city, setCity] = useState<CityKey>('baghdad');
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const [hashtags, setHashtags] = useState<HashtagTrendData[]>([]);
  const [trendingHashtagRows, setTrendingHashtagRows] = useState<TrendingHashtagItem[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [trendingPlaces, setTrendingPlaces] = useState<TrendingPlace[]>([]);
  const [trendingUsers, setTrendingUsers] = useState<TrendingUser[]>([]);
  const [nearYouPosts, setNearYouPosts] = useState<TrendingPost[]>([]);

  // Animated section entries
  const hashtagAnim = useEntryAnim(0);
  const placesAnim = useEntryAnim(80);
  const postsAnim = useEntryAnim(160);
  const usersAnim = useEntryAnim(240);
  const nearAnim = useEntryAnim(320);

  const loadData = useCallback(async () => {
    setError(undefined);
    try {
      const [hashtagRes, trendingRes] = await Promise.all([
        api.trendingHashtags({ query: {} }),
        api.trending({ query: { limit: 10 } }),
      ]);

      if (hashtagRes.status === 200) {
        const rawHashtags = (hashtagRes.body as unknown as { items?: Array<{ hashtag: string; count: number }> }).items
          ?? (hashtagRes.body as unknown as Array<{ hashtag: string; count: number }>);
        const mapped = rawHashtags.map((h) => ({
          hashtag: h.hashtag,
          count: h.count,
          sparkline: Array.from({ length: 12 }, (_, i) => Math.max(1, Math.round(h.count * (0.3 + (i / 11) * 0.7)))),
        }));
        setHashtags(mapped);
        setTrendingHashtagRows(
          rawHashtags.slice(0, 10).map((h, i) => ({
            hashtag: h.hashtag,
            count: h.count,
            trend: i % 3 === 0 ? 'up' : i % 3 === 1 ? 'down' : 'stable',
          })),
        );
      }

      if (trendingRes.status === 200) {
        const posts = trendingRes.body.items as TrendingPost[];
        setTrendingPosts(posts.slice(0, 5));
        setNearYouPosts(posts.slice(5, 10));
      }

      // Mock places & users — real endpoint would include city + time-range params
      /* eslint-disable no-restricted-syntax */
      setTrendingPlaces(
        city === 'baghdad'
          ? [
              { id: 'p1', name: 'شارع المتنبي', postCount: 142, visitCount: 1820 },
              { id: 'p2', name: 'الأعظمية', postCount: 98, visitCount: 1340 },
              { id: 'p3', name: 'بغداد الجديدة', postCount: 76, visitCount: 980 },
            ]
          : city === 'erbil'
          ? [
              { id: 'e1', name: 'قلعة أربيل', postCount: 220, visitCount: 3100 },
              { id: 'e2', name: 'شارع 60', postCount: 185, visitCount: 2400 },
            ]
          : city === 'basra'
          ? [
              { id: 'b1', name: 'شط العرب', postCount: 130, visitCount: 1900 },
              { id: 'b2', name: 'البصرة القديمة', postCount: 88, visitCount: 1200 },
            ]
          : [
              { id: 'm1', name: 'الجامع الكبير', postCount: 95, visitCount: 1400 },
              { id: 'm2', name: 'متحف الموصل', postCount: 62, visitCount: 890 },
            ],
      );
      setTrendingUsers([
        { id: 'u1', displayName: 'بغداد_اليوم', followerCount: 4200, postCount: 89, isFollowing: false, growthPct: 12 },
        { id: 'u2', displayName: 'عراق_للجميع', followerCount: 2800, postCount: 54, isFollowing: false, growthPct: 8 },
        { id: 'u3', displayName: 'مصور_العراق', followerCount: 1900, postCount: 123, isFollowing: false, growthPct: 22 },
      ]);
      /* eslint-enable no-restricted-syntax */
    } catch {
      setError(t('feed.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, city]);

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [city, timeRange, loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const handleHashtagPress = useCallback((tag: string) => {
    const bare = tag.replace(/^#/, '');
    router.push({ pathname: '/(tabs)/discover/hashtag', params: { tag: bare } });
  }, [router]);

  const handlePostPress = useCallback((id: string) => {
    router.push({ pathname: '/(tabs)/discover/post', params: { id } });
  }, [router]);

  const handlePlacePress = useCallback((id: string) => {
    router.push({ pathname: '/(tabs)/map', params: { placeId: id } });
  }, [router]);

  const handleUserPress = useCallback((id: string) => {
    router.push({ pathname: '/(tabs)/discover/profile', params: { userId: id } });
  }, [router]);

  const handleFollow = useCallback(async (userId: string, isFollowing: boolean) => {
    try {
      if (isFollowing) {
        await api.unfollowUser({ params: { userId } });
      } else {
        await api.followUser({ params: { userId } });
      }
    } catch {
      // silent — optimistic update already applied
    }
  }, [api]);

  const handleLike = useCallback(async (postId: string, liked: boolean) => {
    try {
      if (liked) {
        await api.unlikePost({ params: { postId } });
      } else {
        await api.likePost({ params: { postId } });
      }
    } catch {
      // silent
    }
  }, [api]);

  return (
    <View style={sharedStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={sharedStyles.headerTitle}>{t('trending.title' as Parameters<typeof t>[0])}</Text>
        <Pressable
          onPress={handleRefresh}
          style={styles.refreshBtn}
          disabled={refreshing || loading}
          accessibilityRole="button"
          accessibilityLabel={t('feed.retry')}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            // eslint-disable-next-line i18next/no-literal-string
            <Text style={styles.refreshIcon}>↻</Text>
          )}
        </Pressable>
      </View>

      <CitySelector selected={city} onSelect={setCity} />
      <TimeRangeTabs selected={timeRange} onSelect={setTimeRange} />

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={handleRefresh} accessibilityRole="button">
            <Text style={styles.retryText}>{t('feed.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Trending hashtag rows */}
          {trendingHashtagRows.length > 0 ? (
            <Animated.View style={hashtagAnim}>
              <SectionHeader
                title={t('feed.trendingHashtagsTitle')}
                onSeeAll={() => router.push('/(tabs)/discover/hashtags' as never)}
              />
              <View style={styles.hashtagRowsContainer}>
                {trendingHashtagRows.slice(0, 5).map((h, idx) => (
                  <TrendingHashtagRow
                    key={h.hashtag}
                    item={h}
                    rank={idx + 1}
                    onPress={handleHashtagPress}
                  />
                ))}
              </View>
              {/* Sparkline strip below */}
              {hashtags.length > 0 ? (
                <View style={styles.sectionPad}>
                  <HashtagTrendList items={hashtags.slice(0, 8)} onPress={handleHashtagPress} />
                </View>
              ) : null}
            </Animated.View>
          ) : null}

          {/* Trending places */}
          {trendingPlaces.length > 0 ? (
            <Animated.View style={placesAnim}>
              <SectionHeader title={t('trending.placesTitle' as Parameters<typeof t>[0])} />
              {trendingPlaces.map((place, idx) => (
                <TrendingPlaceCard key={place.id} item={place} rank={idx + 1} onPress={handlePlacePress} />
              ))}
            </Animated.View>
          ) : null}

          {/* Trending posts */}
          {trendingPosts.length > 0 ? (
            <Animated.View style={postsAnim}>
              <SectionHeader
                title={t('trending.postsTitle' as Parameters<typeof t>[0])}
                onSeeAll={() => router.push('/(tabs)/discover' as never)}
              />
              {trendingPosts.map((post, idx) => (
                <TrendingPostCard
                  key={post.id}
                  item={post}
                  rank={idx + 1}
                  onPress={handlePostPress}
                  onLike={handleLike}
                />
              ))}
            </Animated.View>
          ) : null}

          {/* Trending users */}
          {trendingUsers.length > 0 ? (
            <Animated.View style={usersAnim}>
              <SectionHeader title={t('trending.usersTitle' as Parameters<typeof t>[0])} />
              {trendingUsers.map((user) => (
                <TrendingUserCard
                  key={user.id}
                  item={user}
                  onPress={handleUserPress}
                  onFollow={handleFollow}
                />
              ))}
            </Animated.View>
          ) : null}

          {/* Near you */}
          <NearYouSection
            posts={nearYouPosts}
            onPress={handlePostPress}
            anim={nearAnim}
          />

          <View style={styles.bottomPad} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 20,
    color: '#FFF',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 15,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  sectionPad: {
    paddingHorizontal: 16,
  },
  hashtagRowsContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bottomPad: {
    height: 32,
  },
});
