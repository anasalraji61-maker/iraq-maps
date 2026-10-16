/**
 * NearbyScreen – "Nearby" discovery with distance rings, category tabs,
 * list/map toggle, open-now filter, and sorting.
 *
 * RTL-safe (start/end), Arabic-first via t().
 * Data comes only from our own backend.
 */

import type { PlaceCategory, PlaceSummary } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { tokens } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { formatDistance, t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DistanceRing = 500 | 1000 | 2000;
type SortMode = 'distance' | 'rating' | 'popularity';
type TravelMode = 'walking' | 'driving';
type ViewMode = 'list' | 'map';

interface NearbyCategory {
  id: PlaceCategory | 'pharmacy' | 'atm';
  icon: string;
  nameKey: string;
}

interface NearbyPlace extends PlaceSummary {
  distanceMetres: number;
  isOpen?: boolean;
  walkingMins?: number;
  drivingMins?: number;
  rating?: number;
  ratingCount?: number;
  popularity?: number; // 0–100
}

interface State {
  places: NearbyPlace[];
  loading: boolean;
  error: string | null;
  selectedCategoryId: string;
  ring: DistanceRing;
  sort: SortMode;
  travelMode: TravelMode;
  openNowOnly: boolean;
  viewMode: ViewMode;
  userLat: number | null;
  userLng: number | null;
}

type Action =
  | { type: 'SET_LOCATION'; lat: number; lng: number }
  | { type: 'SET_CATEGORY'; id: string }
  | { type: 'SET_RING'; ring: DistanceRing }
  | { type: 'SET_SORT'; sort: SortMode }
  | { type: 'SET_TRAVEL'; mode: TravelMode }
  | { type: 'TOGGLE_OPEN_NOW' }
  | { type: 'SET_VIEW'; mode: ViewMode }
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; places: NearbyPlace[] }
  | { type: 'LOAD_ERROR'; error: string };

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const NEARBY_CATS: NearbyCategory[] = [
  { id: 'food', icon: '🍽️', nameKey: 'categories.food' },
  { id: 'cafe', icon: '☕', nameKey: 'categories.cafe' },
  { id: 'pharmacy', icon: '💊', nameKey: 'nearby.pharmacy' },
  { id: 'finance', icon: '🏧', nameKey: 'nearby.atm' },
  { id: 'fuel', icon: '⛽', nameKey: 'categories.fuel' },
  { id: 'health', icon: '🏥', nameKey: 'categories.health' },
  { id: 'shopping', icon: '🛍️', nameKey: 'categories.shopping' },
  { id: 'lodging', icon: '🏨', nameKey: 'categories.lodging' },
];

const RING_OPTIONS: DistanceRing[] = [500, 1000, 2000];
const SORT_OPTIONS: SortMode[] = ['distance', 'rating', 'popularity'];

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOCATION':
      return { ...state, userLat: action.lat, userLng: action.lng };
    case 'SET_CATEGORY':
      return { ...state, selectedCategoryId: action.id, places: [], loading: true, error: null };
    case 'SET_RING':
      return { ...state, ring: action.ring, places: [], loading: true, error: null };
    case 'SET_SORT':
      return { ...state, sort: action.sort };
    case 'SET_TRAVEL':
      return { ...state, travelMode: action.mode };
    case 'TOGGLE_OPEN_NOW':
      return { ...state, openNowOnly: !state.openNowOnly };
    case 'SET_VIEW':
      return { ...state, viewMode: action.mode };
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, places: action.places };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

