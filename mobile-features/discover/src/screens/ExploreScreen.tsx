/* eslint-disable i18next/no-literal-string, no-restricted-syntax */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, sharedStyles, SkeletonBlock } from './shared';
import { t } from '../strings';
import { useDiscoverClient } from '../client';
import { PostGrid, type PostGridItem } from '../components/PostGrid';
import { FeaturedSection, type FeaturedPostData } from '../components/FeaturedPost';

// ─── Category filter ──────────────────────────────────────────────────────────

type CategoryKey = 'all' | 'food' | 'transport' | 'tourism' | 'shopping' | 'services' | 'other';

const CATEGORIES: CategoryKey[] = ['all', 'food', 'transport', 'tourism', 'shopping', 'services', 'other'];

interface CategoryFilterProps {
  selected: CategoryKey;
  onSelect: (cat: CategoryKey) => void;
}

function CategoryFilter({ selected, onSelect }: CategoryFilterProps): ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={catStyles.row}
      style={catStyles.container}
    >
      {CATEGORIES.map((cat) => (
        <Pressable
          key={cat}
          style={[catStyles.chip, selected === cat && catStyles.chipActive]}
          onPress={() => onSelect(cat)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === cat }}
          accessibilityLabel={t(`feed.categoryFilter.${cat}` as Parameters<typeof t>[0])}
        >
          <Text style={[catStyles.chipText, selected === cat && catStyles.chipTextActive]}>
            {t(`feed.categoryFilter.${cat}` as Parameters<typeof t>[0])}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const catStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    maxHeight: 52,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
});

// ─── New businesses section ───────────────────────────────────────────────────

interface NewBusiness {
  id: string;
  name: string;
  category: string;
  coverImageUrl?: string;
  description: string;
  joinedDaysAgo: number;
}

