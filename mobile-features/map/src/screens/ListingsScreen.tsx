/**
 * ListingsScreen — marketplace browse.
 *
 * Layout:
 *  - Search bar (sticky top)
 *  - Category grid (horizontal scroll)
 *  - Featured carousel (admin-curated)
 *  - Filter bar (sort + filters)
 *  - Listing grid / list (2-column grid or single-column list, toggled)
 *  - Pagination via cursor + "load more" button
 *
 * RTL-safe: start/end only. All text via t().
 * Prices in IQD using formatNumber from packages/i18n.
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import { type ListingCategory, type ListingFilters, type ListingSortMode, type ListingSummary } from '@iraq-maps/contracts';
import { formatNumber } from '@iraq-maps/i18n';
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
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  I18nManager,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Text as RNText,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const BG = '#F5F5F5';
const BORDER = '#E0E0E0';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#666666';
const SUCCESS = '#16A34A';
const WARN = '#D97706';
const FEATURED_COLOR = '#F59E0B';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 10;
const GRID_COLS = 2;
const GRID_CARD_W = (SCREEN_W - 16 * 2 - CARD_GAP) / GRID_COLS;
const CAROUSEL_CARD_W = SCREEN_W * 0.72;

const SORT_OPTIONS: Array<{ key: ListingSortMode; labelKey: string }> = [
  { key: 'newest', labelKey: 'listings.sortNewest' },
  { key: 'price_asc', labelKey: 'listings.sortPriceAsc' },
  { key: 'price_desc', labelKey: 'listings.sortPriceDesc' },
  { key: 'popularity', labelKey: 'listings.sortPopularity' },
];

// ── State ─────────────────────────────────────────────────────────────────────

interface State {
  categories: ListingCategory[];
  featured: ListingSummary[];
  listings: ListingSummary[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  loadingFeatured: boolean;
  error: string | null;
  query: string;
  selectedCategory: string | null;
  sort: ListingSortMode;
  viewMode: 'grid' | 'list';
  filterModal: boolean;
  priceMin: string;
  priceMax: string;
  inStock: boolean;
  hasDelivery: boolean;
}

type Action =
  | { type: 'SET_CATEGORIES'; categories: ListingCategory[] }
  | { type: 'SET_FEATURED'; featured: ListingSummary[] }
  | { type: 'SET_LISTINGS'; listings: ListingSummary[]; cursor: string | null }
  | { type: 'APPEND_LISTINGS'; listings: ListingSummary[]; cursor: string | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_LOADING_MORE'; loadingMore: boolean }
  | { type: 'SET_LOADING_FEATURED'; loadingFeatured: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_CATEGORY'; categoryId: string | null }
  | { type: 'SET_SORT'; sort: ListingSortMode }
  | { type: 'TOGGLE_VIEW' }
  | { type: 'TOGGLE_FILTER_MODAL' }
  | { type: 'SET_PRICE_MIN'; value: string }
  | { type: 'SET_PRICE_MAX'; value: string }
  | { type: 'TOGGLE_IN_STOCK' }
  | { type: 'TOGGLE_HAS_DELIVERY' }
  | { type: 'RESET_FILTERS' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_CATEGORIES': return { ...state, categories: action.categories };
    case 'SET_FEATURED': return { ...state, featured: action.featured, loadingFeatured: false };
    case 'SET_LISTINGS': return { ...state, listings: action.listings, nextCursor: action.cursor, loading: false, error: null };
    case 'APPEND_LISTINGS': return { ...state, listings: [...state.listings, ...action.listings], nextCursor: action.cursor, loadingMore: false };
    case 'SET_LOADING': return { ...state, loading: action.loading };
    case 'SET_LOADING_MORE': return { ...state, loadingMore: action.loadingMore };
    case 'SET_LOADING_FEATURED': return { ...state, loadingFeatured: action.loadingFeatured };
    case 'SET_ERROR': return { ...state, error: action.error, loading: false };
    case 'SET_QUERY': return { ...state, query: action.query };
    case 'SET_CATEGORY': return { ...state, selectedCategory: action.categoryId };
    case 'SET_SORT': return { ...state, sort: action.sort };
    case 'TOGGLE_VIEW': return { ...state, viewMode: state.viewMode === 'grid' ? 'list' : 'grid' };
    case 'TOGGLE_FILTER_MODAL': return { ...state, filterModal: !state.filterModal };
    case 'SET_PRICE_MIN': return { ...state, priceMin: action.value };
    case 'SET_PRICE_MAX': return { ...state, priceMax: action.value };
    case 'TOGGLE_IN_STOCK': return { ...state, inStock: !state.inStock };
    case 'TOGGLE_HAS_DELIVERY': return { ...state, hasDelivery: !state.hasDelivery };
    case 'RESET_FILTERS': return { ...state, priceMin: '', priceMax: '', inStock: false, hasDelivery: false, selectedCategory: null };
    default: return state;
  }
}

const INIT: State = {
  categories: [],
  featured: [],
  listings: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  loadingFeatured: false,
  error: null,
  query: '',
  selectedCategory: null,
  sort: 'newest',
  viewMode: 'grid',
  filterModal: false,
  priceMin: '',
  priceMax: '',
  inStock: false,
  hasDelivery: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatIqd(price: number): string {
  return t('listings.priceLabel', { price: formatNumber(price) });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CategoryChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <TouchableOpacity
      style={[styles.categoryChip, selected && styles.categoryChipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <RNText style={styles.categoryChipIcon}>{icon}</RNText>
      <RNText style={[styles.categoryChipLabel, selected && styles.categoryChipLabelSelected]} numberOfLines={1}>
        {label}
      </RNText>
    </TouchableOpacity>
  );
}

function FeaturedCard({ item, onPress }: { item: ListingSummary; onPress: () => void }): ReactElement {
  return (
    <TouchableOpacity style={styles.carouselCard} onPress={onPress} activeOpacity={0.85}>
      {item.coverPhotoUrl ? (
        <Image source={{ uri: item.coverPhotoUrl }} style={styles.carouselImage} resizeMode="cover" />
      ) : (
        <View style={[styles.carouselImage, styles.noPhoto]}>
          <RNText style={styles.noPhotoIcon}>🖼️</RNText>
        </View>
      )}
      <View style={styles.carouselInfo}>
        <View style={styles.carouselBadgeRow}>
          <View style={styles.featuredBadge}>
            <RNText style={styles.featuredBadgeText}>{t('listings.featured')}</RNText>
          </View>
          {item.deliveryAvailable && (
            <View style={styles.deliveryBadge}>
              <RNText style={styles.deliveryBadgeText}>🚚</RNText>
            </View>
          )}
        </View>
        <RNText style={styles.carouselTitle} numberOfLines={2}>{item.titleAr}</RNText>
        <RNText style={styles.carouselPrice}>{formatIqd(item.priceIqd)}</RNText>
        <RNText style={styles.carouselProvider} numberOfLines={1}>
          {item.providerName}
          {item.providerVerified ? ' ✓' : ''}
        </RNText>
      </View>
    </TouchableOpacity>
  );
}

function GridCard({ item, onPress }: { item: ListingSummary; onPress: () => void }): ReactElement {
  return (
    <TouchableOpacity style={styles.gridCard} onPress={onPress} activeOpacity={0.85}>
      {item.coverPhotoUrl ? (
        <Image source={{ uri: item.coverPhotoUrl }} style={styles.gridImage} resizeMode="cover" />
      ) : (
        <View style={[styles.gridImage, styles.noPhoto]}>
          <RNText style={styles.noPhotoIcon}>🖼️</RNText>
        </View>
      )}
      <View style={styles.gridInfo}>
        <RNText style={styles.gridTitle} numberOfLines={2}>{item.titleAr}</RNText>
        <RNText style={styles.gridPrice}>{formatIqd(item.priceIqd)}</RNText>
        <View style={styles.gridFooter}>
          <RNText style={[styles.availBadge, !item.isAvailable && styles.unavailBadge]}>
            {item.isAvailable ? t('listings.inStock') : t('listings.outOfStock')}
          </RNText>
          {item.deliveryAvailable && (
            <RNText style={styles.deliveryIcon}>🚚</RNText>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ListCard({ item, onPress }: { item: ListingSummary; onPress: () => void }): ReactElement {
  return (
    <TouchableOpacity style={styles.listCard} onPress={onPress} activeOpacity={0.85}>
      {item.coverPhotoUrl ? (
        <Image source={{ uri: item.coverPhotoUrl }} style={styles.listImage} resizeMode="cover" />
      ) : (
        <View style={[styles.listImage, styles.noPhoto]}>
          <RNText style={styles.noPhotoIcon}>🖼️</RNText>
        </View>
      )}
      <View style={styles.listInfo}>
        <RNText style={styles.listCategoryLabel}>{item.category.nameAr}</RNText>
        <RNText style={styles.listTitle} numberOfLines={2}>{item.titleAr}</RNText>
        <RNText style={styles.listPrice}>{formatIqd(item.priceIqd)}</RNText>
        <RNText style={styles.listProvider} numberOfLines={1}>
          {item.providerName}
          {item.providerVerified ? ' ✓' : ''}
        </RNText>
        <View style={styles.listFooter}>
          <RNText style={[styles.availBadge, !item.isAvailable && styles.unavailBadge]}>
            {item.isAvailable ? t('listings.inStock') : t('listings.outOfStock')}
          </RNText>
          {item.deliveryAvailable && (
            <RNText style={styles.deliveryText}>{t('listings.delivery')}</RNText>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Filter Modal ──────────────────────────────────────────────────────────────

function FilterModal({
  visible,
  state,
  categories,
  dispatch,
  onApply,
}: {
  visible: boolean;
  state: State;
  categories: ListingCategory[];
  dispatch: React.Dispatch<Action>;
  onApply: () => void;
}): ReactElement {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.filterModal}>
        <View style={styles.filterHeader}>
          <RNText style={styles.filterTitle}>{t('listings.filterTitle')}</RNText>
          <TouchableOpacity onPress={() => dispatch({ type: 'TOGGLE_FILTER_MODAL' })}>
            <RNText style={styles.filterClose}>✕</RNText>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.filterBody}>
          {/* Category */}
          <RNText style={styles.filterSectionTitle}>{t('listings.filterCategory')}</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterCategoryRow}>
            <TouchableOpacity
              style={[styles.filterChip, !state.selectedCategory && styles.filterChipSelected]}
              onPress={() => dispatch({ type: 'SET_CATEGORY', categoryId: null })}
            >
              <RNText style={[styles.filterChipText, !state.selectedCategory && styles.filterChipTextSelected]}>
                {t('listings.allCategories')}
              </RNText>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id as string}
                style={[styles.filterChip, state.selectedCategory === (cat.id as string) && styles.filterChipSelected]}
                onPress={() => dispatch({ type: 'SET_CATEGORY', categoryId: cat.id as string })}
              >
                <RNText style={[styles.filterChipText, state.selectedCategory === (cat.id as string) && styles.filterChipTextSelected]}>
                  {cat.icon} {cat.nameAr}
                </RNText>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Price range */}
          <RNText style={styles.filterSectionTitle}>{t('listings.filterPriceRange')}</RNText>
          <View style={styles.filterPriceRow}>
            <TextInput
              style={styles.filterPriceInput}
              value={state.priceMin}
              onChangeText={(v) => dispatch({ type: 'SET_PRICE_MIN', value: v })}
              placeholder={t('listings.filterPriceMin')}
              keyboardType="numeric"
              textAlign="start"
            />
            <RNText style={styles.filterPriceSep}>—</RNText>
            <TextInput
              style={styles.filterPriceInput}
              value={state.priceMax}
              onChangeText={(v) => dispatch({ type: 'SET_PRICE_MAX', value: v })}
              placeholder={t('listings.filterPriceMax')}
              keyboardType="numeric"
              textAlign="start"
            />
          </View>

          {/* Toggles */}
          <TouchableOpacity style={styles.filterToggleRow} onPress={() => dispatch({ type: 'TOGGLE_IN_STOCK' })}>
            <RNText style={styles.filterToggleLabel}>{t('listings.filterInStock')}</RNText>
            <View style={[styles.filterToggle, state.inStock && styles.filterToggleOn]}>
              <View style={[styles.filterThumb, state.inStock && styles.filterThumbOn]} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.filterToggleRow} onPress={() => dispatch({ type: 'TOGGLE_HAS_DELIVERY' })}>
            <RNText style={styles.filterToggleLabel}>{t('listings.filterHasDelivery')}</RNText>
            <View style={[styles.filterToggle, state.hasDelivery && styles.filterToggleOn]}>
              <View style={[styles.filterThumb, state.hasDelivery && styles.filterThumbOn]} />
            </View>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.filterFooter}>
          <TouchableOpacity style={styles.filterResetBtn} onPress={() => dispatch({ type: 'RESET_FILTERS' })}>
            <RNText style={styles.filterResetText}>{t('listings.filterReset')}</RNText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterApplyBtn} onPress={onApply}>
            <RNText style={styles.filterApplyText}>{t('listings.filterApply')}</RNText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ListingsScreen(): ReactElement {
  const baseUrl = useApiBaseUrl();
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, INIT);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/listings/categories`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ListingCategory[] };
      dispatch({ type: 'SET_CATEGORIES', categories: data.items });
    } catch {
      // silent — categories are optional UX enhancement
    }
  }, [baseUrl]);

  const fetchFeatured = useCallback(async () => {
    dispatch({ type: 'SET_LOADING_FEATURED', loadingFeatured: true });
    try {
      const res = await fetch(`${baseUrl}/listings/featured?cityId=baghdad`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ListingSummary[] };
      dispatch({ type: 'SET_FEATURED', featured: data.items });
    } catch {
      dispatch({ type: 'SET_LOADING_FEATURED', loadingFeatured: false });
    }
  }, [baseUrl]);

  const buildParams = useCallback(
    (cursor?: string): string => {
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('sort', state.sort);
      if (state.selectedCategory) params.set('categoryId', state.selectedCategory);
      if (state.priceMin) params.set('priceMin', state.priceMin);
      if (state.priceMax) params.set('priceMax', state.priceMax);
      if (state.inStock) params.set('inStock', 'true');
      if (state.hasDelivery) params.set('hasDelivery', 'true');
      if (cursor) params.set('cursor', cursor);
      return params.toString();
    },
    [state.sort, state.selectedCategory, state.priceMin, state.priceMax, state.inStock, state.hasDelivery],
  );

  const fetchListings = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', loading: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const isSearch = state.query.trim().length > 0;
      const endpoint = isSearch
        ? `${baseUrl}/listings/search?q=${encodeURIComponent(state.query)}&${buildParams()}`
        : `${baseUrl}/listings?${buildParams()}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { items: ListingSummary[]; nextCursor: string | null };
      dispatch({ type: 'SET_LISTINGS', listings: data.items, cursor: data.nextCursor });
    } catch {
      dispatch({ type: 'SET_ERROR', error: t('listings.error') });
    }
  }, [baseUrl, buildParams, state.query]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    dispatch({ type: 'SET_LOADING_MORE', loadingMore: true });
    try {
      const isSearch = state.query.trim().length > 0;
      const endpoint = isSearch
        ? `${baseUrl}/listings/search?q=${encodeURIComponent(state.query)}&${buildParams(state.nextCursor)}`
        : `${baseUrl}/listings?${buildParams(state.nextCursor)}`;
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const data = (await res.json()) as { items: ListingSummary[]; nextCursor: string | null };
      dispatch({ type: 'APPEND_LISTINGS', listings: data.items, cursor: data.nextCursor });
    } catch {
      dispatch({ type: 'SET_LOADING_MORE', loadingMore: false });
    }
  }, [baseUrl, buildParams, state.nextCursor, state.loadingMore, state.query]);

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchCategories();
    void fetchFeatured();
  }, [fetchCategories, fetchFeatured]);

  useEffect(() => {
    void fetchListings();
  }, [fetchListings]);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void fetchListings(), 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [state.query]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleListingPress = useCallback(
    (id: string) => {
      router.push(`/listing/${id}` as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleApplyFilter = useCallback(() => {
    dispatch({ type: 'TOGGLE_FILTER_MODAL' });
    void fetchListings();
  }, [fetchListings]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (state.selectedCategory) count++;
    if (state.priceMin) count++;
    if (state.priceMax) count++;
    if (state.inStock) count++;
    if (state.hasDelivery) count++;
    return count;
  }, [state.selectedCategory, state.priceMin, state.priceMax, state.inStock, state.hasDelivery]);

  const renderGridItem = useCallback(
    ({ item }: { item: ListingSummary }) => (
      <GridCard item={item} onPress={() => handleListingPress(item.id as string)} />
    ),
    [handleListingPress],
  );

  const renderListItem = useCallback(
    ({ item }: { item: ListingSummary }) => (
      <ListCard item={item} onPress={() => handleListingPress(item.id as string)} />
    ),
    [handleListingPress],
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <RNText style={styles.headerTitle}>{t('listings.title')}</RNText>
        <RNText style={styles.headerSubtitle}>{t('listings.subtitle')}</RNText>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <RNText style={styles.searchIcon}>🔍</RNText>
        <TextInput
          style={styles.searchInput}
          value={state.query}
          onChangeText={(v) => dispatch({ type: 'SET_QUERY', query: v })}
          placeholder={t('listings.searchPlaceholder')}
          returnKeyType="search"
          textAlign="start"
          accessibilityLabel={t('listings.searchPlaceholder')}
        />
        {state.query.length > 0 && (
          <TouchableOpacity onPress={() => dispatch({ type: 'SET_QUERY', query: '' })}>
            <RNText style={styles.searchClear}>✕</RNText>
          </TouchableOpacity>
        )}
      </View>

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryRow}
        contentContainerStyle={styles.categoryRowContent}
      >
        <CategoryChip
          label={t('listings.allCategories')}
          icon="🛍️"
          selected={!state.selectedCategory}
          onPress={() => dispatch({ type: 'SET_CATEGORY', categoryId: null })}
        />
        {state.categories.map((cat) => (
          <CategoryChip
            key={cat.id as string}
            label={cat.nameAr}
            icon={cat.icon}
            selected={state.selectedCategory === (cat.id as string)}
            onPress={() => dispatch({ type: 'SET_CATEGORY', categoryId: cat.id as string })}
          />
        ))}
      </ScrollView>

      {/* Filter + sort bar */}
      <View style={styles.filterBar}>
        {/* Sort options */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortChip, state.sort === opt.key && styles.sortChipSelected]}
              onPress={() => dispatch({ type: 'SET_SORT', sort: opt.key })}
            >
              <RNText style={[styles.sortChipText, state.sort === opt.key && styles.sortChipTextSelected]}>
                {t(opt.labelKey as Parameters<typeof t>[0])}
              </RNText>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Right side: filter + view toggle */}
        <View style={styles.filterBarActions}>
          <TouchableOpacity style={styles.filterBtn} onPress={() => dispatch({ type: 'TOGGLE_FILTER_MODAL' })}>
            <RNText style={styles.filterBtnText}>
              {t('listings.filterBtn')}
              {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.viewToggle} onPress={() => dispatch({ type: 'TOGGLE_VIEW' })}>
            <RNText style={styles.viewToggleIcon}>{state.viewMode === 'grid' ? '☰' : '⊞'}</RNText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Featured carousel */}
      {state.featured.length > 0 && (
        <View style={styles.carouselSection}>
          <RNText style={styles.sectionTitle}>{t('listings.featuredSection')}</RNText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselRow}
          >
            {state.featured.map((item) => (
              <FeaturedCard
                key={item.id as string}
                item={item}
                onPress={() => handleListingPress(item.id as string)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Listings grid / list */}
      {state.loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY} />
          <RNText style={styles.loadingText}>{t('listings.loading')}</RNText>
        </View>
      ) : state.error ? (
        <View style={styles.centered}>
          <RNText style={styles.errorText}>{state.error}</RNText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchListings()}>
            <RNText style={styles.retryText}>{t('listings.retry')}</RNText>
          </TouchableOpacity>
        </View>
      ) : state.listings.length === 0 ? (
        <View style={styles.centered}>
          <RNText style={styles.emptyIcon}>🛒</RNText>
          <RNText style={styles.emptyText}>
            {state.query ? t('listings.emptySearch', { query: state.query }) : t('listings.empty')}
          </RNText>
        </View>
      ) : state.viewMode === 'grid' ? (
        <FlatList
          data={state.listings}
          keyExtractor={(item) => item.id as string}
          renderItem={renderGridItem}
          numColumns={GRID_COLS}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator color={PRIMARY} style={styles.loadMoreSpinner} />
            ) : state.nextCursor ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                <RNText style={styles.loadMoreText}>{t('listings.loadMore')}</RNText>
              </TouchableOpacity>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={state.listings}
          keyExtractor={(item) => item.id as string}
          renderItem={renderListItem}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            state.loadingMore ? (
              <ActivityIndicator color={PRIMARY} style={styles.loadMoreSpinner} />
            ) : state.nextCursor ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
                <RNText style={styles.loadMoreText}>{t('listings.loadMore')}</RNText>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* Filter modal */}
      <FilterModal
        visible={state.filterModal}
        state={state}
        categories={state.categories}
        dispatch={dispatch}
        onApply={handleApplyFilter}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: SURFACE },
  headerTitle: { fontSize: 22, fontWeight: '700', color: TEXT_PRIMARY },
  headerSubtitle: { fontSize: 13, color: TEXT_SECONDARY, marginTop: 2 },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, paddingVertical: 10 },
  searchClear: { fontSize: 16, color: TEXT_SECONDARY, padding: 4 },

  // Categories
  categoryRow: { maxHeight: 60, flexGrow: 0 },
  categoryRowContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 4,
  },
  categoryChipSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  categoryChipIcon: { fontSize: 16 },
  categoryChipLabel: { fontSize: 13, color: TEXT_PRIMARY },
  categoryChipLabelSelected: { color: '#FFF', fontWeight: '600' },

  // Filter bar
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 16,
    paddingEnd: 8,
    paddingVertical: 6,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sortRow: { flex: 1 },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginEnd: 6,
    backgroundColor: '#F0F0F0',
  },
  sortChipSelected: { backgroundColor: PRIMARY },
  sortChipText: { fontSize: 12, color: TEXT_SECONDARY },
  sortChipTextSelected: { color: '#FFF', fontWeight: '600' },
  filterBarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PRIMARY,
  },
  filterBtnText: { fontSize: 12, color: PRIMARY, fontWeight: '600' },
  viewToggle: { padding: 6 },
  viewToggleIcon: { fontSize: 18, color: TEXT_PRIMARY },

  // Featured carousel
  carouselSection: { marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: TEXT_PRIMARY, marginStart: 16, marginTop: 12, marginBottom: 8 },
  carouselRow: { paddingStart: 16, paddingEnd: 8, gap: 12 },
  carouselCard: {
    width: CAROUSEL_CARD_W,
    borderRadius: 12,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  carouselImage: { width: '100%', height: 130 },
  carouselInfo: { padding: 10 },
  carouselBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  featuredBadge: { backgroundColor: FEATURED_COLOR, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  featuredBadgeText: { fontSize: 10, color: '#FFF', fontWeight: '700' },
  deliveryBadge: { backgroundColor: '#EEF6EE', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  deliveryBadgeText: { fontSize: 12 },
  carouselTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 4 },
  carouselPrice: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  carouselProvider: { fontSize: 11, color: TEXT_SECONDARY, marginTop: 2 },

  // Grid
  gridContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 },
  gridRow: { gap: CARD_GAP, marginBottom: CARD_GAP },
  gridCard: {
    width: GRID_CARD_W,
    borderRadius: 10,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  gridImage: { width: '100%', height: 120 },
  gridInfo: { padding: 8 },
  gridTitle: { fontSize: 13, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 4 },
  gridPrice: { fontSize: 14, fontWeight: '700', color: PRIMARY, marginBottom: 4 },
  gridFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deliveryIcon: { fontSize: 12 },

  // List
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, gap: 10 },
  listCard: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: SURFACE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  listImage: { width: 100, height: 100 },
  listInfo: { flex: 1, padding: 10, gap: 3 },
  listCategoryLabel: { fontSize: 10, color: TEXT_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5 },
  listTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY },
  listPrice: { fontSize: 15, fontWeight: '700', color: PRIMARY },
  listProvider: { fontSize: 11, color: TEXT_SECONDARY },
  listFooter: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 2 },
  deliveryText: { fontSize: 11, color: SUCCESS },

  // Availability badges
  availBadge: {
    fontSize: 10,
    color: SUCCESS,
    backgroundColor: '#EEF8EE',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontWeight: '600',
    overflow: 'hidden',
  },
  unavailBadge: { color: WARN, backgroundColor: '#FEF9EE' },

  // No photo
  noPhoto: { backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  noPhotoIcon: { fontSize: 28 },

  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { color: TEXT_SECONDARY, fontSize: 14 },
  errorText: { color: '#B00020', fontSize: 15, textAlign: 'center' },
  retryBtn: { backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#FFF', fontWeight: '600' },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: TEXT_SECONDARY, fontSize: 15, textAlign: 'center' },
  loadMoreBtn: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { color: PRIMARY, fontWeight: '600' },
  loadMoreSpinner: { paddingVertical: 16 },

  // Filter modal
  filterModal: { flex: 1, backgroundColor: SURFACE },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  filterTitle: { fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY },
  filterClose: { fontSize: 18, color: TEXT_SECONDARY, padding: 4 },
  filterBody: { flex: 1, padding: 16 },
  filterSectionTitle: { fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY, marginBottom: 10, marginTop: 16 },
  filterCategoryRow: { flexGrow: 0, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginEnd: 8,
  },
  filterChipSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  filterChipText: { fontSize: 13, color: TEXT_PRIMARY },
  filterChipTextSelected: { color: '#FFF' },
  filterPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterPriceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: TEXT_PRIMARY,
  },
  filterPriceSep: { fontSize: 16, color: TEXT_SECONDARY },
  filterToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  filterToggleLabel: { fontSize: 15, color: TEXT_PRIMARY },
  filterToggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#CCC', justifyContent: 'center', padding: 2 },
  filterToggleOn: { backgroundColor: PRIMARY },
  filterThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF', alignSelf: 'flex-start' },
  filterThumbOn: { alignSelf: 'flex-end' },
  filterFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  filterResetBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  filterResetText: { fontSize: 15, color: TEXT_PRIMARY, fontWeight: '600' },
  filterApplyBtn: { flex: 2, paddingVertical: 13, borderRadius: 10, backgroundColor: PRIMARY, alignItems: 'center' },
  filterApplyText: { fontSize: 15, color: '#FFF', fontWeight: '700' },
});
