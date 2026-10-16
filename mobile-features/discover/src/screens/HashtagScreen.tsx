/**
 * HashtagScreen — full hashtag exploration page.
 * Shows top posts, recent posts, related hashtags, and a grid/list toggle.
 */
import { type DiscoverPostType } from '@iraq-maps/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDiscoverClient } from '../client';
import { t } from '../strings';
import {
  COLORS,
  formatCount,
  formatRelativeTime,
  getTypeBadgeColors,
  HashtagText,
  sharedStyles,
  SkeletonBlock,
} from './shared';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list';
type PostTab = 'top' | 'recent';

const POST_TABS: PostTab[] = ['top', 'recent'];

interface RelatedHashtag {
  hashtag: string;
  count: number;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PostSkeletonCard(): ReactElement {
  return (
    <View style={listStyles.card}>
      <View style={listStyles.cardHeader}>
        <SkeletonBlock width={80} height={10} />
        <SkeletonBlock width={40} height={14} />
      </View>
      <SkeletonBlock width={240} height={12} />
      <SkeletonBlock width={180} height={12} />
      <SkeletonBlock width={120} height={10} />
    </View>
  );
}

function GridSkeletonItem(): ReactElement {
  return (
    <View style={[gridStyles.item, { backgroundColor: COLORS.border }]} />
  );
}

// ─── Grid item ────────────────────────────────────────────────────────────────

function GridPostItem({
  post,
  onPress,
}: {
  post: DiscoverPostType;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      style={gridStyles.item}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={post.body.slice(0, 60)}
    >
      <View style={gridStyles.itemBg}>
        <Text style={gridStyles.itemText} numberOfLines={4}>{post.body}</Text>
      </View>
      <View style={gridStyles.statsRow}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={gridStyles.stat}>❤ {formatCount(post.likeCount)}</Text>
      </View>
    </Pressable>
  );
}

const gridStyles = StyleSheet.create({
  item: {
    flex: 1,
    margin: 1,
    aspectRatio: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 4,
    overflow: 'hidden',
    maxWidth: '33.33%',
  },
  itemBg: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 6,
  },
  itemText: {
    fontSize: 11,
    color: COLORS.textPrimary,
    lineHeight: 15,
  },
  statsRow: {
    padding: 4,
    backgroundColor: COLORS.surface,
  },
  stat: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
});

// ─── List item ────────────────────────────────────────────────────────────────

function ListPostItem({
  post,
  onPress,
  onHashtagPress,
}: {
  post: DiscoverPostType;
  onPress: () => void;
  onHashtagPress: (tag: string) => void;
}): ReactElement {
  const badgeColors = getTypeBadgeColors(post.type);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={listStyles.card}
    >
      <View style={listStyles.cardHeader}>
        <Text style={listStyles.postMeta}>
          {post.authorId.slice(0, 8)} · {formatRelativeTime(post.createdAt, t)}
        </Text>
        <View style={[listStyles.typeBadge, { backgroundColor: badgeColors.bg }]}>
          <Text style={[listStyles.typeBadgeText, { color: badgeColors.text }]}>
            {t(`post.type.${post.type}` as Parameters<typeof t>[0])}
          </Text>
        </View>
      </View>
      <HashtagText text={post.body} style={listStyles.postBody} onHashtagPress={onHashtagPress} />
      <View style={listStyles.stats}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={listStyles.statText}>❤ {formatCount(post.likeCount)}</Text>
        <Text style={listStyles.statDot}>{' · '}</Text>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={listStyles.statText}>💬 {formatCount(post.commentCount)}</Text>
      </View>
    </Pressable>
  );
}

const listStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  postMeta: { fontSize: 11, color: COLORS.textMuted },
  typeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  postBody: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
  stats: { flexDirection: 'row', alignItems: 'center' },
  statText: { fontSize: 12, color: COLORS.textMuted },
  statDot: { fontSize: 12, color: COLORS.textMuted },
});

// ─── Related hashtags ─────────────────────────────────────────────────────────