function NewBusinessCard({ item, onPress }: { item: NewBusiness; onPress: (id: string) => void }): ReactElement {
  return (
    <Pressable
      style={bizStyles.card}
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={bizStyles.iconBox}>
        <Text style={bizStyles.iconText}>🏪</Text>
      </View>
      <View style={bizStyles.info}>
        <Text style={bizStyles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={bizStyles.category}>{item.category}</Text>
        <Text style={bizStyles.desc} numberOfLines={2}>{item.description}</Text>
      </View>
      <View style={bizStyles.newBadge}>
        <Text style={bizStyles.newBadgeText}>{t('trending.newBadge' as Parameters<typeof t>[0])}</Text>
      </View>
    </Pressable>
  );
}

const bizStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: COLORS.primaryXLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'auto',
  },
  category: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'auto',
  },
  desc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginTop: 3,
    textAlign: 'auto',
  },
  newBadge: {
    backgroundColor: COLORS.successBg,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.success,
  },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }): ReactElement {
  return (
    <View style={sectionStyles.header}>
      <Text style={sectionStyles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button">
          <Text style={sectionStyles.seeAll}>{t('feed.loadMore')}</Text>
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
    paddingBottom: 10,
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

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function ExploreSkeletonLoader(): ReactElement {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <SkeletonBlock width={120} height={12} />
        <SkeletonBlock width={80} height={12} />
        <SkeletonBlock width={100} height={12} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBlock width={160} height={180} />
          <SkeletonBlock width={160} height={120} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBlock width={160} height={120} />
          <SkeletonBlock width={160} height={160} />
        </View>
      </View>
    </View>
  );
}

// ─── ExploreScreen ────────────────────────────────────────────────────────────

const LOAD_LIMIT = 20;

export function ExploreScreen(): ReactElement {
  const router = useRouter();
  const api = useDiscoverClient();

  const [category, setCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [posts, setPosts] = useState<PostGridItem[]>([]);
  const [featuredPosts, setFeaturedPosts] = useState<FeaturedPostData[]>([]);
  const [nearYouPosts, setNearYouPosts] = useState<PostGridItem[]>([]);
  const [newBusinesses, setNewBusinesses] = useState<NewBusiness[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  const loadPosts = useCallback(async (reset = false) => {
    if (reset) {
      setLoading(true);
      cursorRef.current = undefined;
      setPosts([]);
    } else {
      setLoadingMore(true);
    }
    setError(undefined);

    try {
      const cursor = reset ? undefined : cursorRef.current;
      const cat = category === 'all' ? undefined : category;

      const res = await api.listFeed({
        query: {
          cursor,
          limit: LOAD_LIMIT,
          ...(cat ? { category: cat } : {}),
        },
      });

      if (res.status === 200) {
        const items = (res.body.items as PostGridItem[]).map((p) => ({
          ...p,
          imageHeightHint: 120 + Math.floor(Math.random() * 160), // mock varied heights
        }));
        setPosts((prev) => (reset ? items : [...prev, ...items]));
        setHasMore(!!res.body.nextCursor);
        cursorRef.current = res.body.nextCursor ?? undefined;

        if (reset) {
          // First 2 posts become featured
          setFeaturedPosts(
            items.slice(0, 2).map((p) => ({
              ...p,
              isLikedByMe: p.isLikedByMe,
              featuredLabel: t('explore.featured' as Parameters<typeof t>[0]),
            })),
          );
          setNearYouPosts(items.slice(8, 13));
        }
      } else {
        setError(t('feed.loadError'));
      }
    } catch {
      setError(t('feed.networkError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [api, category]);

  useEffect(() => {
    void loadPosts(true);
    // Mock new businesses
    // eslint-disable-next-line no-restricted-syntax
    setNewBusinesses([
      // eslint-disable-next-line no-restricted-syntax
      { id: 'b1', name: 'مطعم البيت العراقي', category: t('feed.categoryFilter.food'), description: 'أشهى المأكولات العراقية التقليدية', joinedDaysAgo: 2 },
      // eslint-disable-next-line no-restricted-syntax
      { id: 'b2', name: 'متجر الأزياء الحديثة', category: t('feed.categoryFilter.shopping'), description: 'أحدث صيحات الموضة العالمية', joinedDaysAgo: 5 },
    ]);
  }, [category, loadPosts]);

  // Search debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim()) {
      void loadPosts(true);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      setError(undefined);
      try {
        const res = await api.searchPosts({ query: { q: text.trim(), limit: LOAD_LIMIT } });
        if (res.status === 200) {
          setPosts(
            (res.body.items as PostGridItem[]).map((p) => ({
              ...p,
              imageHeightHint: 120 + Math.floor(Math.random() * 160),
            })),
          );
          setHasMore(false);
        }
      } catch {
        setError(t('feed.searchError'));
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [api, loadPosts]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchActive(false);
    void loadPosts(true);
    searchRef.current?.blur();
  }, [loadPosts]);

  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingMore) void loadPosts(false);
  }, [hasMore, loadingMore, loadPosts]);

  const handlePostPress = useCallback((postId: string) => {
    router.push({ pathname: '/(tabs)/discover/post', params: { id: postId } });
  }, [router]);

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

  const handleAuthorPress = useCallback((authorId: string) => {
    router.push({ pathname: '/(tabs)/discover/profile', params: { userId: authorId } });
  }, [router]);

  const handleHashtagPress = useCallback((tag: string) => {
    router.push({ pathname: '/(tabs)/discover/hashtag', params: { tag } });
  }, [router]);

  const handleBusinessPress = useCallback((id: string) => {
    router.push({ pathname: '/(tabs)/map', params: { placeId: id } });
  }, [router]);

  // Grid header: featured + near you + new businesses (only first load, no search)
  const renderGridHeader = (): ReactElement => (
    <View>
      {/* Featured section */}
      {featuredPosts.length > 0 && !searchActive ? (
        <View style={styles.featuredSection}>
          <SectionHeader title={t('explore.featured' as Parameters<typeof t>[0])} />
          <FeaturedSection
            items={featuredPosts}
            onPress={handlePostPress}
            onLike={handleLike}
            onAuthorPress={handleAuthorPress}
            onHashtagPress={handleHashtagPress}
          />
        </View>
      ) : null}

      {/* Near you */}
      {nearYouPosts.length > 0 && !searchActive ? (
        <View style={styles.nearYouSection}>
          <SectionHeader title={t('trending.nearYou' as Parameters<typeof t>[0])} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nearYouScroll}>
            {nearYouPosts.map((post) => (
              <Pressable
                key={post.id}
                style={styles.nearCard}
                onPress={() => handlePostPress(post.id)}
                accessibilityRole="button"
                accessibilityLabel={post.body.slice(0, 60)}
              >
                <Text style={styles.nearCardBody} numberOfLines={4}>{post.body}</Text>
                <Text style={styles.nearCardLike}>❤ {post.likeCount}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* New businesses */}
      {newBusinesses.length > 0 && !searchActive ? (
        <View>
          <SectionHeader title={t('explore.newBusinesses' as Parameters<typeof t>[0])} />
          {newBusinesses.map((biz) => (
            <NewBusinessCard key={biz.id} item={biz} onPress={handleBusinessPress} />
          ))}
          <View style={styles.sectionDivider} />
        </View>
      ) : null}

      {/* All posts section title */}
      {!searchActive ? (
        <SectionHeader title={t('explore.allPosts' as Parameters<typeof t>[0])} />
      ) : null}
    </View>
  );

  return (
    <View style={sharedStyles.container}>
      {/* Header */}
      <View style={sharedStyles.header}>
        <Text style={sharedStyles.headerTitle}>{t('explore.title' as Parameters<typeof t>[0])}</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearchChange}
          onFocus={() => setSearchActive(true)}
          placeholder={t('feed.searchPlaceholder')}
          placeholderTextColor={COLORS.textMuted}
          textAlign="right"
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={handleClearSearch}
            accessibilityRole="button"
            accessibilityLabel={t('feed.clearSearch')}
          >
            <Text style={styles.clearSearch}>{t('feed.clearSearch')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Category filter */}
      {!searchActive ? (
        <CategoryFilter selected={category} onSelect={(cat) => {
          setCategory(cat);
          setSearchQuery('');
        }} />
      ) : null}

      {/* Content */}
      {loading && posts.length === 0 ? (
        <ExploreSkeletonLoader />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => loadPosts(true)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>{t('feed.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <PostGrid
          items={posts}
          columns={2}
          onPressPost={handlePostPress}
          onLike={handleLike}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          emptyText={
            searchQuery
              ? t('feed.searchEmpty', { q: searchQuery })
              : t('feed.empty')
          }
          header={renderGridHeader()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 6,
  },
  clearSearch: {
    fontSize: 13,
    color: COLORS.textSecondary,
    paddingHorizontal: 8,
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
  featuredSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  nearYouSection: {
    marginBottom: 4,
  },
  nearYouScroll: {
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 8,
  },
  nearCard: {
    width: 160,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 100,
    justifyContent: 'space-between',
  },
  nearCardBody: {
    fontSize: 12,
    color: COLORS.textPrimary,
    lineHeight: 18,
    textAlign: 'auto',
  },
  nearCardLike: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'auto',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: 16,
    marginTop: 12,
  },
});
