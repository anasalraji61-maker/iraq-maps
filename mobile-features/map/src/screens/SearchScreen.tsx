/**
 * SearchScreen: full-featured unified search UI.
 *
 * States:
 *  1. Idle      — recent searches + trending chips + category shortcuts
 *  2. Typing    — multi-source autocomplete dropdown (via SearchBar)
 *  3. Results   — result cards with sort, active-filter chips, map/list toggle, save-alert
 *  4. Filtered  — filter sheet applied
 *
 * RTL-safe, Arabic-first text via t().
 * All external input goes through the shared normalizer before hitting the API.
 */

import type {
  PlaceCategory,
  SearchFilters,
  SearchHistoryEntry,
  SearchResultItem,
  TrendingSearch,
} from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, tokens } from '@iraq-maps/ui';
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
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type {
  AutocompleteItem,
  RecentItem,
  SearchCategory,
  TrendingItem,
} from '../components/SearchBar';
import { SearchBar } from '../components/SearchBar';
import { SearchResultsMap } from '../components/SearchResultsMap';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTOCOMPLETE_DEBOUNCE_MS = 200;
const FULL_SEARCH_MIN_LEN = 2;
const RESULT_TYPE_ICONS: Record<SearchResultItem['type'], string> = {
  place: '📍',
  post: '📝',
  user: '👤',
  event: '🎫',
  listing: '🛒',
  tour: '🗺️',
};
const CATEGORY_ICONS: Record<string, string> = {
  food: '🍽️',
  cafe: '☕',
  lodging: '🏨',
  shopping: '🛒',
  tourism: '🏛️',
  health: '🏥',
  finance: '🏦',
  fuel: '⛽',
  office: '🏢',
  worship: '🕌',
  education: '🎓',
  government: '🏛️',
  transport: '🚌',
  entertainment: '🎭',
};
const CATEGORY_KEYS = Object.keys(CATEGORY_ICONS) as PlaceCategory[];
const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

type SortOption = 'relevance' | 'distance' | 'rating' | 'price';
const SORT_OPTIONS: Array<{ key: SortOption; label: string }> = [
  { key: 'relevance', label: t('advancedSearch.sort_relevance') },
  { key: 'distance', label: t('advancedSearch.sort_distance') },
  { key: 'rating', label: t('advancedSearch.sort_rating') },
  { key: 'price', label: t('advancedSearch.sort_price') },
];

type ViewMode = 'list' | 'map';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type ScreenState =
  | { phase: 'idle' }
  | { phase: 'suggesting'; query: string }
  | { phase: 'searching'; query: string }
  | { phase: 'results'; query: string; items: SearchResultItem[]; total: number }
  | { phase: 'error'; query: string; message: string };

interface FilterState {
  type: SearchResultItem['type'] | null;
  category: PlaceCategory | null;
  radiusM: number | null;
  priceMin: number | null;
  priceMax: number | null;
  ratingMin: number | null;
  openNow: boolean;
}

const emptyFilters: FilterState = {
  type: null,
  category: null,
  radiusM: null,
  priceMin: null,
  priceMax: null,
  ratingMin: null,
  openNow: false,
};

type Action =
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_PHASE'; state: ScreenState }
  | { type: 'SET_FILTERS'; filters: Partial<FilterState> }
  | { type: 'RESET_FILTERS' }
  | { type: 'SET_FILTER_SHEET'; open: boolean }
  | { type: 'SET_SORT'; sort: SortOption }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_CATEGORY'; category: SearchCategory };

interface State {
  query: string;
  screen: ScreenState;
  filters: FilterState;
  filterSheetOpen: boolean;
  sort: SortOption;
  viewMode: ViewMode;
  searchCategory: SearchCategory;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_QUERY':
      return { ...state, query: action.query };
    case 'SET_PHASE':
      return { ...state, screen: action.state };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.filters } };
    case 'RESET_FILTERS':
      return { ...state, filters: emptyFilters };
    case 'SET_FILTER_SHEET':
      return { ...state, filterSheetOpen: action.open };
    case 'SET_SORT':
      return { ...state, sort: action.sort };
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.mode };
    case 'SET_CATEGORY':
      return { ...state, searchCategory: action.category };
    default:
      return state;
  }
}

