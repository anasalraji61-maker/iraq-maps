/**
 * PhotoGalleryScreen – place photo gallery with grid/list views, full-screen
 * viewer, upload FAB, sort/filter controls, and community vs official badges.
 *
 * Route: place/[placeId]/photos
 */

import { useApi, useApiBaseUrl, uploadAsset, PhotoGallery, type GalleryPhoto, pickSingleImage } from '@iraq-maps/mobile-kit';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Types ────────────────────────────────────────────────────────────────────

type SortMode    = 'newest' | 'oldest' | 'popular';
type FilterMode  = 'all' | 'interior' | 'exterior' | 'food' | 'atmosphere';
type DisplayMode = 'grid' | 'list';

interface PlacePhoto {
  assetId: string;
  url: string;
  thumbUrl?: string;
  blurhash?: string;
  caption?: string;
  category?: FilterMode;
  isOfficial: boolean;
  viewCount?: number;
  addedAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';

const FILTER_LABELS: Record<string, string> = {
  interior:   'الداخل',
  exterior:   'الخارج',
  food:       'الطعام',
  atmosphere: 'الأجواء',
};
const COLS    = 3;
const THUMB_SIZE = 110;

// ─── Sort & filter helpers ────────────────────────────────────────────────────

function applySort(photos: PlacePhoto[], sort: SortMode): PlacePhoto[] {
  const copy = [...photos];
  if (sort === 'newest') {
    copy.sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));
  } else if (sort === 'oldest') {
    copy.sort((a, b) => (a.addedAt ?? '').localeCompare(b.addedAt ?? ''));
  } else {
    copy.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  }
  return copy;
}

function applyFilter(photos: PlacePhoto[], filter: FilterMode): PlacePhoto[] {
  if (filter === 'all') return photos;
  return photos.filter((p) => p.category === filter);
}

// ─── PhotoGalleryScreen ───────────────────────────────────────────────────────

