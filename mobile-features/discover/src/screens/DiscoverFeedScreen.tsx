import { discoverTestIDs, type DiscoverPostType } from '@iraq-maps/contracts';
import { href, useApi, useHaptics, useSession } from '@iraq-maps/mobile-kit';
import { useRouter } from 'expo-router';
import { memo, useState, useCallback, useEffect, useRef, useMemo, type ReactElement } from 'react';
import { useSavedPosts } from '../useSavedPosts';
import { useFollows } from '../useFollows';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  I18nManager,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import { getTypeBadgeColors, sharedStyles, COLORS, formatRelativeTime } from './shared';

I18nManager.forceRTL(true);

// ─── Skeleton loader ─────────────────────────────────────────────────────────

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

function SkeletonCard(): ReactElement {
  return (
    <View testID="skeleton-card" style={[skeletonStyles.card, { backgroundColor: COLORS.surface }]}>
      <View style={skeletonStyles.header}>
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={50} height={18} />
      </View>
      <SkeletonBlock width="100%" height={14} style={{ marginBottom: 6 }} />
      <SkeletonBlock width="75%" height={14} style={{ marginBottom: 12 }} />
      <View style={skeletonStyles.actions}>
        <SkeletonBlock width={70} height={28} />
        <SkeletonBlock width={70} height={28} />
        <SkeletonBlock width={70} height={28} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10 },
});

