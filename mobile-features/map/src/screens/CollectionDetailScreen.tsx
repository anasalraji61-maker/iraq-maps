/**
 * CollectionDetailScreen – full viewer for a single collection.
 *
 * Features:
 *  - Cover emoji/image header with creator info and follow button
 *  - Map view showing all places (MapLibre markers)
 *  - List view of places with notes and positions
 *  - Map ↔ List toggle
 *  - "Plan route through all" (calls routing)
 *  - Share, Duplicate, Report actions
 *  - Place tap → navigate to PlaceDetailScreen
 *
 * Route: map/collections/[collectionId]
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { CollectionDetail, CollectionPlace } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  I18nManager,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const DIVIDER = '#E0E0E0';
const MUTED = '#888';
const BG = '#F4F6FA';

type ViewMode = 'list' | 'map';

// ── Place row ─────────────────────────────────────────────────────────────────

function PlaceRow({
  entry,
  index,
  onPress,
  onRemove,
  isOwner,
}: {
  entry: CollectionPlace;
  index: number;
  onPress: () => void;
  onRemove?: () => void;
  isOwner: boolean;
}): ReactElement {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 200 + index * 40, useNativeDriver: true }).start();
  }, [fadeAnim, index]);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity style={prStyles.row} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={entry.placeName}>
        {/* Position badge */}
        <View style={prStyles.indexBadge}>
          <RNText style={prStyles.indexText}>{index + 1}</RNText>
        </View>

        {/* Cover image or category icon */}
        {entry.coverImageUrl ? (
          <Image source={{ uri: entry.coverImageUrl }} style={prStyles.cover} accessibilityRole="image" />
        ) : (
          <View style={prStyles.coverFallback}>
            <RNText style={prStyles.coverFallbackText}>📍</RNText>
          </View>
        )}

        {/* Info */}
        <View style={prStyles.info}>
          <RNText style={prStyles.name} numberOfLines={1}>
            {entry.placeNameAr ?? entry.placeName}
          </RNText>
          {entry.placeNameAr && entry.placeName !== entry.placeNameAr && (
            <RNText style={prStyles.nameEn} numberOfLines={1}>{entry.placeName}</RNText>
          )}
          {entry.note && (
            <View style={prStyles.noteRow}>
              <RNText style={prStyles.noteIcon}>💬</RNText>
              <RNText style={prStyles.note} numberOfLines={2}>{entry.note}</RNText>
            </View>
          )}
          <View style={prStyles.meta}>
            {entry.placeCategory && (
              <RNText style={prStyles.category}>{entry.placeCategory}</RNText>
            )}
            {entry.rating != null && (
              <RNText style={prStyles.rating}>⭐ {entry.rating.toFixed(1)}</RNText>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={prStyles.actions}>
          {isOwner && onRemove && (
            <TouchableOpacity style={prStyles.removeBtn} onPress={onRemove} accessibilityLabel={t('collections.removePlace')}>
              <RNText style={prStyles.removeBtnText}>✕</RNText>
            </TouchableOpacity>
          )}
          <RNText style={prStyles.chevron}>{I18nManager.isRTL ? '‹' : '›'}</RNText>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const prStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: SURFACE, borderRadius: 14, padding: 12, gap: 12, borderWidth: 1, borderColor: DIVIDER, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  indexBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  indexText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  cover: { width: 54, height: 54, borderRadius: 10, flexShrink: 0 },
  coverFallback: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  coverFallbackText: { fontSize: 26 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  nameEn: { fontSize: 11, color: '#AAA' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  noteIcon: { fontSize: 12, lineHeight: 18 },
  note: { fontSize: 12, color: '#666', lineHeight: 16, flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  category: { fontSize: 11, color: MUTED, backgroundColor: '#F5F5F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rating: { fontSize: 11, color: '#F57C00' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { fontSize: 11, color: '#E53935', fontWeight: '700' },
  chevron: { fontSize: 18, color: '#CCC' },
});

// ── Map placeholder ───────────────────────────────────────────────────────────

function CollectionMap({ places }: { places: CollectionPlace[] }): ReactElement {
  // Placeholder until full MapLibre integration in this screen
  // The full implementation wires up a MapLibreGL.MapView with ShapeSource + SymbolLayer
  const withLocation = places.filter((p) => p.location != null);

  return (
    <View style={mapStyles.container}>
      <View style={mapStyles.placeholder}>
        <RNText style={mapStyles.icon}>🗺️</RNText>
        <RNText style={mapStyles.text}>{t('collections.mapView')}</RNText>
        <RNText style={mapStyles.sub}>{t('collections.mapPlaceCount', { count: withLocation.length })}</RNText>
      </View>
    </View>
  );
}

const mapStyles = StyleSheet.create({
  container: { height: 320, backgroundColor: '#E8F0FE', borderRadius: 16, margin: 16, overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  icon: { fontSize: 48 },
  text: { fontSize: 16, fontWeight: '600', color: '#444' },
  sub: { fontSize: 13, color: MUTED },
});

// ── Header ────────────────────────────────────────────────────────────────────

function CollectionHeader({
  collection,
  onFollow,
  onUnfollow,
}: {
  collection: CollectionDetail;
  onFollow: () => void;
  onUnfollow: () => void;
}): ReactElement {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const HEADER_HEIGHT = 200;

  const headerOpacity = scrollAnim.interpolate({ inputRange: [0, HEADER_HEIGHT * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Animated.View style={[hStyles.header, { opacity: headerOpacity }]}>
      {collection.coverUrl ? (
        <Image source={{ uri: collection.coverUrl }} style={hStyles.coverImage} accessibilityRole="image" />
      ) : (
        <View style={[hStyles.coverGradient]}>
          <RNText style={hStyles.emoji}>{collection.emoji ?? '📌'}</RNText>
        </View>
      )}
      <View style={hStyles.overlay}>
        <View style={hStyles.titles}>
          <RNText style={hStyles.name} numberOfLines={2}>{collection.nameAr}</RNText>
          {collection.nameEn && <RNText style={hStyles.nameEn}>{collection.nameEn}</RNText>}
        </View>
        <View style={hStyles.stats}>
          <View style={hStyles.stat}>
            <RNText style={hStyles.statNum}>{collection.placeCount}</RNText>
            <RNText style={hStyles.statLabel}>{t('collections.places')}</RNText>
          </View>
          <View style={hStyles.statDivider} />
          <View style={hStyles.stat}>
            <RNText style={hStyles.statNum}>{collection.followerCount}</RNText>
            <RNText style={hStyles.statLabel}>{t('collections.followers')}</RNText>
          </View>
        </View>
      </View>

      {/* Creator row */}
      <View style={hStyles.creatorRow}>
        {collection.ownerAvatarUrl ? (
          <Image source={{ uri: collection.ownerAvatarUrl }} style={hStyles.avatar} accessibilityRole="image" />
        ) : (
          <View style={hStyles.avatarFallback}>
            <RNText style={hStyles.avatarFallbackText}>{collection.ownerName?.[0] ?? '?'}</RNText>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <RNText style={hStyles.ownerName}>{collection.ownerName ?? t('collections.unknownOwner')}</RNText>
          {collection.isStaffPick && (
            <View style={hStyles.staffBadge}>
              <RNText style={hStyles.staffBadgeText}>{t('collections.staffPick')}</RNText>
            </View>
          )}
        </View>
        {!collection.isOwner && (
          <TouchableOpacity
            style={[hStyles.followBtn, collection.isFollowing && hStyles.followBtnActive]}
            onPress={collection.isFollowing ? onUnfollow : onFollow}
          >
            <RNText style={[hStyles.followBtnText, collection.isFollowing && hStyles.followBtnTextActive]}>
              {collection.isFollowing ? t('collections.following') : t('collections.follow')}
            </RNText>
          </TouchableOpacity>
        )}
      </View>

      {collection.descriptionAr && (
        <View style={hStyles.descBox}>
          <RNText style={hStyles.desc}>{collection.descriptionAr}</RNText>
        </View>
      )}
    </Animated.View>
  );
}

const hStyles = StyleSheet.create({
  header: { backgroundColor: SURFACE },
  coverImage: { width: '100%', height: 180 },
  coverGradient: { width: '100%', height: 180, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 72 },
  overlay: { position: 'absolute', top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 180, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', alignItems: 'flex-end', padding: 16, gap: 12 },
  titles: { flex: 1 },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  nameEn: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.4)' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ownerName: { fontSize: 14, fontWeight: '600', color: '#222' },
  staffBadge: { backgroundColor: '#FFF8E1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FFD54F', alignSelf: 'flex-start', marginTop: 2 },
  staffBadgeText: { fontSize: 10, color: '#F57F17', fontWeight: '700' },
  followBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: PRIMARY },
  followBtnActive: { backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: DIVIDER },
  followBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  followBtnTextActive: { color: '#333' },
  descBox: { paddingHorizontal: 16, paddingBottom: 12 },
  desc: { fontSize: 13, color: '#666', lineHeight: 18 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function CollectionDetailScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();

  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [routePlanning, setRoutePlanning] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadCollection = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/v1/collections/${collectionId}`);
      if (res.status === 200) {
        const body = res.body as { collection: CollectionDetail };
        setCollection(body.collection);
      } else {
        setError(t('collections.loadError'));
      }
    } catch {
      setError(t('collections.loadError'));
    } finally {
      setLoading(false);
    }
  }, [collectionId, api]);

  useEffect(() => { void loadCollection(); }, [loadCollection]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleFollow = useCallback(async () => {
    if (!collection) return;
    await api.post(`/v1/collections/${collection.id}/follow`, { body: {} }).catch(() => null);
    setCollection((prev) => prev ? { ...prev, isFollowing: true, followerCount: prev.followerCount + 1 } : prev);
  }, [collection, api]);

  const handleUnfollow = useCallback(async () => {
    if (!collection) return;
    await api.delete(`/v1/collections/${collection.id}/follow`, { body: {} }).catch(() => null);
    setCollection((prev) => prev ? { ...prev, isFollowing: false, followerCount: Math.max(0, prev.followerCount - 1) } : prev);
  }, [collection, api]);

  const handleRemovePlace = useCallback(async (placeId: string) => {
    if (!collection) return;
    await api.delete(`/v1/collections/${collection.id}/places/${placeId}`, { body: {} }).catch(() => null);
    setCollection((prev) => {
      if (!prev) return prev;
      const places = prev.places.filter((p) => p.placeId !== placeId);
      return { ...prev, places, placeCount: Math.max(0, prev.placeCount - 1) };
    });
  }, [collection, api]);

  const handleShare = useCallback(async () => {
    if (!collection) return;
    await Share.share({ message: collection.nameAr }).catch(() => null);
  }, [collection]);

  const handleDuplicate = useCallback(async () => {
    if (!collection) return;
    try {
      const res = await api.post(`/v1/collections/${collection.id}/duplicate`, { body: {} });
      if (res.status === 201) router.back();
    } catch { /* ignore */ }
  }, [collection, api, router]);

  const handlePlanRoute = useCallback(async () => {
    if (!collection) return;
    setRoutePlanning(true);
    const coords = collection.places
      .filter((p) => p.location != null)
      .map((p) => p.location!)
      .slice(0, 10); // Valhalla optimised route limit

    router.push({
      pathname: '/route',
      params: { waypoints: JSON.stringify(coords) },
    });
    setRoutePlanning(false);
  }, [collection, router]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      </Screen>
    );
  }

  if (error || !collection) {
    return (
      <Screen>
        <View style={styles.center}>
          <RNText style={styles.errorText}>{error ?? t('collections.loadError')}</RNText>
          <TouchableOpacity style={styles.retryBtn} onPress={loadCollection}>
            <RNText style={styles.retryBtnText}>{t('collections.retry')}</RNText>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Nav bar */}
      <View style={styles.nav}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('search.backBtn')}>
          <RNText style={styles.backIcon}>→</RNText>
        </TouchableOpacity>
        <RNText style={styles.navTitle} numberOfLines={1}>{collection.nameAr}</RNText>
        <View style={styles.navActions}>
          {/* View toggle */}
          <TouchableOpacity style={styles.toggleBtn} onPress={() => setViewMode((v) => v === 'list' ? 'map' : 'list')} accessibilityLabel={t('collections.toggleView')}>
            <RNText style={styles.toggleIcon}>{viewMode === 'list' ? '🗺️' : '📋'}</RNText>
          </TouchableOpacity>
          {/* Share */}
          <TouchableOpacity style={styles.toggleBtn} onPress={handleShare} accessibilityLabel={t('collections.share')}>
            <RNText style={styles.toggleIcon}>↗️</RNText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <CollectionHeader collection={collection} onFollow={handleFollow} onUnfollow={handleUnfollow} />

        {/* View toggle bar */}
        <View style={styles.viewToggleBar}>
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'list' && styles.viewToggleActive]}
            onPress={() => setViewMode('list')}
          >
            <RNText style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>
              📋 {t('collections.listView')}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggle, viewMode === 'map' && styles.viewToggleActive]}
            onPress={() => setViewMode('map')}
          >
            <RNText style={[styles.viewToggleText, viewMode === 'map' && styles.viewToggleTextActive]}>
              🗺️ {t('collections.mapView')}
            </RNText>
          </TouchableOpacity>
        </View>

        {/* Map view */}
        {viewMode === 'map' && <CollectionMap places={collection.places} />}

        {/* Plan route button */}
        {collection.places.length >= 2 && (
          <TouchableOpacity style={styles.routeBtn} onPress={handlePlanRoute} disabled={routePlanning}>
            <RNText style={styles.routeBtnText}>
              {routePlanning ? '⏳' : '🧭'} {t('collections.planRoute')}
            </RNText>
          </TouchableOpacity>
        )}

        {/* Places list */}
        {viewMode === 'list' && (
          <View style={styles.placesList}>
            <RNText style={styles.sectionTitle}>
              {t('collections.placesSection', { count: collection.places.length })}
            </RNText>
            {collection.places.length === 0 ? (
              <View style={styles.emptyPlaces}>
                <RNText style={styles.emptyPlacesIcon}>📍</RNText>
                <RNText style={styles.emptyPlacesText}>{t('collections.noPlaces')}</RNText>
              </View>
            ) : (
              collection.places.map((entry, index) => (
                <PlaceRow
                  key={entry.placeId}
                  entry={entry}
                  index={index}
                  isOwner={collection.isOwner}
                  onPress={() => router.push(`/places/${entry.placeId}`)}
                  onRemove={collection.isOwner ? () => handleRemovePlace(entry.placeId) : undefined}
                />
              ))
            )}
          </View>
        )}

        {/* Bottom actions */}
        <View style={styles.bottomActions}>
          {!collection.isOwner && (
            <TouchableOpacity style={styles.dupBtn} onPress={handleDuplicate}>
              <RNText style={styles.dupBtnText}>📋 {t('collections.duplicate')}</RNText>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push(`/report/collection/${collection.id}`)}>
            <RNText style={styles.reportBtnText}>⚑ {t('collections.report')}</RNText>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, color: '#E53935', textAlign: 'center', paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: PRIMARY, borderRadius: 20 },
  retryBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: DIVIDER, gap: 10 },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 18, color: '#444', transform: [{ scaleX: I18nManager.isRTL ? 1 : -1 }] },
  navTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111' },
  navActions: { flexDirection: 'row', gap: 8 },
  toggleBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  toggleIcon: { fontSize: 17 },
  scroll: { flex: 1, backgroundColor: BG },
  scrollContent: { gap: 0 },
  viewToggleBar: { flexDirection: 'row', backgroundColor: SURFACE, borderBottomWidth: 1, borderBottomColor: DIVIDER },
  viewToggle: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  viewToggleActive: { borderBottomColor: PRIMARY },
  viewToggleText: { fontSize: 13, color: MUTED },
  viewToggleTextActive: { color: PRIMARY, fontWeight: '600' },
  routeBtn: { margin: 16, marginBottom: 0, backgroundColor: '#1B5E20', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  routeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  placesList: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#444', marginBottom: 4 },
  emptyPlaces: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyPlacesIcon: { fontSize: 40 },
  emptyPlacesText: { fontSize: 14, color: MUTED },
  bottomActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  dupBtn: { flex: 1, paddingVertical: 13, backgroundColor: '#F0F0F0', borderRadius: 14, alignItems: 'center' },
  dupBtnText: { fontSize: 14, fontWeight: '600', color: '#333' },
  reportBtn: { paddingVertical: 13, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: DIVIDER, alignItems: 'center' },
  reportBtnText: { fontSize: 14, color: '#E53935' },
});