function RelatedHashtagsSection({
  items,
  onPress,
}: {
  items: RelatedHashtag[];
  onPress: (tag: string) => void;
}): ReactElement {
  if (items.length === 0) return <View />;
  return (
    <View style={relatedStyles.container}>
      <Text style={relatedStyles.title}>{t('hashtag.related' as Parameters<typeof t>[0])}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={relatedStyles.scroll}>
        {items.map((h) => (
          <Pressable
            key={h.hashtag}
            style={relatedStyles.chip}
            onPress={() => onPress(h.hashtag)}
            accessibilityRole="button"
            accessibilityLabel={`#${h.hashtag}`}
          >
            <Text style={relatedStyles.chipTag}>#{h.hashtag}</Text>
            <Text style={relatedStyles.chipCount}>{formatCount(h.count)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const relatedStyles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
    textAlign: 'auto',
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  chipTag: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  chipCount: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 1,
  },
});

// ─── Follow hashtag button ────────────────────────────────────────────────────

function FollowHashtagButton({
  hashtag: _hashtag,
  following,
  onToggle,
}: {
  hashtag: string;
  following: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <Pressable
      style={[followStyles.btn, following && followStyles.btnFollowing]}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={following
        ? t('hashtag.unfollow' as Parameters<typeof t>[0])
        : t('hashtag.follow' as Parameters<typeof t>[0])}
      accessibilityState={{ selected: following }}
    >
      <Text style={[followStyles.btnText, following && followStyles.btnTextFollowing]}>
        {following
          ? t('hashtag.following' as Parameters<typeof t>[0])
          : t('hashtag.follow' as Parameters<typeof t>[0])}
      </Text>
    </Pressable>
  );
}

const followStyles = StyleSheet.create({
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  btnFollowing: {
    backgroundColor: COLORS.primary,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  btnTextFollowing: {
    color: '#FFF',
  },
});

// ─── HashtagScreen ────────────────────────────────────────────────────────────

export function HashtagScreen(): ReactElement {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const hashtag = tag ?? '';
  const api = useDiscoverClient();
  const router = useRouter();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [activeTab, setActiveTab] = useState<PostTab>('top');
  const [following, setFollowing] = useState(false);

  const [posts, setPosts] = useState<DiscoverPostType[]>([]);
  const [topPosts, setTopPosts] = useState<DiscoverPostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [relatedHashtags, setRelatedHashtags] = useState<RelatedHashtag[]>([]);
  const [postCount, setPostCount] = useState(0);

  const cursor = useRef<string | undefined>(undefined);

  const load = useCallback(async (reset: boolean) => {
    if (reset) {
      setLoading(true);
      setError(null);
      cursor.current = undefined;
    } else {
      setLoadingMore(true);
    }
    try {
      const query = `#${hashtag}`;
      const res = await api.searchPosts({ query: { q: query, cursor: cursor.current, limit: 20 } });
      if (res.status === 200) {
        const { items, nextCursor: nc } = res.body;
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        if (reset) {
          // "top" = sort by likes descending
          const sorted = [...items].sort((a, b) => b.likeCount - a.likeCount);
          setTopPosts(sorted.slice(0, 9));
          setPostCount(items.length);
          // derive related hashtags from post bodies
          const tagFreq = new Map<string, number>();
          for (const post of items) {
            const matches = post.body.match(/#[\p{L}\p{N}_]+/gu) ?? [];
            for (const m of matches) {
              const lower = m.toLowerCase().replace(/^#/, '');
              if (lower !== hashtag.toLowerCase()) {
                tagFreq.set(lower, (tagFreq.get(lower) ?? 0) + 1);
              }
            }
          }
          const related = [...tagFreq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([h, count]) => ({ hashtag: h, count }));
          setRelatedHashtags(related);
        }
        cursor.current = nc;
        setNextCursor(nc);
      } else {
        setError(t('feed.loadError'));
      }
    } catch {
      setError(t('feed.networkError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [api, hashtag]);

  useEffect(() => { void load(true); }, [load]);

  const handleEndReached = useCallback(() => {
    if (!loadingMore && nextCursor) void load(false);
  }, [load, loadingMore, nextCursor]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const handleHashtagPress = useCallback((pressedTag: string) => {
    const bare = pressedTag.replace(/^#/, '');
    router.push({ pathname: '/(tabs)/discover/hashtag', params: { tag: bare } });
  }, [router]);

  const handleToggleFollow = useCallback(() => {
    setFollowing((f) => !f);
  }, []);

  const displayedPosts = activeTab === 'top' ? topPosts : posts;

  const renderListItem = useCallback(({ item }: { item: DiscoverPostType }) => (
    <ListPostItem
      post={item}
      onPress={() => router.push({ pathname: '/(tabs)/discover/post', params: { id: item.id } })}
      onHashtagPress={handleHashtagPress}
    />
  ), [router, handleHashtagPress]);

  const renderGridItem = useCallback(({ item }: { item: DiscoverPostType }) => (
    <GridPostItem
      post={item}
      onPress={() => router.push({ pathname: '/(tabs)/discover/post', params: { id: item.id } })}
    />
  ), [router]);

  return (
    <View style={sharedStyles.container}>
      {/* Header */}
      <View style={sharedStyles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={styles.backBtn}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <Text style={styles.backText}>{'‹'}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={sharedStyles.headerTitle}>#{hashtag}</Text>
          {postCount > 0 ? (
            <Text style={styles.postCountText}>
              {t('hashtag.postCount', { n: String(postCount) })}
            </Text>
          ) : null}
        </View>
        <FollowHashtagButton hashtag={hashtag} following={following} onToggle={handleToggleFollow} />
      </View>

      {/* Related hashtags */}
      {!loading && relatedHashtags.length > 0 ? (
        <RelatedHashtagsSection items={relatedHashtags} onPress={handleHashtagPress} />
      ) : null}

      {/* Tab bar + view toggle */}
      <View style={styles.toolbar}>
        <View style={styles.tabs}>
          {(POST_TABS).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {t(`hashtag.tab.${tab}` as Parameters<typeof t>[0])}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => setViewMode('list')}
            accessibilityRole="button"
            accessibilityLabel={t('hashtag.viewList' as Parameters<typeof t>[0])}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.toggleIcon}>☰</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'grid' && styles.toggleBtnActive]}
            onPress={() => setViewMode('grid')}
            accessibilityRole="button"
            accessibilityLabel={t('hashtag.viewGrid' as Parameters<typeof t>[0])}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <Text style={styles.toggleIcon}>⊞</Text>
          </Pressable>
        </View>
      </View>

      {loading && !refreshing ? (
        <ScrollView contentContainerStyle={sharedStyles.listContent}>
          {Array.from({ length: 5 }, (_, i) =>
            viewMode === 'list' ? <PostSkeletonCard key={i} /> : <GridSkeletonItem key={i} />,
          )}
        </ScrollView>
      ) : error ? (
        <View style={sharedStyles.emptyContainer}>
          <Text style={[sharedStyles.emptyText, { color: COLORS.error }]}>{error}</Text>
          <Pressable onPress={() => void load(true)} accessibilityRole="button" style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('feed.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={displayedPosts}
          keyExtractor={(p) => p.id}
          numColumns={viewMode === 'grid' ? 3 : 1}
          contentContainerStyle={viewMode === 'list' ? sharedStyles.listContent : styles.gridContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          renderItem={viewMode === 'list' ? renderListItem : renderGridItem}
          ListEmptyComponent={
            <View style={sharedStyles.emptyContainer}>
              <Text style={sharedStyles.emptyText}>
                {t('hashtag.empty', { tag: `#${hashtag}` })}
              </Text>
            </View>
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              viewMode === 'list' ? <PostSkeletonCard /> : null
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: 'absolute',
    start: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 8,
    zIndex: 1,
  },
  backText: { color: '#FFF', fontSize: 28, lineHeight: 32 },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 48,
  },
  postCountText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingEnd: 12,
  },
  tabs: {
    flexDirection: 'row',
    flex: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 11,
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
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
  },
  toggleIcon: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  gridContent: {
    padding: 1,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryText: { color: '#FFF', fontWeight: '600' },
});
