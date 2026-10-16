/**
 * Tour3DListScreen – grid of available 3D virtual tour scenes with
 * category filtering, text search, and a geo-based "near you" section.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Tour3DCategory, Tour3DScene } from '@iraq-maps/contracts';
import { useTour3DClient } from '../client';
import { TourCard } from '../components/TourCard';
import { t } from '../strings';

const CATEGORIES: Array<{ key: Tour3DCategory | 'all'; label: () => string }> = [
  { key: 'all', label: () => t('list.filterAll') },
  { key: 'heritage', label: () => t('list.filterHeritage') },
  { key: 'mosque', label: () => t('list.filterMosque') },
  { key: 'market', label: () => t('list.filterMarket') },
  { key: 'park', label: () => t('list.filterPark') },
  { key: 'museum', label: () => t('list.filterMuseum') },
  { key: 'shrine', label: () => t('list.filterShrine') },
  { key: 'bridge', label: () => t('list.filterBridge') },
  { key: 'neighborhood', label: () => t('list.filterNeighborhood') },
  { key: 'other', label: () => t('list.filterOther') },
];

type LoadState = 'idle' | 'loading' | 'loading-more' | 'error';

export function Tour3DListScreen() {
  const router = useRouter();
  const client = useTour3DClient();

  const [scenes, setScenes] = useState<Tour3DScene[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [selectedCategory, setSelectedCategory] = useState<Tour3DCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSearchRef = useRef('');

  const fetchScenes = useCallback(
    async (
      category: Tour3DCategory | 'all',
      cursor?: string,
    ) => {
      const isMore = !!cursor;
      setLoadState(isMore ? 'loading-more' : 'loading');

      try {
        const res = await client.listScenes({
          query: {
            category: category !== 'all' ? category : undefined,
            cursor,
            limit: 20,
          },
        });
        if (res.status !== 200) throw new Error('fetch failed');

        const { items, nextCursor: nc } = res.body;
        setScenes((prev) => (isMore ? [...prev, ...items] : items));
        setNextCursor(nc ?? null);
        setLoadState('idle');
      } catch {
        setLoadState('error');
      }
    },
    [client],
  );

  useEffect(() => {
    void fetchScenes(selectedCategory);
  }, [selectedCategory, fetchScenes]);

  const handleCategoryPress = (cat: Tour3DCategory | 'all') => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    setScenes([]);
    setNextCursor(null);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    activeSearchRef.current = value;
    // Simple client-side filter – real search would call a dedicated endpoint
  };

  const handleLoadMore = () => {
    if (loadState !== 'idle' || !nextCursor) return;
    void fetchScenes(selectedCategory, nextCursor);
  };

  const handleRetry = () => {
    setScenes([]);
    setNextCursor(null);
    void fetchScenes(selectedCategory);
  };

  const handleScenePress = (scene: Tour3DScene) => {
    router.push({ pathname: '/tour3d/[id]', params: { id: scene.id } } as Parameters<typeof router.push>[0]);
  };

  const displayedScenes = search.trim()
    ? scenes.filter((s) => {
        const q = search.trim().toLowerCase();
        return (
          s.nameAr?.toLowerCase().includes(q) ||
          s.nameEn?.toLowerCase().includes(q) ||
          false
        );
      })
    : scenes;

  const isLoading = loadState === 'loading';
  const isLoadingMore = loadState === 'loading-more';
  const isError = loadState === 'error';
  const isEmpty = !isLoading && !isError && displayedScenes.length === 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('list.title')}</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={handleSearchChange}
          placeholder={t('list.searchPlaceholder')}
          placeholderTextColor="#aaa"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={t('list.searchPlaceholder')}
        />
      </View>

      {/* Category filter chips */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {CATEGORIES.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[
                styles.filterChip,
                selectedCategory === key && styles.filterChipActive,
              ]}
              onPress={() => handleCategoryPress(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === key }}
              accessibilityLabel={label()}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedCategory === key && styles.filterChipTextActive,
                ]}
              >
                {label()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* States */}
      {isLoading && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#c9a84c" />
          <Text style={styles.statusText}>{t('list.loading')}</Text>
        </View>
      )}

      {isError && (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{t('list.loadError')}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry} accessibilityRole="button">
            <Text style={styles.retryText}>{t('list.retry')}</Text>
          </Pressable>
        </View>
      )}

      {isEmpty && !isError && (
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>
            {search.trim()
              ? t('list.searchEmpty', { q: search })
              : t('list.empty')}
          </Text>
        </View>
      )}

      {!isLoading && !isError && displayedScenes.length > 0 && (
        <FlatList
          data={displayedScenes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TourCard scene={item} onPress={handleScenePress} />
          )}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.loadMoreIndicator}>
                <ActivityIndicator color="#c9a84c" />
                <Text style={styles.loadMoreText}>{t('list.loadMore')}</Text>
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e8',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0d8cc',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'auto',
    writingDirection: 'rtl',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    fontSize: 16,
    marginEnd: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    writingDirection: 'rtl',
  },
  filterRow: {
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterChipActive: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
  },
  filterChipText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
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
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
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
  loadMoreIndicator: {
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
});