const initial: State = {
  query: '',
  screen: { phase: 'idle' },
  filters: emptyFilters,
  filterSheetOpen: false,
  sort: 'relevance',
  viewMode: 'list',
  searchCategory: 'all',
};

// ---------------------------------------------------------------------------
// SearchScreen
// ---------------------------------------------------------------------------

export function SearchScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;
  const [state, dispatch] = useReducer(reducer, initial);
  const { query, screen, filters, filterSheetOpen, sort, viewMode, searchCategory } = state;

  const [autocompleteItems, setAutocompleteItems] = useState<AutocompleteItem[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [trending, setTrending] = useState<TrendingSearch[]>([]);
  const [saveAlertLoading, setSaveAlertLoading] = useState(false);
  const [saveAlertDone, setSaveAlertDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);

  // Load history and trending on mount.
  useEffect(() => {
    void api
      .search.trending({ query: { limit: 10 } })
      .then((r: { status: number; body: { trending: TrendingSearch[] } }) => r.status === 200 && setTrending(r.body.trending));

    void api.search
      .getHistory({ headers: { authorization: 'Bearer' }, query: {} })
      .then((r: { status: number; body: { history: SearchHistoryEntry[] } }) => r.status === 200 && setHistory(r.body.history));
  }, [api]);

  // ---------------------------------------------------------------------------
  // Query handling
  // ---------------------------------------------------------------------------

  /** Fetch multi-source autocomplete groups. Debounced to 200 ms. */
  const fetchAutocomplete = useCallback(
    async (q: string) => {
      autocompleteAbortRef.current?.abort();
      autocompleteAbortRef.current = new AbortController();

      try {
        const res = await api.search.autocomplete({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query: { q, limit: 8 } as any,
        });
        if (res.status === 200) {
          // Flatten groups into a single list for SearchBar
          const flat: AutocompleteItem[] = [];
          for (const group of res.body.groups) {
            for (const item of group.items) {
              flat.push({ ...item, groupKey: group.groupKey });
            }
          }
          setAutocompleteItems(flat);
        }
      } catch {
        // Non-fatal — show no suggestions
      }
    },
    [api],
  );

  const handleQueryChange = useCallback(
    async (q: string) => {
      dispatch({ type: 'SET_QUERY', query: q });
      setSaveAlertDone(false);

      if (!q.trim()) {
        dispatch({ type: 'SET_PHASE', state: { phase: 'idle' } });
        setAutocompleteItems([]);
        return;
      }

      // Autocomplete at any length
      if (q.length >= 1) {
        dispatch({ type: 'SET_PHASE', state: { phase: 'suggesting', query: q } });
        void fetchAutocomplete(q);
      }

      if (q.length < FULL_SEARCH_MIN_LEN) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      // Full search
      dispatch({ type: 'SET_PHASE', state: { phase: 'searching', query: q } });

      const searchFilters: Partial<SearchFilters> = {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.radiusM ? { radiusM: filters.radiusM } : {}),
        ...(filters.priceMin != null ? { priceMin: filters.priceMin } : {}),
        ...(filters.priceMax != null ? { priceMax: filters.priceMax } : {}),
        ...(filters.ratingMin != null ? { ratingMin: filters.ratingMin } : {}),
        ...(filters.openNow ? { openNow: filters.openNow } : {}),
      };

      try {
        const res = await api.search.search({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query: { q, limit: 30, ...searchFilters } as any,
        });

        if (res.status === 200) {
          dispatch({
            type: 'SET_PHASE',
            state: {
              phase: 'results',
              query: q,
              items: res.body.items,
              total: res.body.total,
            },
          });
        } else {
          dispatch({
            type: 'SET_PHASE',
            state: { phase: 'error', query: q, message: t('search.networkError') },
          });
        }
      } catch {
        dispatch({
          type: 'SET_PHASE',
          state: { phase: 'error', query: q, message: t('search.networkError') },
        });
      }
    },
    [api, fetchAutocomplete, filters],
  );

  // Re-run search when filters change.
  useEffect(() => {
    if (query.length >= FULL_SEARCH_MIN_LEN) {
      void handleQueryChange(query);
    }
  }, [filters, handleQueryChange, query]);

  const handleHistoryTap = useCallback(
    (entry: SearchHistoryEntry) => {
      dispatch({ type: 'SET_QUERY', query: entry.query });
      void handleQueryChange(entry.query);
    },
    [handleQueryChange],
  );

  const handleTrendingTap = useCallback(
    (t_: TrendingSearch) => {
      dispatch({ type: 'SET_QUERY', query: t_.query });
      void handleQueryChange(t_.query);
    },
    [handleQueryChange],
  );

  const handleClearHistory = useCallback(async () => {
    await api.search.deleteHistory({ headers: { authorization: 'Bearer' }, body: {} });
    setHistory([]);
  }, [api]);

  const handleResultPress = useCallback(
    (item: SearchResultItem) => {
      void api.search
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .search({ query: { q: query, limit: 1 } as any })
        .catch(() => null); // track click
      if (item.type === 'place') {
        router.push(`/places/${item.id}`);
      }
    },
    [api, query, router],
  );

  const handleSaveAlert = useCallback(async () => {
    if (saveAlertDone || screen.phase !== 'results') return;
    setSaveAlertLoading(true);
    try {
      await api.search.saveAlert({
        headers: { authorization: 'Bearer' },
        body: { query },
      });
      setSaveAlertDone(true);
    } catch {
      // Ignore
    } finally {
      setSaveAlertLoading(false);
    }
  }, [api, query, saveAlertDone, screen.phase]);

  // ---------------------------------------------------------------------------
  // Active filter count badge
  // ---------------------------------------------------------------------------
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.type) n++;
    if (filters.category) n++;
    if (filters.radiusM) n++;
    if (filters.priceMin != null || filters.priceMax != null) n++;
    if (filters.ratingMin != null) n++;
    if (filters.openNow) n++;
    return n;
  }, [filters]);

  // ---------------------------------------------------------------------------
  // Sorted items
  // ---------------------------------------------------------------------------
  const sortedItems = useMemo(() => {
    if (screen.phase !== 'results') return [];
    const items = [...screen.items];
    switch (sort) {
      case 'distance':
        return items.sort((a, b) => {
          const da = a.type === 'place' ? (a.distanceM ?? Infinity) : Infinity;
          const db = b.type === 'place' ? (b.distanceM ?? Infinity) : Infinity;
          return da - db;
        });
      case 'rating':
        return items.sort((a, b) => {
          const ra = a.type === 'place' ? (a.rating ?? 0) : 0;
          const rb = b.type === 'place' ? (b.rating ?? 0) : 0;
          return rb - ra;
        });
      case 'price':
        return items.sort((a, b) => {
          const pa = a.type === 'listing' ? (a.priceIqd ?? Infinity) : Infinity;
          const pb = b.type === 'listing' ? (b.priceIqd ?? Infinity) : Infinity;
          return pa - pb;
        });
      default:
        return items; // server-side relevance
    }
  }, [screen, sort]);

  // ---------------------------------------------------------------------------
  // Active filter chips
  // ---------------------------------------------------------------------------
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (filters.type) {
      chips.push({
        key: 'type',
        label: t(`search.type${filters.type.charAt(0).toUpperCase() + filters.type.slice(1)}` as Parameters<typeof t>[0]),
        onRemove: () => dispatch({ type: 'SET_FILTERS', filters: { type: null } }),
      });
    }
    if (filters.category) {
      chips.push({
        key: 'category',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        label: t(`categories.${filters.category}` as any),
        onRemove: () => dispatch({ type: 'SET_FILTERS', filters: { category: null } }),
      });
    }
    if (filters.radiusM) {
      const km = filters.radiusM >= 1000 ? t('advancedSearch.radiusKm', { n: filters.radiusM / 1000 }) : t('advancedSearch.radiusM', { n: filters.radiusM });
      chips.push({
        key: 'radius',
        label: km,
        onRemove: () => dispatch({ type: 'SET_FILTERS', filters: { radiusM: null } }),
      });
    }
    if (filters.ratingMin != null) {
      chips.push({
        key: 'rating',
        label: `${'★'.repeat(filters.ratingMin)}+`,
        onRemove: () => dispatch({ type: 'SET_FILTERS', filters: { ratingMin: null } }),
      });
    }
    if (filters.openNow) {
      chips.push({
        key: 'openNow',
        label: t('search.filterOpenNow'),
        onRemove: () => dispatch({ type: 'SET_FILTERS', filters: { openNow: false } }),
      });
    }
    return chips;
  }, [filters]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderResultItem({ item }: { item: SearchResultItem }): ReactElement {
    return <ResultCard item={item} onPress={handleResultPress} />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = screen.phase === 'searching';

  // Convert history to RecentItem[] for SearchBar
  const recentItems: RecentItem[] = history.map((h) => ({ id: h.id, query: h.query }));
  // Convert trending to TrendingItem[] for SearchBar
  const trendingItems: TrendingItem[] = trending.map((tr) => ({
    query: tr.query,
    trend: tr.trend,
  }));

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <SearchBar
          value={query}
          onQueryChange={handleQueryChange}
          onRawChange={(q) => dispatch({ type: 'SET_QUERY', query: q })}
          suggestions={autocompleteItems}
          recentSearches={recentItems}
          trendingSearches={trendingItems}
          onSuggestionSelect={(item) => {
            dispatch({ type: 'SET_QUERY', query: item.text });
            void handleQueryChange(item.text);
          }}
          onRecentSelect={(item) => {
            dispatch({ type: 'SET_QUERY', query: item.query });
            void handleQueryChange(item.query);
          }}
          onTrendingSelect={(q) => {
            dispatch({ type: 'SET_QUERY', query: q });
            void handleQueryChange(q);
          }}
          activeCategory={searchCategory}
          onCategoryChange={(cat) => dispatch({ type: 'SET_CATEGORY', category: cat })}
          showBack
          onBack={() => router.back()}
          loading={isLoading}
          expanded
          debounceMs={AUTOCOMPLETE_DEBOUNCE_MS}
          hideDropdown={screen.phase === 'results' || screen.phase === 'error'}
          style={styles.searchBarWrap}
        />
        {/* Filter button */}
        <Pressable
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => dispatch({ type: 'SET_FILTER_SHEET', open: true })}
          accessibilityRole="button"
          accessibilityLabel={t('search.filterBtn')}
        >
          <RNText style={styles.filterIcon} allowFontScaling={false}>
            {t('search.filterIcon')}
          </RNText>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <RNText style={styles.filterBadgeText}>{activeFilterCount}</RNText>
            </View>
          )}
        </Pressable>
      </View>

      {/* Body */}
      {screen.phase === 'idle' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Recent searches */}
          {history.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <RNText style={styles.sectionTitle}>{t('search.recentTitle')}</RNText>
                <Pressable onPress={handleClearHistory} accessibilityRole="button">
                  <RNText style={styles.sectionAction}>{t('search.clearRecent')}</RNText>
                </Pressable>
              </View>
              {history.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={styles.historyRow}
                  onPress={() => handleHistoryTap(entry)}
                  accessibilityRole="button"
                >
                  <RNText style={styles.historyIcon} allowFontScaling={false}>
                    {'🕐'}
                  </RNText>
                  <RNText style={styles.historyText} numberOfLines={1}>
                    {entry.query}
                  </RNText>
                </Pressable>
              ))}
            </View>
          )}

          {/* Trending */}
          {trending.length > 0 && (
            <View style={styles.section}>
              <RNText style={styles.sectionTitle}>{t('search.trendingTitle')}</RNText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trendingRow}
                keyboardShouldPersistTaps="handled"
              >
                {trending.map((tr) => (
                  <Pressable
                    key={tr.query}
                    style={styles.trendingChip}
                    onPress={() => handleTrendingTap(tr)}
                    accessibilityRole="button"
                  >
                    <RNText style={styles.trendingIcon} allowFontScaling={false}>
                      {tr.trend === 'rising' ? '🔥' : '🔎'}
                    </RNText>
                    <RNText style={styles.trendingText} numberOfLines={1}>
                      {tr.query}
                    </RNText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Category shortcuts */}
          <View style={styles.section}>
            <RNText style={styles.sectionTitle}>{t('search.categoryChipsTitle')}</RNText>
            <View style={styles.categoryGrid}>
              {CATEGORY_KEYS.map((cat) => (
                <Pressable
                  key={cat}
                  style={styles.categoryChip}
                  onPress={() => {
                    dispatch({ type: 'SET_FILTERS', filters: { category: cat } });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    void handleQueryChange(t(`categories.${cat}` as any));
                  }}
                  accessibilityRole="button"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  accessibilityLabel={t(`categories.${cat}` as any)}
                >
                  <RNText style={styles.categoryIcon} allowFontScaling={false}>
                    {CATEGORY_ICONS[cat]}
                  </RNText>
                  <RNText style={styles.categoryLabel} numberOfLines={1}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {t(`categories.${cat}` as any)}
                  </RNText>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Loading */}
      {screen.phase === 'searching' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
        </View>
      )}

      {/* Suggesting — autocomplete is now shown in the SearchBar dropdown, but keep body blank */}
      {screen.phase === 'suggesting' && (
        <View style={styles.centerContent}>
          <RNText style={styles.emptyText}>{t('search.suggestionsHint')}</RNText>
        </View>
      )}

      {/* Results */}
      {screen.phase === 'results' && (
        <View style={styles.resultsContainer}>
          {/* Result controls row: count + sort + view toggle */}
          <View style={styles.resultsControls}>
            <RNText style={styles.resultCount}>
              {t('search.resultCount', { count: screen.total })}
            </RNText>
            {/* Sort chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortRow}
              keyboardShouldPersistTaps="handled"
            >
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.sortChip, sort === opt.key && styles.sortChipActive]}
                  onPress={() => dispatch({ type: 'SET_SORT', sort: opt.key })}
                  accessibilityRole="button"
                >
                  <RNText
                    style={[styles.sortChipLabel, sort === opt.key && styles.sortChipLabelActive]}
                  >
                    {opt.label}
                  </RNText>
                </Pressable>
              ))}
            </ScrollView>
            {/* Map / list toggle */}
            <View style={styles.viewToggle}>
              <Pressable
                style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
                onPress={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'list' })}
                accessibilityRole="button"
                accessibilityLabel={t('advancedSearch.viewList')}
              >
                <RNText style={styles.viewToggleIcon} allowFontScaling={false}>{t('advancedSearch.viewListIcon')}</RNText>
              </Pressable>
              <Pressable
                style={[styles.viewToggleBtn, viewMode === 'map' && styles.viewToggleBtnActive]}
                onPress={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'map' })}
                accessibilityRole="button"
                accessibilityLabel={t('advancedSearch.viewMap')}
              >
                <RNText style={styles.viewToggleIcon} allowFontScaling={false}>{'🗺'}</RNText>
              </Pressable>
            </View>
          </View>

          {/* Active filter chips */}
          {activeFilterChips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeFilterRow}
              keyboardShouldPersistTaps="handled"
            >
              {activeFilterChips.map((chip) => (
                <Pressable
                  key={chip.key}
                  style={styles.activeFilterChip}
                  onPress={chip.onRemove}
                  accessibilityRole="button"
                >
                  <RNText style={styles.activeFilterChipText}>{chip.label}</RNText>
                  <RNText style={styles.activeFilterChipRemove} allowFontScaling={false}>
                    {t('advancedSearch.filterRemove')}
                  </RNText>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Save search as alert */}
          <View style={styles.saveAlertRow}>
            <Pressable
              style={[styles.saveAlertBtn, saveAlertDone && styles.saveAlertBtnDone]}
              onPress={handleSaveAlert}
              disabled={saveAlertLoading || saveAlertDone}
              accessibilityRole="button"
            >
              {saveAlertLoading ? (
                <ActivityIndicator size="small" color={tokens.color.primary} />
              ) : (
                <RNText style={styles.saveAlertText}>
                  {saveAlertDone ? t('advancedSearch.saveAlertDone') : t('advancedSearch.saveAlertSave')}
                </RNText>
              )}
            </Pressable>
          </View>

          {/* List view */}
          {viewMode === 'list' && (
            <FlatList
              data={sortedItems}
              keyExtractor={(item, i) => `${item.type}-${i}`}
              renderItem={renderResultItem}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.resultsList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <RNText style={styles.emptyText}>
                    {t('search.empty', { query: screen.query })}
                  </RNText>
                  <RNText style={styles.emptySubText}>{t('search.noResultsSuggest')}</RNText>
                  {trending.length > 0 && (
                    <View style={styles.emptyTrending}>
                      <RNText style={styles.emptySubText}>{t('search.trendingTitle')}</RNText>
                      <View style={styles.trendingRow}>
                        {trending.slice(0, 4).map((tr) => (
                          <Pressable
                            key={tr.query}
                            style={styles.trendingChip}
                            onPress={() => void handleQueryChange(tr.query)}
                            accessibilityRole="button"
                          >
                            <RNText style={styles.trendingText}>{tr.query}</RNText>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              }
            />
          )}

          {/* Map view */}
          {viewMode === 'map' && (
            <SearchResultsMap
              results={sortedItems.filter(
                (i): i is (typeof sortedItems)[number] & { type: 'place' } => i.type === 'place',
              )}
              onResultPress={handleResultPress}
            />
          )}
        </View>
      )}

      {/* Error */}
      {screen.phase === 'error' && (
        <View style={styles.centerContent}>
          <RNText style={styles.errorText}>{screen.message}</RNText>
          <Button
            label={t('actions.retry')}
            onPress={() => void handleQueryChange(query)}
            variant="secondary"
          />
        </View>
      )}

      {/* Filter sheet */}
      <FilterSheet
        visible={filterSheetOpen}
        filters={filters}
        onApply={(f) => {
          dispatch({ type: 'SET_FILTERS', filters: f });
          dispatch({ type: 'SET_FILTER_SHEET', open: false });
        }}
        onReset={() => {
          dispatch({ type: 'RESET_FILTERS' });
          dispatch({ type: 'SET_FILTER_SHEET', open: false });
        }}
        onClose={() => dispatch({ type: 'SET_FILTER_SHEET', open: false })}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// ResultCard
// ---------------------------------------------------------------------------

function ResultCard({
  item,
  onPress,
}: {
  item: SearchResultItem;
  onPress: (item: SearchResultItem) => void;
}): ReactElement {
  const icon = RESULT_TYPE_ICONS[item.type];

  const title = (() => {
    switch (item.type) {
      case 'place':
        return item.name;
      case 'post':
        return item.excerpt;
      case 'user':
        return item.displayName;
      case 'event':
        return item.title;
      case 'listing':
        return item.title;
      case 'tour':
        return item.title;
    }
  })();

  const subtitle = (() => {
    switch (item.type) {
      case 'place':
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return item.category ? t(`categories.${item.category}` as any) : null;
      case 'post':
        return item.authorName;
      case 'user':
        return item.bio ?? null;
      case 'event':
        return item.venueName;
      case 'listing':
        return item.priceIqd != null
          ? `${item.priceIqd.toLocaleString('ar-IQ')} ${t('search.currencyIqd')}`
          : null;
      case 'tour':
        return item.durationMinutes != null
          ? t('search.tourDuration', { n: item.durationMinutes })
          : null;
    }
  })();

  return (
    <Pressable
      style={styles.resultCard}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.resultIconWrap}>
        <RNText style={styles.resultIcon} allowFontScaling={false}>
          {item.type === 'place' && item.category
            ? (CATEGORY_ICONS[item.category] ?? icon)
            : icon}
        </RNText>
      </View>
      <View style={styles.resultBody}>
        <RNText style={styles.resultTitle} numberOfLines={2}>
          {title}
        </RNText>
        {subtitle && (
          <RNText style={styles.resultSubtitle} numberOfLines={1}>
            {subtitle}
          </RNText>
        )}
        {item.type === 'place' && item.distanceM != null && (
          <RNText style={styles.resultDistance}>
            {item.distanceM < 1000
              ? `${Math.round(item.distanceM)} ${t('distance.m', { n: '' }).trim()}`
              : `${(item.distanceM / 1000).toFixed(1)} ${t('distance.km', { n: '' }).trim()}`}
          </RNText>
        )}
        {item.type === 'place' && item.rating != null && (
          <RNText style={styles.resultRating}>
            {'★'.repeat(Math.round(item.rating))}
            {'☆'.repeat(5 - Math.round(item.rating))}
            {` ${item.rating.toFixed(1)}`}
          </RNText>
        )}
      </View>
      {item.type === 'place' && item.openNow != null && (
        <View
          style={[
            styles.openBadge,
            item.openNow ? styles.openBadgeOpen : styles.openBadgeClosed,
          ]}
        >
          <RNText style={styles.openBadgeText}>
            {item.openNow ? t('markerSheet.openBadge') : t('markerSheet.closedBadge')}
          </RNText>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// FilterSheet
// ---------------------------------------------------------------------------

interface FilterSheetProps {
  visible: boolean;
  filters: FilterState;
  onApply: (filters: Partial<FilterState>) => void;
  onReset: () => void;
  onClose: () => void;
}

function FilterSheet({
  visible,
  filters,
  onApply,
  onReset,
  onClose,
}: FilterSheetProps): ReactElement {
  const [local, setLocal] = useState<FilterState>(filters);

  useEffect(() => {
    if (visible) setLocal(filters);
  }, [visible, filters]);

  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    setLocal((f) => ({ ...f, [key]: value }));

  const TYPE_OPTIONS: Array<{ key: SearchResultItem['type']; label: string; icon: string }> = [
    { key: 'place', label: t('search.typePlace'), icon: '📍' },
    { key: 'post', label: t('search.typePost'), icon: '📝' },
    { key: 'user', label: t('search.typeUser'), icon: '👤' },
    { key: 'event', label: t('search.typeEvent'), icon: '🎫' },
    { key: 'listing', label: t('search.typeListing'), icon: '🛒' },
    { key: 'tour', label: t('search.typeTour'), icon: '🗺️' },
  ];

  const RADIUS_OPTIONS = [500, 1000, 2000, 5000, 10_000];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <RNText style={styles.sheetTitle}>{t('search.filterTitle')}</RNText>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('actions.close')}>
            <RNText style={styles.sheetClose}>{t('search.clearIcon')}</RNText>
          </Pressable>
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
          {/* Result type chips */}
          <RNText style={styles.filterGroupLabel}>{t('search.filterTypeLabel')}</RNText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {TYPE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.chip, local.type === opt.key && styles.chipActive]}
                onPress={() => update('type', local.type === opt.key ? null : opt.key)}
                accessibilityRole="button"
              >
                <RNText style={styles.chipIcon} allowFontScaling={false}>{opt.icon}</RNText>
                <RNText style={[styles.chipLabel, local.type === opt.key && styles.chipLabelActive]}>
                  {opt.label}
                </RNText>
              </Pressable>
            ))}
          </ScrollView>

          {/* Category chips (only relevant when type === place or null) */}
          {(local.type === 'place' || local.type === null) && (
            <>
              <RNText style={styles.filterGroupLabel}>{t('search.categoryChipsTitle')}</RNText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {CATEGORY_KEYS.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.chip, local.category === cat && styles.chipActive]}
                    onPress={() => update('category', local.category === cat ? null : cat)}
                    accessibilityRole="button"
                  >
                    <RNText style={styles.chipIcon} allowFontScaling={false}>
                      {CATEGORY_ICONS[cat]}
                    </RNText>
                    <RNText style={[styles.chipLabel, local.category === cat && styles.chipLabelActive]}>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {t(`categories.${cat}` as any)}
                    </RNText>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {/* Distance */}
          <RNText style={styles.filterGroupLabel}>{t('search.filterRadiusLabel')}</RNText>
          <View style={styles.chipRow}>
            {RADIUS_OPTIONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, local.radiusM === r && styles.chipActive]}
                onPress={() => update('radiusM', local.radiusM === r ? null : r)}
                accessibilityRole="button"
              >
                <RNText style={[styles.chipLabel, local.radiusM === r && styles.chipLabelActive]}>
                  {r < 1000 ? `${r} ${t('distance.m', { n: '' }).trim()}` : `${r / 1000} ${t('distance.km', { n: '' }).trim()}`}
                </RNText>
              </Pressable>
            ))}
          </View>

          {/* Rating */}
          <RNText style={styles.filterGroupLabel}>{t('search.filterRatingLabel')}</RNText>
          <View style={styles.chipRow}>
            {RATING_OPTIONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, local.ratingMin === r && styles.chipActive]}
                onPress={() => update('ratingMin', local.ratingMin === r ? null : r)}
                accessibilityRole="button"
              >
                <RNText style={[styles.chipLabel, local.ratingMin === r && styles.chipLabelActive]}>
                  {'★'.repeat(r)} {r}+
                </RNText>
              </Pressable>
            ))}
          </View>

          {/* Open now toggle */}
          <Pressable
            style={styles.toggleRow}
            onPress={() => update('openNow', !local.openNow)}
            accessibilityRole="switch"
            accessibilityState={{ checked: local.openNow }}
          >
            <View style={[styles.toggle, local.openNow && styles.toggleOn]}>
              <View style={[styles.toggleThumb, local.openNow && styles.toggleThumbOn]} />
            </View>
            <RNText style={styles.toggleLabel}>{t('search.filterOpenNow')}</RNText>
          </Pressable>
        </ScrollView>

        {/* Footer actions */}
        <View style={styles.sheetFooter}>
          <Pressable style={styles.resetBtn} onPress={onReset} accessibilityRole="button">
            <RNText style={styles.resetText}>{t('search.filterReset')}</RNText>
          </Pressable>
          <Pressable
            style={styles.applyBtn}
            onPress={() => onApply(local)}
            accessibilityRole="button"
          >
            <RNText style={styles.applyText}>{t('search.filterApply')}</RNText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  searchBarWrap: {
    flex: 1,
    marginEnd: 8,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  filterBtnActive: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}22`,
  },
  filterIcon: {
    fontSize: 20,
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    end: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.text,
  },
  sectionAction: {
    fontSize: 13,
    color: tokens.color.primary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  historyIcon: {
    fontSize: 16,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: tokens.color.text,
  },
  trendingRow: {
    paddingTop: 8,
    gap: 8,
  },
  trendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginEnd: 2,
  },
  trendingIcon: {
    fontSize: 14,
  },
  trendingText: {
    fontSize: 14,
    color: tokens.color.text,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 8,
  },
  categoryChip: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  categoryIcon: {
    fontSize: 22,
  },
  categoryLabel: {
    fontSize: 11,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  suggestionIcon: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: tokens.color.text,
  },
  suggestionCategory: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
  resultsList: {
    paddingBottom: 32,
  },
  resultCount: {
    fontSize: 13,
    color: tokens.color.textMuted,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  resultIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${tokens.color.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultIcon: {
    fontSize: 20,
  },
  resultBody: {
    flex: 1,
    gap: 2,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
  },
  resultSubtitle: {
    fontSize: 13,
    color: tokens.color.textMuted,
  },
  resultDistance: {
    fontSize: 12,
    color: tokens.color.textMuted ?? tokens.color.textMuted,
    marginTop: 2,
  },
  resultRating: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 2,
  },
  openBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  openBadgeOpen: {
    backgroundColor: '#D1FAE5',
  },
  openBadgeClosed: {
    backgroundColor: '#FEE2E2',
  },
  openBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 13,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: tokens.color.textMuted,
    textAlign: 'center',
  },
  // Filter sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.color.text,
  },
  sheetClose: {
    fontSize: 18,
    color: tokens.color.textMuted,
    padding: 4,
  },
  sheetScroll: {
    flexShrink: 1,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
  filterGroupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.text,
    marginTop: 16,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.bg,
  },
  chipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}18`,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    color: tokens.color.text,
  },
  chipLabelActive: {
    color: tokens.color.primary,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: tokens.color.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontSize: 15,
    color: tokens.color.text,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
  },
  resetText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.textMuted,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
  },
  applyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  // Results view
  resultsContainer: {
    flex: 1,
  },
  resultsControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.bg,
  },
  sortChipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: `${tokens.color.primary}18`,
  },
  sortChipLabel: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
  sortChipLabelActive: {
    color: tokens.color.primary,
    fontWeight: '700',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  viewToggleBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.bg,
  },
  viewToggleBtnActive: {
    backgroundColor: tokens.color.primary,
  },
  viewToggleIcon: {
    fontSize: 14,
  },
  activeFilterRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: tokens.color.surface,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: `${tokens.color.primary}18`,
    borderWidth: 1,
    borderColor: tokens.color.primary,
  },
  activeFilterChipText: {
    fontSize: 12,
    color: tokens.color.primary,
    fontWeight: '600',
  },
  activeFilterChipRemove: {
    fontSize: 11,
    color: tokens.color.primary,
  },
  saveAlertRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  saveAlertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    alignSelf: 'flex-start',
  },
  saveAlertBtnDone: {
    borderColor: '#10B981',
    backgroundColor: '#D1FAE5',
  },
  saveAlertText: {
    fontSize: 13,
    color: tokens.color.primary,
    fontWeight: '600',
  },
  emptyTrending: {
    marginTop: 16,
    alignItems: 'center',
    gap: 10,
  },
});