export function PhotoGalleryScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const api = useApi();
  const apiBaseUrl = useApiBaseUrl();
  const [allPhotos, setAllPhotos]         = useState<PlacePhoto[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [sort, setSort]                   = useState<SortMode>('newest');
  const [filter, setFilter]               = useState<FilterMode>('all');
  const [display, setDisplay]             = useState<DisplayMode>('grid');
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!placeId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      // Fetch place photos from the places endpoint.
      const res = await fetch(`${apiBaseUrl}/v1/places/${placeId}/photos`);
      if (res.ok) {
        const body = (await res.json()) as { photos?: {
          assetId: string;
          url?: string;
          thumbUrl?: string;
          blurhash?: string;
          caption?: string;
          category?: string;
          isOfficial?: boolean;
          viewCount?: number;
          addedAt?: string;
        }[] };
        const photos = (body.photos ?? []).map((p) => ({
          assetId: p.assetId,
          url: p.url ?? `${apiBaseUrl}/v1/media/${p.assetId}/url`,
          thumbUrl: p.thumbUrl ?? `${apiBaseUrl}/v1/media/${p.assetId}/url?size=thumb`,
          blurhash: p.blurhash,
          caption: p.caption,
          category: (p.category as FilterMode | undefined) ?? 'all',
          isOfficial: p.isOfficial ?? false,
          viewCount: p.viewCount ?? 0,
          addedAt: p.addedAt,
        }));
        setAllPhotos(photos);
      } else {
        setError(t('photoGallery.error'));
      }
    } catch {
      setError(t('photoGallery.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [placeId, api, apiBaseUrl]);

  useEffect(() => { void load(); }, [load]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  // ── Derived list ────────────────────────────────────────────────────────────

  const displayed = useMemo(
    () => applySort(applyFilter(allPhotos, filter), sort),
    [allPhotos, filter, sort],
  );

  const galleryPhotos: GalleryPhoto[] = useMemo(
    () => displayed.map((p) => ({
      id: p.assetId,
      url: p.url,
      thumbUrl: p.thumbUrl,
      blurhash: p.blurhash,
      caption: p.caption,
    })),
    [displayed],
  );

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleAddPhoto = useCallback(async () => {
    try {
      const picked = await pickSingleImage('gallery');
      if (!picked) return;

      setUploading(true);

      const assetId = await uploadAsset(api, apiBaseUrl, {
        uri: picked.uri,
        purpose: 'provider_photo',
      });

      if (assetId) {
        Alert.alert(t('photoGallery.uploadSuccess'));
        void load(true);
      } else {
        Alert.alert(t('photoGallery.uploadFailed'));
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'file_too_large') {
        Alert.alert(t('photoGallery.uploadTooLarge'));
      } else if (code === 'gallery_denied' || code === 'gallery_denied_permanent') {
        Alert.alert(t('photoGallery.uploadPermissionDenied'));
      } else {
        Alert.alert(t('photoGallery.uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  }, [api, apiBaseUrl, load]);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderGridItem = useCallback(({ item, index: idx }: { item: PlacePhoto; index: number }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => setLightboxIndex(idx)}
      activeOpacity={0.85}
      accessibilityRole="imagebutton"
      accessibilityLabel={item.caption ?? `${t('photoGallery.photo')} ${idx + 1}`}
    >
      {item.thumbUrl ? (
        <Image source={{ uri: item.thumbUrl }} style={styles.gridThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.gridThumb, styles.placeholderBg]} />
      )}
      {item.isOfficial && (
        <View style={styles.officialBadge}>
          <Text style={styles.badgeText}>{t('photoGallery.official')}</Text>
        </View>
      )}
    </TouchableOpacity>
  ), []);

  const renderListItem = useCallback(({ item, index: idx }: { item: PlacePhoto; index: number }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => setLightboxIndex(idx)}
      activeOpacity={0.85}
      accessibilityRole="imagebutton"
      accessibilityLabel={item.caption ?? `${t('photoGallery.photo')} ${idx + 1}`}
    >
      <Image
        source={{ uri: item.thumbUrl ?? item.url }}
        style={styles.listThumb}
        resizeMode="cover"
      />
      <View style={styles.listMeta}>
        {item.caption ? (
          <Text style={styles.listCaption} numberOfLines={2}>{item.caption}</Text>
        ) : null}
        <View style={styles.listBadgeRow}>
          {item.isOfficial && (
            <View style={[styles.officialBadge, { position: 'relative', marginEnd: 6 }]}>
              <Text style={styles.badgeText}>{t('photoGallery.official')}</Text>
            </View>
          )}
          {!item.isOfficial && (
            <View style={[styles.communityBadge, { position: 'relative', marginEnd: 6 }]}>
              <Text style={styles.badgeText}>{t('photoGallery.community')}</Text>
            </View>
          )}
          {item.category && item.category !== 'all' && (
            <Text style={styles.categoryLabel}>
              {FILTER_LABELS[item.category] ?? item.category}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  ), []);

  // ── Controls ─────────────────────────────────────────────────────────────────

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: 'newest',  label: t('photoGallery.sortNewest')  },
    { key: 'oldest',  label: t('photoGallery.sortOldest')  },
    { key: 'popular', label: t('photoGallery.sortPopular') },
  ];

  const filterOptions: { key: FilterMode; label: string }[] = [
    { key: 'all',        label: t('photoGallery.filterAll')        },
    { key: 'interior',   label: t('photoGallery.filterInterior')   },
    { key: 'exterior',   label: t('photoGallery.filterExterior')   },
    { key: 'food',       label: t('photoGallery.filterFood')       },
    { key: 'atmosphere', label: t('photoGallery.filterAtmosphere') },
  ];

  const header = (
    <View>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('photoGallery.title')}</Text>
        <Text style={styles.countBadge}>
          {t('photoGallery.photoCount', { count: allPhotos.length })}
        </Text>
        <View style={styles.displayToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, display === 'grid' && styles.toggleActive]}
            onPress={() => setDisplay('grid')}
            accessibilityRole="button"
            accessibilityLabel={t('photoGallery.grid')}
          >
            <Text style={styles.toggleIcon}>⊞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, display === 'list' && styles.toggleActive]}
            onPress={() => setDisplay('list')}
            accessibilityRole="button"
            accessibilityLabel={t('photoGallery.list')}
          >
            <Text style={styles.toggleIcon}>☰</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort chips */}
      <View style={styles.chipRow}>
        {sortOptions.map((o) => (
          <Pressable
            key={o.key}
            style={[styles.chip, sort === o.key && styles.chipActive]}
            onPress={() => setSort(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === o.key }}
          >
            <Text style={[styles.chipText, sort === o.key && styles.chipTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {filterOptions.map((o) => (
          <Pressable
            key={o.key}
            style={[styles.chip, filter === o.key && styles.chipActive]}
            onPress={() => setFilter(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === o.key }}
          >
            <Text style={[styles.chipText, filter === o.key && styles.chipTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  // ── Main render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
        <Text style={styles.loadingText}>{t('photoGallery.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryText}>{t('photoGallery.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.assetId}
        key={display}   // re-mount on display mode change
        numColumns={display === 'grid' ? COLS : 1}
        ListHeaderComponent={header}
        renderItem={display === 'grid' ? renderGridItem : renderListItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('photoGallery.empty')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[PRIMARY]} />
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleAddPhoto}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel={t('photoGallery.addPhoto')}
      >
        {uploading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.fabIcon}>＋</Text>
        }
      </TouchableOpacity>

      {/* Full-screen viewer */}
      <PhotoGallery
        photos={galleryPhotos}
        initialIndex={lightboxIndex >= 0 ? lightboxIndex : 0}
        visible={lightboxIndex >= 0}
        onClose={() => setLightboxIndex(-1)}
        photoLabel={t('photoGallery.photo')}
        shareLabel={t('photoGallery.share')}
        closeLabel={t('photoGallery.close')}
        downloadLabel={t('photoGallery.download')}
        onIndexChange={(i) => setLightboxIndex(i)}
      />
    </SafeAreaView>
  );
}


// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 14,
  },
  errorText: {
    color: '#c00',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    flex: 1,
    textAlign: 'auto',
  },
  countBadge: {
    fontSize: 13,
    color: '#555',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  displayToggle: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  toggleActive: {
    backgroundColor: PRIMARY,
  },
  toggleIcon: { fontSize: 16 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
    justifyContent: 'flex-end',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#E3F2FD',
    borderColor: PRIMARY,
  },
  chipText: { fontSize: 13, color: '#444' },
  chipTextActive: { color: PRIMARY, fontWeight: '600' },
  listContent: { paddingBottom: 100 },
  // Grid
  gridItem: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    margin: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridThumb: {
    width: '100%',
    height: '100%',
  },
  placeholderBg: { backgroundColor: '#e0e0e0' },
  officialBadge: {
    position: 'absolute',
    bottom: 4,
    start: 4,
    backgroundColor: '#1976D2cc',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  communityBadge: {
    backgroundColor: '#388E3Ccc',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // List
  listItem: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginVertical: 6,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  listThumb: {
    width: 90,
    height: 90,
  },
  listMeta: {
    flex: 1,
    padding: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  listCaption: {
    fontSize: 14,
    color: '#222',
    marginBottom: 6,
    textAlign: 'auto',
  },
  listBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
  },
  categoryLabel: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#eeeeee',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    end: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabIcon: { color: '#fff', fontSize: 26, fontWeight: '400' },
});
