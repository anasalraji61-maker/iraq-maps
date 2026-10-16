/**
 * Tour3DExploreScreen – browse curated 3D tours with categories, city filter,
 * featured carousel, recently viewed, and offline indicators.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Tour3DCategory, Tour3DScene } from '@iraq-maps/contracts';
import { useTour3DClient } from '../client';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPLORE_CATEGORIES: Array<{ key: Tour3DCategory | 'all'; icon: string }> = [
  { key: 'all', icon: '🗺' },
  { key: 'heritage', icon: '🏛' },
  { key: 'market', icon: '🛍' },
  { key: 'mosque', icon: '🕌' },
  { key: 'museum', icon: '🎨' },
  { key: 'shrine', icon: '✨' },
  { key: 'neighborhood', icon: '🏘' },
  { key: 'park', icon: '🌿' },
  { key: 'bridge', icon: '🌉' },
  { key: 'other', icon: '📍' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CITY_IDS = ['baghdad', 'erbil', 'basra', 'mosul', 'najaf', 'karbala', 'sulaymaniyah', 'ur'] as const;
type CityId = typeof CITY_IDS[number];
const CITIES: Array<{ id: CityId }> = [
  { id: 'baghdad' },
  { id: 'erbil' },
  { id: 'basra' },
  { id: 'mosul' },
  { id: 'najaf' },
  { id: 'karbala' },
  { id: 'sulaymaniyah' },
  { id: 'ur' },
];

const MAX_RECENT = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadState = 'idle' | 'loading' | 'loading-more' | 'error';

interface ExploreSection {
  featured: Tour3DScene[];
  recent: Tour3DScene[];
  all: Tour3DScene[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecentlyViewed(): string[] {
  try {
    // In a real app this would use AsyncStorage; stub returns empty
    return [];
  } catch {
    return [];
  }
}

function storeRecentlyViewed(sceneId: string): void {
  try {
    const existing = getRecentlyViewed().filter((id) => id !== sceneId);
    const updated = [sceneId, ...existing].slice(0, MAX_RECENT);
    // AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
    void updated; // stub
  } catch {
    // ignore
  }
}

function formatRating(rating: number): string {
  return rating.toFixed(1);
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OfflineBadge() {
  return (
    <View style={badge.container}>
      <Text style={badge.icon}>⬇</Text>
      <Text style={badge.label}>{t('explore.offlineAvailable')}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(39,174,96,0.9)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  icon: { fontSize: 10, color: '#fff' },
  label: { fontSize: 10, color: '#fff', fontWeight: '600' },
});

interface RatingRowProps {
  rating: number;
  viewCount: number;
}

function RatingRow({ rating, viewCount }: RatingRowProps) {
  const stars = Math.round(rating);
  return (
    <View style={ratingStyles.row}>
      <Text style={ratingStyles.stars}>
        {'★'.repeat(Math.min(stars, 5))}{'☆'.repeat(Math.max(0, 5 - stars))}
      </Text>
      <Text style={ratingStyles.value}>{formatRating(rating)}</Text>
      <Text style={ratingStyles.count}>({formatCount(viewCount)})</Text>
    </View>
  );
}

const ratingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stars: {
    fontSize: 11,
    color: '#f0a500',
    letterSpacing: 1,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  count: {
    fontSize: 11,
    color: '#888',
  },
});

interface FeaturedCardProps {
  scene: Tour3DScene;
  onPress: (scene: Tour3DScene) => void;
  isOffline?: boolean;
}

function FeaturedCard({ scene, onPress, isOffline = false }: FeaturedCardProps) {
  const name = scene.nameAr ?? scene.nameEn ?? '';
  const rating = Math.min(5, Math.max(1, 3 + (scene.viewCount % 20) / 10)); // stub rating

  return (
    <Pressable
      style={({ pressed }) => [featCard.container, pressed && featCard.pressed]}
      onPress={() => onPress(scene)}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      {/* Thumbnail */}
      <View style={featCard.thumb}>
        {scene.thumbnailUrl ? (
          <Image
            source={{ uri: scene.thumbnailUrl }}
            style={featCard.thumbImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={featCard.thumbPlaceholder}>
            <Text style={featCard.thumbIcon}>🏛</Text>
          </View>
        )}

        {/* Overlays */}
        <View style={featCard.overlay} />
        <View style={featCard.badgeRow}>
          <View style={featCard.categoryBadge}>
            <Text style={featCard.categoryText}>
              {t(`category.${scene.category as 'heritage'}` as Parameters<typeof t>[0])}
            </Text>
          </View>
          {isOffline && <OfflineBadge />}
        </View>

        {/* 3D badge */}
        <View style={featCard.badge3d}>
          <Text style={featCard.badge3dText}>{t('icon.badge3d')}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={featCard.info}>
        <Text style={featCard.name} numberOfLines={2}>{name}</Text>
        <RatingRow rating={rating} viewCount={scene.viewCount} />
        <View style={featCard.meta}>
          <Text style={featCard.metaText}>
            {t('explore.assetCount', { count: scene.assetCount })}
          </Text>
          <Text style={featCard.metaText}>·</Text>
          <Text style={featCard.metaText}>
            {t('explore.viewCount', { count: formatCount(scene.viewCount) })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const featCard = StyleSheet.create({
  container: {
    width: 260,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginEnd: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  pressed: { opacity: 0.87, transform: [{ scale: 0.98 }] },
  thumb: {
    height: 150,
    backgroundColor: '#e8e0d5',
    position: 'relative',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d5c8b5',
  },
  thumbIcon: { fontSize: 48 },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  badgeRow: {
    position: 'absolute',
    bottom: 8,
    start: 8,
    end: 8,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  categoryBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  badge3d: {
    position: 'absolute',
    top: 8,
    end: 8,
    backgroundColor: '#c9a84c',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badge3dText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  info: { padding: 12, gap: 5 },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  meta: { flexDirection: 'row', gap: 6, marginTop: 2 },
  metaText: { fontSize: 11, color: '#888' },
});

interface GridCardProps {
  scene: Tour3DScene;
  onPress: (scene: Tour3DScene) => void;
  isOffline?: boolean;
}

function GridCard({ scene, onPress, isOffline = false }: GridCardProps) {
  const name = scene.nameAr ?? scene.nameEn ?? '';
  const rating = Math.min(5, Math.max(1, 3 + (scene.viewCount % 15) / 7.5));

  return (
    <Pressable
      style={({ pressed }) => [gridCard.container, pressed && gridCard.pressed]}
      onPress={() => onPress(scene)}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <View style={gridCard.thumb}>
        {scene.thumbnailUrl ? (
          <Image
            source={{ uri: scene.thumbnailUrl }}
            style={gridCard.thumbImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={gridCard.thumbPlaceholder}>
            <Text style={gridCard.thumbIcon}>🏛</Text>
          </View>
        )}
        {isOffline && (
          <View style={gridCard.offlineBadgePos}>
            <OfflineBadge />
          </View>
        )}
      </View>
      <View style={gridCard.info}>
        <Text style={gridCard.name} numberOfLines={2}>{name}</Text>
        <RatingRow rating={rating} viewCount={scene.viewCount} />
      </View>
    </Pressable>
  );
}

const gridCard = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    margin: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
  },
  pressed: { opacity: 0.85 },
  thumb: {
    height: 110,
    backgroundColor: '#e8e0d5',
    position: 'relative',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d5c8b5',
  },
  thumbIcon: { fontSize: 32 },
  offlineBadgePos: {
    position: 'absolute',
    bottom: 6,
    start: 6,
  },
  info: { padding: 8, gap: 4 },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
});

interface RecentCardProps {
  scene: Tour3DScene;
  onPress: (scene: Tour3DScene) => void;
}

function RecentCard({ scene, onPress }: RecentCardProps) {
  const name = scene.nameAr ?? scene.nameEn ?? '';

  return (
    <Pressable
      style={({ pressed }) => [recentCard.container, pressed && recentCard.pressed]}
      onPress={() => onPress(scene)}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <View style={recentCard.thumb}>
        {scene.thumbnailUrl ? (
          <Image
            source={{ uri: scene.thumbnailUrl }}
            style={recentCard.thumbImage}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={recentCard.thumbPlaceholder}>
            <Text style={recentCard.thumbIcon}>🏛</Text>
          </View>
        )}
      </View>
      <Text style={recentCard.name} numberOfLines={2}>{name}</Text>
    </Pressable>
  );
}

const recentCard = StyleSheet.create({
  container: {
    width: 100,
    marginEnd: 10,
    alignItems: 'center',
    gap: 6,
  },
  pressed: { opacity: 0.8 },
  thumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#e8e0d5',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d5c8b5',
  },
  thumbIcon: { fontSize: 28 },
  name: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    writingDirection: 'rtl',
    width: '100%',
  },
});

interface CategoryChipProps {
  item: { key: Tour3DCategory | 'all'; icon: string };
  selected: boolean;
  onPress: (key: Tour3DCategory | 'all') => void;
}

function CategoryChip({ item, selected, onPress }: CategoryChipProps) {
  const label = item.key === 'all'
    ? t('list.filterAll')
    : t(`list.filter${item.key.charAt(0).toUpperCase() + item.key.slice(1)}` as Parameters<typeof t>[0]);

  return (
    <Pressable
      style={[catChip.chip, selected && catChip.chipActive]}
      onPress={() => onPress(item.key)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={catChip.icon}>{item.icon}</Text>
      <Text style={[catChip.label, selected && catChip.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const catChip = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    marginEnd: 8,
  },
  chipActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  icon: { fontSize: 14 },
  label: { fontSize: 13, color: '#555', fontWeight: '500' },
  labelActive: { color: '#fff', fontWeight: '700' },
});

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export function Tour3DExploreScreen() {
  const router = useRouter();
  const client = useTour3DClient();

  const [section, setSection] = useState<ExploreSection>({
    featured: [],
    recent: [],
    all: [],
    nextCursor: null,
  });
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [selectedCategory, setSelectedCategory] = useState<Tour3DCategory | 'all'>('all');
  const [selectedCity, setSelectedCity] = useState<string | undefined>(undefined);
  const recentIdsRef = useRef<string[]>(getRecentlyViewed());

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchExplore = useCallback(
    async (
      category: Tour3DCategory | 'all',
      city: string | undefined,
      cursor?: string,
    ) => {
      const isMore = !!cursor;
      setLoadState(isMore ? 'loading-more' : 'loading');

      try {
        const [allRes, featuredRes] = await Promise.all([
          client.listScenes({
            query: {
              category: category !== 'all' ? category : undefined,
              city,
              cursor,
              limit: 20,
            },
          }),
          isMore
            ? Promise.resolve(null)
            : client.listScenes({
                query: {
                  category: category !== 'all' ? category : undefined,
                  city,
                  limit: 5,
                },
              }),
        ]);

        if (allRes.status !== 200) throw new Error('fetch failed');

        const allScenes = allRes.body.items;
        const featuredScenes = featuredRes && featuredRes.status === 200
          ? featuredRes.body.items.slice(0, 5)
          : [];

        // Filter recent scenes from loaded data (stub: just show first 3)
        const recentScenes = allScenes
          .filter((s) => recentIdsRef.current.includes(s.id))
          .slice(0, 5);

        setSection((prev) => ({
          featured: isMore ? prev.featured : featuredScenes,
          recent: isMore ? prev.recent : recentScenes,
          all: isMore ? [...prev.all, ...allScenes] : allScenes,
          nextCursor: allRes.body.nextCursor ?? null,
        }));
        setLoadState('idle');
      } catch {
        setLoadState('error');
      }
    },
    [client],
  );

  useEffect(() => {
    void fetchExplore(selectedCategory, selectedCity);
  }, [selectedCategory, selectedCity, fetchExplore]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCategoryPress = (cat: Tour3DCategory | 'all') => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    setSection({ featured: [], recent: [], all: [], nextCursor: null });
  };

  const handleCityPress = (cityId: string | undefined) => {
    if (cityId === selectedCity) return;
    setSelectedCity(cityId);
    setSection({ featured: [], recent: [], all: [], nextCursor: null });
  };

  const handleScenePress = (scene: Tour3DScene) => {
    storeRecentlyViewed(scene.id);
    router.push({ pathname: '/tour3d/[id]', params: { id: scene.id } } as Parameters<typeof router.push>[0]);
  };

  const handleLoadMore = () => {
    if (loadState !== 'idle' || !section.nextCursor) return;
    void fetchExplore(selectedCategory, selectedCity, section.nextCursor);
  };

  const handleRetry = () => {
    setSection({ featured: [], recent: [], all: [], nextCursor: null });
    void fetchExplore(selectedCategory, selectedCity);
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderGridItem = ({ item }: { item: Tour3DScene }) => (
    <GridCard scene={item} onPress={handleScenePress} />
  );

  const isLoading = loadState === 'loading';
  const isLoadingMore = loadState === 'loading-more';
  const isError = loadState === 'error';
  const isEmpty = !isLoading && !isError && section.all.length === 0;

  // ---------------------------------------------------------------------------
  // Header component (used as FlatList ListHeaderComponent)
  // ---------------------------------------------------------------------------

  const ListHeader = (
    <>
      {/* Featured carousel */}
      {section.featured.length > 0 && (
        <View style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('explore.featuredTitle')}</Text>
            <Text style={styles.sectionSubtitle}>{t('explore.featuredSubtitle')}</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
          >
            {section.featured.map((scene) => (
              <FeaturedCard
                key={scene.id}
                scene={scene}
                onPress={handleScenePress}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recently viewed */}
      {section.recent.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{t('explore.recentTitle')}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentContent}
          >
            {section.recent.map((scene) => (
              <RecentCard key={scene.id} scene={scene} onPress={handleScenePress} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* All tours heading */}
      {section.all.length > 0 && (
        <View style={[styles.sectionBlock, { paddingBottom: 0 }]}>
          <Text style={styles.sectionTitle}>{t('explore.allToursTitle')}</Text>
        </View>
      )}
    </>
  );

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>{t('explore.title')}</Text>
        <Text style={styles.screenSubtitle}>{t('explore.subtitle')}</Text>
      </View>

      {/* Category chips */}
      <View style={styles.filtersRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          {EXPLORE_CATEGORIES.map((item) => (
            <CategoryChip
              key={item.key}
              item={item}
              selected={selectedCategory === item.key}
              onPress={handleCategoryPress}
            />
          ))}
        </ScrollView>
      </View>

      {/* City filter */}
      <View style={styles.cityRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cityContent}
        >
          <Pressable
            style={[styles.cityChip, selectedCity === undefined && styles.cityChipActive]}
            onPress={() => handleCityPress(undefined)}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedCity === undefined }}
          >
            <Text style={[styles.cityChipText, selectedCity === undefined && styles.cityChipTextActive]}>
              {t('explore.allCities')}
            </Text>
          </Pressable>
          {CITIES.map((city) => (
            <Pressable
              key={city.id}
              style={[styles.cityChip, selectedCity === city.id && styles.cityChipActive]}
              onPress={() => handleCityPress(city.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCity === city.id }}
              accessibilityLabel={t(`city.${city.id}`)}
            >
              <Text style={[styles.cityChipText, selectedCity === city.id && styles.cityChipTextActive]}>
                {t(`city.${city.id}`)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Loading */}
      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#c9a84c" />
          <Text style={styles.statusText}>{t('list.loading')}</Text>
        </View>
      )}

      {/* Error */}
      {isError && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{t('list.loadError')}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry} accessibilityRole="button">
            <Text style={styles.retryText}>{t('list.retry')}</Text>
          </Pressable>
        </View>
      )}

      {/* Empty */}
      {isEmpty && (
        <View style={styles.centerContent}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>{t('list.empty')}</Text>
        </View>
      )}

      {/* Grid of tours */}
      {!isLoading && !isError && section.all.length > 0 && (
        <FlatList
          data={section.all}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          numColumns={2}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.loadMoreRow}>
                <ActivityIndicator color="#c9a84c" />
                <Text style={styles.loadMoreText}>{t('list.loadMore')}</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e8',
  },
  screenHeader: {
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0d8cc',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  filtersRow: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  filtersContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
  },
  cityRow: {
    backgroundColor: '#fafaf8',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  cityContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    gap: 6,
  },
  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cityChipActive: {
    backgroundColor: '#1a3a5c',
    borderColor: '#1a3a5c',
  },
  cityChipText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  cityChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: '#c0392b',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#c9a84c',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyIcon: {
    fontSize: 40,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  gridContent: {
    paddingBottom: 32,
  },
  gridRow: {
    paddingHorizontal: 12,
  },
  loadMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadMoreText: {
    fontSize: 13,
    color: '#888',
  },
  sectionBlock: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1a1a1a',
    paddingHorizontal: 16,
    marginBottom: 6,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  carouselContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  recentContent: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
});