const initialState: State = {
  places: [],
  loading: false,
  error: null,
  selectedCategoryId: 'food',
  ring: 1000,
  sort: 'distance',
  travelMode: 'walking',
  openNowOnly: false,
  viewMode: 'list',
  userLat: null,
  userLng: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortPlaces(places: NearbyPlace[], sort: SortMode): NearbyPlace[] {
  return [...places].sort((a, b) => {
    switch (sort) {
      case 'distance':
        return a.distanceMetres - b.distanceMetres;
      case 'rating':
        return (b.rating ?? 0) - (a.rating ?? 0);
      case 'popularity':
        return (b.popularity ?? 0) - (a.popularity ?? 0);
    }
  });
}

function walkingMins(metres: number): number {
  return Math.ceil(metres / 80); // ~80 m/min walking
}

function drivingMins(metres: number): number {
  return Math.ceil(metres / 400); // ~400 m/min driving in city
}

// ---------------------------------------------------------------------------
// Place card
// ---------------------------------------------------------------------------

interface PlaceCardProps {
  place: NearbyPlace;
  travelMode: TravelMode;
  onPress: () => void;
}

function PlaceCard({ place, travelMode, onPress }: PlaceCardProps) {
  const dist = formatDistance(place.distanceMetres);
  const mins =
    travelMode === 'walking'
      ? walkingMins(place.distanceMetres)
      : drivingMins(place.distanceMetres);

  return (
    <Pressable onPress={onPress} style={nc.placeCard} accessibilityRole="button">
      <View style={nc.placeCardBody}>
        <View style={nc.placeCardLeft}>
          <RNText style={nc.placeName} numberOfLines={1}>
            {place.nameAr ?? place.name}
          </RNText>
          {place.category && (
            <RNText style={nc.placeCategory}>
              {t(`categories.${place.category}` as Parameters<typeof t>[0])}
            </RNText>
          )}
          <View style={nc.placeMetaRow}>
            <RNText style={nc.placeDist}>{dist}</RNText>
            <RNText style={nc.placeSep}>·</RNText>
            <RNText style={nc.placeMins}>
              {travelMode === 'walking'
                ? t('nearby.walkingMins', { n: mins })
                : t('nearby.drivingMins', { n: mins })}
            </RNText>
          </View>
        </View>
        <View style={nc.placeCardRight}>
          {place.isOpen !== undefined && (
            <View style={[nc.openBadge, place.isOpen ? nc.openBadgeOpen : nc.openBadgeClosed]}>
              <RNText style={[nc.openBadgeText, place.isOpen ? nc.openBadgeTextOpen : nc.openBadgeTextClosed]}>
                {place.isOpen ? t('markerSheet.openBadge') : t('markerSheet.closedBadge')}
              </RNText>
            </View>
          )}
          {place.rating !== undefined && (
            <View style={nc.ratingRow}>
              <RNText style={nc.ratingStar}>★</RNText>
              <RNText style={nc.ratingValue}>{place.rating.toFixed(1)}</RNText>
              {place.ratingCount !== undefined && (
                <RNText style={nc.ratingCount}>({place.ratingCount})</RNText>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Distance ring selector
// ---------------------------------------------------------------------------

function RingSelector({
  selected,
  onChange,
}: {
  selected: DistanceRing;
  onChange: (r: DistanceRing) => void;
}) {
  return (
    <View style={nc.ringRow}>
      <RNText style={nc.ringLabel}>{t('nearby.radius')}</RNText>
      <View style={nc.ringOptions}>
        {RING_OPTIONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            style={[nc.ringChip, selected === r && nc.ringChipActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === r }}
          >
            <RNText style={[nc.ringChipText, selected === r && nc.ringChipTextActive]}>
              {formatDistance(r)}
            </RNText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sort selector
// ---------------------------------------------------------------------------

function SortSelector({
  selected,
  onChange,
}: {
  selected: SortMode;
  onChange: (s: SortMode) => void;
}) {
  const SORT_LABELS: Record<SortMode, string> = {
    distance: 'nearby.sortDistance',
    rating: 'nearby.sortRating',
    popularity: 'nearby.sortPopularity',
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={nc.sortRow}
    >
      {SORT_OPTIONS.map((s) => (
        <Pressable
          key={s}
          onPress={() => onChange(s)}
          style={[nc.sortChip, selected === s && nc.sortChipActive]}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === s }}
        >
          <RNText style={[nc.sortChipText, selected === s && nc.sortChipTextActive]}>
            {t(SORT_LABELS[s] as Parameters<typeof t>[0])}
          </RNText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function NearbyScreen() {
  const router = useRouter();
  const apiBaseUrl = useApiBaseUrl();
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const fetchNearby = useCallback(async () => {
    if (!state.userLat || !state.userLng) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ type: 'LOAD_START' });
    try {
      const params = new URLSearchParams({
        lat: String(state.userLat),
        lng: String(state.userLng),
        radiusMetres: String(state.ring),
        category: state.selectedCategoryId,
        limit: '30',
      });
      const res = await fetch(`${apiBaseUrl}/v1/places/nearby?${params}`, { signal: ctrl.signal });
      const json = (await res.json()) as { items: NearbyPlace[] };
      dispatch({ type: 'LOAD_SUCCESS', places: json.items });
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      dispatch({ type: 'LOAD_ERROR', error: t('search.networkError') });
    }
  }, [apiBaseUrl, state.userLat, state.userLng, state.ring, state.selectedCategoryId]);

  useEffect(() => {
    void fetchNearby();
  }, [fetchNearby]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const displayed = useMemo(() => {
    let list = state.openNowOnly ? state.places.filter((p) => p.isOpen === true) : state.places;
    return sortPlaces(list, state.sort);
  }, [state.places, state.sort, state.openNowOnly]);

  const openPlace = (id: string) => router.push(`/place/${id}`);

  return (
    <View style={nc.container}>
      {/* Header */}
      <View style={nc.header}>
        <Pressable onPress={() => router.back()} style={nc.backBtn} accessibilityLabel={t('search.backBtn')}>
          <RNText style={nc.backBtnText}>‹</RNText>
        </Pressable>
        <RNText style={nc.title}>{t('nearby.title')}</RNText>
        {/* View toggle */}
        <View style={nc.viewToggle}>
          <Pressable
            onPress={() => dispatch({ type: 'SET_VIEW', mode: 'list' })}
            style={[nc.viewBtn, state.viewMode === 'list' && nc.viewBtnActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: state.viewMode === 'list' }}
          >
            <RNText style={[nc.viewBtnText, state.viewMode === 'list' && nc.viewBtnTextActive]}>
              {t('nearby.viewList')}
            </RNText>
          </Pressable>
          <Pressable
            onPress={() => dispatch({ type: 'SET_VIEW', mode: 'map' })}
            style={[nc.viewBtn, state.viewMode === 'map' && nc.viewBtnActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: state.viewMode === 'map' }}
          >
            <RNText style={[nc.viewBtnText, state.viewMode === 'map' && nc.viewBtnTextActive]}>
              {t('nearby.viewMap')}
            </RNText>
          </Pressable>
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={nc.catRow}
        style={nc.catScrollContainer}
      >
        {NEARBY_CATS.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => dispatch({ type: 'SET_CATEGORY', id: cat.id })}
            style={[nc.catChip, state.selectedCategoryId === cat.id && nc.catChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: state.selectedCategoryId === cat.id }}
          >
            <RNText style={nc.catIcon}>{cat.icon}</RNText>
            <RNText
              style={[
                nc.catLabel,
                state.selectedCategoryId === cat.id && nc.catLabelActive,
              ]}
            >
              {t(cat.nameKey as Parameters<typeof t>[0])}
            </RNText>
          </Pressable>
        ))}
      </ScrollView>

      {/* Filter bar */}
      <View style={nc.filterBar}>
        <RingSelector ring={state.ring} onChange={(r) => dispatch({ type: 'SET_RING', ring: r })} />

        {/* Travel mode toggle */}
        <View style={nc.travelRow}>
          <Pressable
            onPress={() => dispatch({ type: 'SET_TRAVEL', mode: 'walking' })}
            style={[nc.travelBtn, state.travelMode === 'walking' && nc.travelBtnActive]}
          >
            <RNText style={[nc.travelBtnText, state.travelMode === 'walking' && nc.travelBtnTextActive]}>
              🚶 {t('nearby.walking')}
            </RNText>
          </Pressable>
          <Pressable
            onPress={() => dispatch({ type: 'SET_TRAVEL', mode: 'driving' })}
            style={[nc.travelBtn, state.travelMode === 'driving' && nc.travelBtnActive]}
          >
            <RNText style={[nc.travelBtnText, state.travelMode === 'driving' && nc.travelBtnTextActive]}>
              🚗 {t('nearby.driving')}
            </RNText>
          </Pressable>
        </View>

        {/* Open now toggle */}
        <Pressable
          onPress={() => dispatch({ type: 'TOGGLE_OPEN_NOW' })}
          style={[nc.openNowBtn, state.openNowOnly && nc.openNowBtnActive]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state.openNowOnly }}
        >
          <RNText style={[nc.openNowText, state.openNowOnly && nc.openNowTextActive]}>
            {t('nearby.openNow')}
          </RNText>
        </Pressable>
      </View>

      {/* Sort */}
      <SortSelector sort={state.sort} onChange={(s) => dispatch({ type: 'SET_SORT', sort: s })} />

      {/* Content */}
      {state.viewMode === 'list' ? (
        <FlatList
          data={state.loading ? [] : displayed}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <PlaceCard place={item} travelMode={state.travelMode} onPress={() => openPlace(item.id)} />
          )}
          ListEmptyComponent={
            state.loading ? (
              <View style={nc.center}>
                <ActivityIndicator size="large" color={tokens.colorActionPrimary} />
                <RNText style={nc.loadingText}>{t('search.loadingLabel')}</RNText>
              </View>
            ) : state.error ? (
              <View style={nc.center}>
                <RNText style={nc.errorText}>{state.error}</RNText>
                <Pressable onPress={fetchNearby} style={nc.retryBtn}>
                  <RNText style={nc.retryText}>{t('actions.retry')}</RNText>
                </Pressable>
              </View>
            ) : !state.userLat ? (
              <View style={nc.center}>
                <RNText style={nc.emptyText}>{t('nearby.noLocation')}</RNText>
              </View>
            ) : (
              <View style={nc.center}>
                <RNText style={nc.emptyText}>{t('nearby.empty')}</RNText>
              </View>
            )
          }
          contentContainerStyle={displayed.length === 0 ? nc.emptyList : nc.listContent}
          ItemSeparatorComponent={() => <View style={nc.separator} />}
        />
      ) : (
        // Map view placeholder – in the real app this would be MapCanvas
        <View style={nc.mapPlaceholder}>
          <RNText style={nc.mapPlaceholderText}>{t('nearby.mapView')}</RNText>
          <RNText style={nc.mapPlaceholderCount}>
            {t('nearby.placesCount', { count: displayed.length })}
          </RNText>
        </View>
      )}

      {/* Result count footer */}
      {!state.loading && displayed.length > 0 && (
        <View style={nc.footer}>
          <RNText style={nc.footerText}>
            {t('nearby.resultCount', { count: displayed.length, ring: formatDistance(state.ring) })}
          </RNText>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const nc = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.colorBgPage },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgSurface,
  },
  backBtn: { marginEnd: 10, padding: 4 },
  backBtnText: { fontSize: 24, color: tokens.colorActionPrimary },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: tokens.colorTextPrimary, writingDirection: 'rtl' },
  viewToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
    borderRadius: 8,
    overflow: 'hidden',
  },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: tokens.colorBgPage },
  viewBtnActive: { backgroundColor: tokens.colorActionPrimary },
  viewBtnText: { fontSize: 12, color: tokens.colorTextSecondary },
  viewBtnTextActive: { color: '#fff', fontWeight: '600' },
  catScrollContainer: { maxHeight: 52, backgroundColor: tokens.colorBgSurface },
  catRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: tokens.colorBgPage,
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
    gap: 4,
  },
  catChipActive: { backgroundColor: tokens.colorActionPrimary, borderColor: tokens.colorActionPrimary },
  catIcon: { fontSize: 14 },
  catLabel: { fontSize: 13, color: tokens.colorTextSecondary },
  catLabelActive: { color: '#fff', fontWeight: '600' },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgSurface,
    gap: 8,
  },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ringLabel: { fontSize: 13, color: tokens.colorTextSecondary, minWidth: 60 },
  ringOptions: { flexDirection: 'row', gap: 6 },
  ringChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgPage,
  },
  ringChipActive: { backgroundColor: tokens.colorActionPrimary, borderColor: tokens.colorActionPrimary },
  ringChipText: { fontSize: 12, color: tokens.colorTextSecondary },
  ringChipTextActive: { color: '#fff', fontWeight: '600' },
  travelRow: { flexDirection: 'row', gap: 6 },
  travelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgPage,
  },
  travelBtnActive: { backgroundColor: tokens.colorActionPrimary, borderColor: tokens.colorActionPrimary },
  travelBtnText: { fontSize: 12, color: tokens.colorTextSecondary },
  travelBtnTextActive: { color: '#fff', fontWeight: '600' },
  openNowBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgPage,
  },
  openNowBtnActive: { backgroundColor: '#e8f5e9', borderColor: '#2e7d32' },
  openNowText: { fontSize: 12, color: tokens.colorTextSecondary },
  openNowTextActive: { color: '#2e7d32', fontWeight: '600' },
  sortRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgSurface,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgPage,
  },
  sortChipActive: { backgroundColor: tokens.colorActionPrimary, borderColor: tokens.colorActionPrimary },
  sortChipText: { fontSize: 12, color: tokens.colorTextSecondary },
  sortChipTextActive: { color: '#fff', fontWeight: '600' },
  listContent: { padding: 12 },
  emptyList: { flex: 1 },
  separator: { height: 10 },
  placeCard: {
    backgroundColor: tokens.colorBgSurface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: tokens.colorBorderDefault,
  },
  placeCardBody: { flexDirection: 'row', alignItems: 'flex-start' },
  placeCardLeft: { flex: 1 },
  placeCardRight: { alignItems: 'flex-end', gap: 6 },
  placeName: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colorTextPrimary,
    writingDirection: 'rtl',
    marginBottom: 2,
  },
  placeCategory: { fontSize: 12, color: tokens.colorTextSecondary, marginBottom: 4 },
  placeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  placeDist: { fontSize: 13, color: tokens.colorActionPrimary, fontWeight: '600' },
  placeSep: { fontSize: 13, color: tokens.colorTextSecondary },
  placeMins: { fontSize: 13, color: tokens.colorTextSecondary },
  openBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  openBadgeOpen: { backgroundColor: '#e8f5e9' },
  openBadgeClosed: { backgroundColor: '#fce4ec' },
  openBadgeText: { fontSize: 11, fontWeight: '700' },
  openBadgeTextOpen: { color: '#2e7d32' },
  openBadgeTextClosed: { color: '#c62828' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingStar: { fontSize: 13, color: '#f9a825' },
  ratingValue: { fontSize: 13, fontWeight: '700', color: tokens.colorTextPrimary },
  ratingCount: { fontSize: 11, color: tokens.colorTextSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { marginTop: 12, fontSize: 14, color: tokens.colorTextSecondary },
  errorText: { fontSize: 14, color: tokens.colorActionDestructive, textAlign: 'center', marginBottom: 12 },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: tokens.colorActionPrimary,
  },
  retryText: { fontSize: 14, color: tokens.colorActionPrimary },
  emptyText: { fontSize: 14, color: tokens.colorTextSecondary, textAlign: 'center' },
  mapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorBgPage,
  },
  mapPlaceholderText: { fontSize: 16, color: tokens.colorTextSecondary },
  mapPlaceholderCount: { fontSize: 13, color: tokens.colorTextSecondary, marginTop: 8 },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.colorBorderDefault,
    backgroundColor: tokens.colorBgSurface,
    alignItems: 'center',
  },
  footerText: { fontSize: 13, color: tokens.colorTextSecondary },
});