function SkeletonFeed(): ReactElement {
  return (
    <View style={{ padding: 12 }} accessibilityLabel={t('feed.loading')}>
      {[1, 2, 3].map((k) => <SkeletonCard key={k} />)}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(n % 1000 < 100 ? 0 : 1)}k`;
  }
  return String(n);
}


const TYPE_LABEL_KEYS: Record<string, 'post.type.photo' | 'post.type.tip' | 'post.type.event' | 'post.type.offer'> = {
  photo: 'post.type.photo',
  tip: 'post.type.tip',
  event: 'post.type.event',
  offer: 'post.type.offer',
};


const REPORT_REASONS = ['spam', 'inappropriate', 'misinformation', 'other'] as const;
const TYPE_FILTER_KEYS = ['all', 'photo', 'tip', 'event', 'offer'] as const;
type TypeFilter = typeof TYPE_FILTER_KEYS[number];
type ReportReason = typeof REPORT_REASONS[number];

const PostItem = memo(function PostItem({
  post,
  placeName,
  firstImageUrl,
  onLike,
  onComment,
  onPlacePress,
  onReport,
  onDelete,
  onEdit,
  onAuthorPress,
  onSave,
  isSaved,
  currentUserId,
}: {
  post: DiscoverPostType;
  placeName?: string;
  firstImageUrl?: string;
  onLike: (post: DiscoverPostType) => void;
  onComment: (post: DiscoverPostType) => void;
  onPlacePress: (placeId: string) => void;
  onReport: (postId: string, reason: ReportReason) => void;
  onDelete: (postId: string) => void;
  onEdit: (postId: string, body: string) => void;
  onAuthorPress: (authorId: string) => void;
  onSave: (post: DiscoverPostType) => void;
  isSaved: boolean;
  currentUserId?: string;
}): ReactElement {
  const isOwn = currentUserId === post.authorId;
  const badgeColors = getTypeBadgeColors(post.type);
  const haptics = useHaptics();

  const handleShare = useCallback(() => {
    const message = t('post.shareText', { body: post.body, postId: post.id });
    void Share.share({ message });
  }, [post.body, post.id]);

  const handleMorePress = useCallback(() => {
    if (isOwn) {
      // Own post: show edit and delete options
      Alert.alert(
        t('post.more'),
        undefined,
        [
          {
            text: t('post.edit'),
            onPress: () => onEdit(post.id, post.body),
          },
          {
            text: t('post.delete'),
            style: 'destructive' as const,
            onPress: () => onDelete(post.id),
          },
          { text: t('post.reportCancel'), style: 'cancel' as const },
        ],
      );
      return;
    }
    // Others' posts: show report reasons
    const reasonLabels = REPORT_REASONS.map((r) => t(`post.reportReason.${r}`));
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('post.reportTitle'),
          options: [...reasonLabels, t('post.reportCancel')],
          cancelButtonIndex: reasonLabels.length,
          destructiveButtonIndex: undefined,
        },
        (idx) => {
          const reason = REPORT_REASONS[idx];
          if (reason) onReport(post.id, reason);
        },
      );
    } else {
      Alert.alert(
        t('post.report'),
        t('post.reportTitle'),
        [
          ...REPORT_REASONS.map((r) => ({
            text: t(`post.reportReason.${r}`),
            onPress: () => onReport(post.id, r),
          })),
          { text: t('post.reportCancel'), style: 'cancel' as const },
        ],
      );
    }
  }, [post.id, post.body, onReport, onDelete, onEdit, isOwn]);

  return (
    <View testID={discoverTestIDs.feedItem(post.id)} style={[styles.card, { backgroundColor: COLORS.surface }]}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={() => onAuthorPress(post.authorId)}
          accessibilityRole="button"
          accessibilityLabel={post.authorId.slice(0, 8)}
        >
          <Text style={[styles.authorText, { color: COLORS.primary }]}>{post.authorId.slice(0, 8)}</Text>
          <Text style={[styles.timestampText, { color: COLORS.textSecondary }]}>{formatRelativeTime(post.createdAt, t)}</Text>
        </Pressable>
        <View style={styles.cardHeaderRight}>
          <View
            style={[styles.typeBadge, { backgroundColor: badgeColors.bg }]}
            accessibilityRole="text"
            accessibilityLabel={t('post.typeA11y', { type: TYPE_LABEL_KEYS[post.type] ? t(TYPE_LABEL_KEYS[post.type]!) : post.type })}
          >
            <Text style={[styles.typeText, { color: badgeColors.text }]}>
              {TYPE_LABEL_KEYS[post.type] ? t(TYPE_LABEL_KEYS[post.type]!) : post.type}
            </Text>
          </View>
          <Pressable
            style={styles.moreBtn}
            onPress={handleMorePress}
            accessibilityRole="button"
            accessibilityLabel={t('post.more')}

          >
            <Text style={[styles.moreBtnText, { color: COLORS.textSecondary }]}>{t('post.moreIcon')}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: COLORS.textPrimary }]}>{post.body}</Text>
      {firstImageUrl ? (
        <Image source={{ uri: firstImageUrl }} style={styles.postImage} resizeMode="cover" />
      ) : null}
      {post.placeId ? (
        <Pressable
          style={styles.placeChip}
          onPress={() => onPlacePress(post.placeId!)}
          accessibilityRole="button"
          accessibilityLabel={placeName ?? post.placeId.slice(0, 8)}
        >
          <Text style={styles.placeChipText}>📍 {placeName ?? post.placeId.slice(0, 8)}</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          testID={discoverTestIDs.likeButton(post.id)}
          style={[styles.actionBtn, { backgroundColor: COLORS.border }, post.isLikedByMe && styles.actionBtnActive]}
          onPress={() => { haptics.like(); onLike(post); }}
          accessibilityRole="button"
          accessibilityLabel={t('post.likeA11y', { author: post.authorId.slice(0, 8) })}
        >
          <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }, post.isLikedByMe && styles.actionBtnTextActive]}>
            {t('post.like')} {formatCount(post.likeCount)}
          </Text>
        </Pressable>
        <Pressable
          testID={discoverTestIDs.commentButton(post.id)}
          style={[styles.actionBtn, { backgroundColor: COLORS.border }]}
          onPress={() => onComment(post)}
          accessibilityRole="button"
        >
          <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>
            {t('post.comment')} {formatCount(post.commentCount)}
          </Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.border }]} onPress={handleShare} accessibilityRole="button">
          <Text style={[styles.actionBtnText, { color: COLORS.textSecondary }]}>{t('post.share')}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: isSaved ? COLORS.primaryXLight : COLORS.border }]}
          onPress={() => onSave(post)}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? t('saved.saved') : t('saved.save')}
        >
          <Text style={[styles.actionBtnText, { color: isSaved ? COLORS.primary : COLORS.textSecondary }]}>
            {isSaved ? t('saved.saved') : t('saved.save')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// ─── Trending strip ──────────────────────────────────────────────────────────

function TrendingStrip({ posts, onPress }: { posts: DiscoverPostType[]; onPress: (p: DiscoverPostType) => void }): ReactElement {
  return (
    <View style={trendingStyles.container}>
      <Text style={trendingStyles.sectionTitle}>{t('feed.trendingTitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={trendingStyles.row}>
        {posts.map((post) => {
          const colors = getTypeBadgeColors(post.type);
          return (
            <Pressable key={post.id} style={trendingStyles.card} onPress={() => onPress(post)} accessibilityRole="button">
              <View style={[trendingStyles.badge, { backgroundColor: colors.bg }]}>
                <Text style={[trendingStyles.badgeText, { color: colors.text }]}>{post.type}</Text>
              </View>
              <Text style={trendingStyles.body} numberOfLines={3}>{post.body}</Text>
              <Text style={trendingStyles.stats}>{t('feed.trendingStats', { likes: post.likeCount, comments: post.commentCount })}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const trendingStyles = StyleSheet.create({
  container: { paddingBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary, paddingHorizontal: 12, paddingBottom: 8, textAlign: 'auto' },
  row: { paddingHorizontal: 12, gap: 10 },
  card: { width: 160, backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  body: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 18, marginBottom: 6, textAlign: 'auto' },
  stats: { fontSize: 11, color: COLORS.textMuted },
});

export function DiscoverFeedScreen(): ReactElement {
  const api = useDiscoverClient();
  const extApi = useApi();
  const router = useRouter();
  const session = useSession();
  const currentUserId = session.state.status === 'signedIn' ? session.state.user.id : undefined;
  const { isSaved, toggleSave } = useSavedPosts();
  const handleSave = useCallback((post: DiscoverPostType) => { void toggleSave(post); }, [toggleSave]);
  const { followedIds } = useFollows();
  const [activeTab, setActiveTab] = useState<'all' | 'following'>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [placeNames, setPlaceNames] = useState<Readonly<Record<string, string>>>({});
  const [mediaUrls, setMediaUrls] = useState<Readonly<Record<string, string>>>({});
  const fetchingPlaceIds = useRef(new Set<string>());
  const fetchingAssetIds = useRef(new Set<string>());
  const [editingPost, setEditingPost] = useState<{ id: string; body: string } | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DiscoverPostType[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trendingPosts, setTrendingPosts] = useState<DiscoverPostType[]>([]);
  const [trendingLoaded, setTrendingLoaded] = useState(false);

  const loadFeed = useCallback(async (reset = false) => {
    if (!reset && (!hasMore || loadingMore)) return;
    if (reset) {
      setRefreshing(true);
    } else {
      setLoadingMore(true);
    }
    setError(undefined);
    setIsNetworkError(false);
    try {
      const res = await api.listFeed({ query: { cursor: reset ? undefined : cursor, limit: 10 } });
      if (res.status === 200) {
        const { items, nextCursor } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        setCursor(nextCursor);
        setHasMore(!!nextCursor);
      }
    } catch (err) {
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && (err.message.includes('Network') || err.message.includes('fetch') || err.message.includes('network')));
      setIsNetworkError(isNetwork);
      setError(isNetwork ? t('feed.networkError') : t('feed.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [api, cursor, hasMore, loadingMore]);

  // Load once on mount. loadFeed recreates on every state change so adding it
  // to deps would cause an infinite reload loop; mount-only is intentional.
  useEffect(() => { void loadFeed(true); }, []);

  // Fetch place names for any post.placeId not yet loaded
  useEffect(() => {
    const ids = posts
      .map((p) => p.placeId)
      .filter((id): id is NonNullable<typeof id> => !!id && !placeNames[id as string] && !fetchingPlaceIds.current.has(id as string));
    if (ids.length === 0) return;
    ids.forEach((id) => fetchingPlaceIds.current.add(id as string));
    void Promise.all(
      ids.map(async (id) => {
        const idStr = id as string;
        try {
          const res = await extApi.places.get({ params: { id } });
          if (res.status === 200) {
            const name: string = res.body.names.ar ?? res.body.names.name;
            setPlaceNames((prev) => ({ ...prev, [idStr]: name }));
          }
        } catch {
          // silent — place chip falls back to id slice
        } finally {
          fetchingPlaceIds.current.delete(idStr);
        }
      }),
    );
  }, [posts, placeNames, extApi]);

  // Fetch signed read URLs for first asset of posts that have media
  useEffect(() => {
    const assetIds = posts
      .flatMap((p) => p.mediaAssetIds.slice(0, 1))
      .filter((id) => !!id && !mediaUrls[id] && !fetchingAssetIds.current.has(id));
    if (assetIds.length === 0) return;
    assetIds.forEach((id) => fetchingAssetIds.current.add(id));
    void Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const res = await extApi.media.readUrl({ params: { assetId }, query: { size: 'thumbnail' } });
          if (res.status === 200) {
            const url: string = res.body.url.startsWith('/') ? `${res.body.url}` : res.body.url;
            setMediaUrls((prev) => ({ ...prev, [assetId]: url }));
          }
        } catch {
          // silent — image simply won't show
        } finally {
          fetchingAssetIds.current.delete(assetId);
        }
      }),
    );
  }, [posts, mediaUrls, extApi]);

  // Load trending posts once on mount (best-effort — silent on failure)
  useEffect(() => {
    void (async () => {
      try {
        const res = await api.trending({ query: { limit: 5 } });
        if (res.status === 200) setTrendingPosts(res.body.items);
      } catch { /* silent */ } finally {
        setTrendingLoaded(true);
      }
    })();
  // mount-only — api ref is stable
  }, []); // mount-only: api ref is stable

  const handleRefresh = useCallback(() => { void loadFeed(true); }, [loadFeed]);
  const handleEndReached = useCallback(() => { void loadFeed(false); }, [loadFeed]);

  const handleReport = useCallback(async (postId: string, reason: ReportReason) => {
    try {
      await api.reportPost({ params: { postId }, body: { reason } });
      Alert.alert(t('post.reportSuccess'));
    } catch {
      Alert.alert(t('post.reportError'));
    }
  }, [api]);

  const handleDelete = useCallback(async (postId: string) => {
    try {
      await api.deletePost({ params: { postId } });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      Alert.alert(t('post.deleteError'));
    }
  }, [api]);

  const handleOpenEdit = useCallback((postId: string, body: string) => {
    setEditingPost({ id: postId, body });
    setEditBody(body);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingPost || editBody.trim().length === 0) return;
    setEditSaving(true);
    try {
      const res = await api.updatePost({ params: { postId: editingPost.id }, body: { body: editBody.trim() } });
      if (res.status === 200) {
        setPosts((prev) => prev.map((p) => p.id === editingPost.id ? { ...p, body: res.body.body } : p));
        setEditingPost(null);
      } else {
        Alert.alert(t('post.editError'));
      }
    } catch {
      Alert.alert(t('post.editError'));
    } finally {
      setEditSaving(false);
    }
  }, [api, editingPost, editBody]);

  const handleLike = useCallback(async (post: DiscoverPostType) => {
    const postId = post.id;
    const optimisticLiked = !post.isLikedByMe;
    const optimisticCount = post.likeCount + (optimisticLiked ? 1 : -1);

    // Optimistic update — apply immediately so UI feels instant
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, isLikedByMe: optimisticLiked, likeCount: optimisticCount } : p,
      ),
    );

    try {
      if (post.isLikedByMe) {
        const res = await api.unlikePost({ params: { postId } });
        if (res.status === 200) {
          // Sync server count (may differ from optimistic if concurrent likes)
          setPosts((prev) =>
            prev.map((p) => p.id === postId ? { ...p, isLikedByMe: false, likeCount: res.body.likeCount } : p),
          );
        }
      } else {
        const res = await api.likePost({ params: { postId }, body: {} });
        if (res.status === 200) {
          setPosts((prev) =>
            prev.map((p) => p.id === postId ? { ...p, isLikedByMe: true, likeCount: res.body.likeCount } : p),
          );
        }
      }
    } catch {
      // Revert on error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikedByMe: post.isLikedByMe, likeCount: post.likeCount } : p,
        ),
      );
    }
  }, [api]);

  const handleComment = useCallback((post: DiscoverPostType) => {
    router.push({
      pathname: '/discover/[postId]/index',
      params: { postId: post.id, postJson: JSON.stringify(post) },
    });
  }, [router]);

  const handlePlacePress = useCallback((placeId: string) => {
    router.push({ pathname: '/', params: { focusPlaceId: placeId } });
  }, [router]);

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push({ pathname: '/discover/user/[authorId]', params: { authorId } });
  }, [router]);

  const handleCreate = useCallback(() => {
    router.push('/discover/create');
  }, [router]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    setSearchError(undefined);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await api.searchPosts({ query: { q: text.trim(), limit: 20 } });
        if (res.status === 200) {
          setSearchResults(res.body.items);
        }
      } catch {
        setSearchError(t('feed.searchError'));
      } finally {
        setSearchLoading(false);
      }
    }, 400);
  }, [api]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(undefined);
    setSearchLoading(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const isSearchActive = searchQuery.trim().length > 0;
  const displayedPosts = useMemo(() => {
    const base = isSearchActive ? searchResults : posts;
    let filtered = base;
    if (!isSearchActive && activeTab === 'following' && followedIds.size > 0) {
      filtered = filtered.filter((p) => followedIds.has(p.authorId));
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter((p) => p.type === typeFilter);
    }
    return filtered;
  }, [isSearchActive, searchResults, posts, activeTab, followedIds, typeFilter]);

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('feed.title')}</Text>
      </View>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
          onPress={() => setActiveTab('all')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'all' }}
        >
          <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>
            {t('feed.title')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'following' && styles.tabBtnActive]}
          onPress={() => setActiveTab('following')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'following' }}
        >
          <Text style={[styles.tabBtnText, activeTab === 'following' && styles.tabBtnTextActive]}>
            {t('follow.feedTab')}
          </Text>
        </Pressable>
      </View>
      {/* Post type filter chips */}
      {!isSearchActive ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilterRow} contentContainerStyle={styles.typeFilterContent}>
          {TYPE_FILTER_KEYS.map((type) => (
            <Pressable
              key={type}
              style={[styles.typeChip, typeFilter === type && styles.typeChipActive]}
              onPress={() => setTypeFilter(type)}
              accessibilityRole="button"
              accessibilityState={{ selected: typeFilter === type }}
            >
              <Text style={[styles.typeChipText, typeFilter === type && styles.typeChipTextActive]}>
                {t(`feed.typeFilter.${type}`)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: COLORS.surface, color: COLORS.textPrimary }]}
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholder={t('feed.searchPlaceholder')}
          placeholderTextColor={COLORS.textSecondary}
          returnKeyType="search"
          clearButtonMode="never"
          accessibilityLabel={t('feed.searchPlaceholder')}
        />
        {isSearchActive ? (
          <Pressable
            style={styles.clearSearchBtn}
            onPress={handleClearSearch}
            accessibilityRole="button"
            accessibilityLabel={t('feed.clearSearch')}
          >
            <Text style={[styles.clearSearchText, { color: COLORS.textSecondary }]}>{t('feed.clearSearch')}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={[styles.errorRow, { backgroundColor: COLORS.surface }]}>
          <Text style={[styles.errorText, { color: COLORS.error }]}>{error}</Text>
          {isNetworkError ? (
            <Pressable
              style={styles.retryBtn}
              onPress={() => { void loadFeed(true); }}
              accessibilityRole="button"
            >
              <Text style={styles.retryBtnText}>{t('feed.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        data={displayedPosts}
        keyExtractor={(item) => item.id}
        accessibilityRole="list"
        ListHeaderComponent={
          !isSearchActive && trendingLoaded && trendingPosts.length > 0 ? (
            <TrendingStrip
              posts={trendingPosts}
              onPress={(post) => router.push(href('discoverPost', { postId: post.id }))}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <PostItem
            post={item}
            placeName={item.placeId ? placeNames[item.placeId] : undefined}
            firstImageUrl={item.mediaAssetIds[0] ? mediaUrls[item.mediaAssetIds[0]] : undefined}
            onLike={handleLike}
            onComment={handleComment}
            onPlacePress={handlePlacePress}
            onReport={handleReport}
            onDelete={handleDelete}
            onEdit={handleOpenEdit}
            onAuthorPress={handleAuthorPress}
            onSave={handleSave}
            isSaved={isSaved(item.id)}
            currentUserId={currentUserId}
          />
        )}
        initialNumToRender={5}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          isSearchActive ? (
            searchLoading ? (
              <ActivityIndicator style={styles.loadingMore} size="small" color="#1976D2" />
            ) : searchError ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: COLORS.error }]}>{searchError}</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('feed.searchEmpty', { q: searchQuery })}</Text>
              </View>
            )
          ) : loading ? (
            <SkeletonFeed />
          ) : activeTab === 'following' ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('follow.feedEmpty')}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('feed.empty')}</Text>
              <Pressable style={styles.emptyCreateBtn} onPress={handleCreate}>
                <Text style={styles.emptyCreateBtnText}>{t('post.create')}</Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.loadingMore} size="small" color="#1976D2" /> : null
        }
        contentContainerStyle={styles.listContent}
      />
      <Pressable
        testID={discoverTestIDs.createPostButton}
        style={styles.fab}
        onPress={handleCreate}
        accessibilityRole="button"
        accessibilityLabel={t('post.create')}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <Modal
        visible={editingPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalBox}>
            <Text style={styles.editModalTitle}>{t('post.editTitle')}</Text>
            <TextInput
              style={styles.editModalInput}
              value={editBody}
              onChangeText={setEditBody}
              multiline
              maxLength={1000}
              placeholder={t('post.editPlaceholder')}
              autoFocus
              accessibilityLabel={t('post.editPlaceholder')}
            />
            <View style={styles.editModalActions}>
              <Pressable
                style={styles.editModalCancel}
                onPress={() => setEditingPost(null)}
                accessibilityRole="button"
                accessibilityLabel={t('post.editCancel')}
              >
                <Text style={styles.editModalCancelText}>{t('post.editCancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.editModalSave, editSaving && { opacity: 0.6 }]}
                onPress={() => { void handleSaveEdit(); }}
                disabled={editSaving}
                accessibilityRole="button"
                accessibilityLabel={t('post.editSave')}
              >
                {editSaving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.editModalSaveText}>{t('post.editSave')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: sharedStyles.container,
  header: sharedStyles.header,
  headerTitle: sharedStyles.headerTitle,
  errorRow: { ...sharedStyles.errorRow, flexDirection: 'row', alignItems: 'center', gap: 12 },
  errorText: { ...sharedStyles.errorText, flex: 1 },
  retryBtn: { backgroundColor: COLORS.error, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  retryBtnText: { color: COLORS.surface, fontSize: 13, fontWeight: '600' },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabBtnTextActive: { color: '#FFF' },
  typeFilterRow: { maxHeight: 40 },
  typeFilterContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeChipText: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  typeChipTextActive: { color: '#FFF' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  clearSearchBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clearSearchText: {
    fontSize: 13,
    fontWeight: '500',
  },
  listContent: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreBtn: {
    padding: 2,
  },
  moreBtnText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
  },
  authorText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  timestampText: {
    fontSize: 11,
    color: '#999',
    marginTop: 1,
  },
  typeBadge: { backgroundColor: COLORS.primaryXLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  typeText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  bodyText: {
    fontSize: 15,
    color: '#222',
    lineHeight: 22,
    textAlign: 'auto',
    marginBottom: 10,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
  },
  actionBtnActive: {
    backgroundColor: '#BBDEFB',
  },
  actionBtnText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  actionBtnTextActive: {
    color: '#1565C0',
  },
  placeChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  placeChipText: {
    fontSize: 13,
    color: '#388E3C',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyCreateBtn: {
    backgroundColor: '#1976D2',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingMore: {
    paddingVertical: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    end: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 32,
  },
  editModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  editModalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 420 },
  editModalTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' },
  editModalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  editModalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  editModalCancel: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  editModalCancelText: { fontSize: 14, color: '#555' },
  editModalSave: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#1976D2', minWidth: 70, alignItems: 'center' },
  editModalSaveText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
