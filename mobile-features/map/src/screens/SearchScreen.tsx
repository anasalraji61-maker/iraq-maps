/**
 * SearchScreen: full-featured unified search UI.
 *
 * States:
 *  1. Idle      — recent searches list + trending chips
 *  2. Typing    — autocomplete suggestions
 *  3. Results   — unified result cards (place / post / user / event / listing / tour)
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
  SearchSuggestion,
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
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { SearchBar } from '../components/SearchBar';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUGGESTION_MIN_LEN = 2;
const FULL_SEARCH_MIN_LEN = 3;
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
const PRICE_STEPS = [0, 5_000, 25_000, 100_000, 500_000];
const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

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
  | { type: 'SET_FILTER_SHEET'; open: boolean };

interface State {
  query: string;
  screen: ScreenState;
  filters: FilterState;
  filterSheetOpen: boolean;
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
    default:
      return state;
  }
}

const initial: State = {
  query: '',
  screen: { phase: 'idle' },
  filters: emptyFilters,
  filterSheetOpen: false,
};

// ---------------------------------------------------------------------------
// SearchScreen
// ---------------------------------------------------------------------------

export function SearchScreen(): ReactElement {
  const router = useRouter();
  const api = useApi();
  const [state, dispatch] = useReducer(reducer, initial);
  const { query, screen, filters, filterSheetOpen } = state;

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [trending, setTrending] = useState<TrendingSearch[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Load history and trending on mount.
  useEffect(() => {
    void api
      .search.trending({ query: { limit: 10 } })
      .then((r) => r.status === 200 && setTrending(r.body.trending));

    void api.search
      .getHistory({ headers: { authorization: 'Bearer' }, query: {} })
      .then((r) => r.status === 200 && setHistory(r.body.history));
  }, [api]);

  // ---------------------------------------------------------------------------
  // Query handling
  // ---------------------------------------------------------------------------

  const handleQueryChange = useCallback(
    async (q: string) => {
      dispatch({ type: 'SET_QUERY', query: q });

      if (!q.trim()) {
        dispatch({ type: 'SET_PHASE', state: { phase: 'idle' } });
        setSuggestions([]);
        return;
      }

      if (q.length < SUGGESTION_MIN_LEN) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      if (q.length < FULL_SEARCH_MIN_LEN) {
        // Autocomplete only
        dispatch({ type: 'SET_PHASE', state: { phase: 'suggesting', query: q } });
        try {
          const res = await api.search.suggestions({ query: { q, limit: 6 } });
          if (res.status === 200) setSuggestions(res.body.suggestions);
        } catch {
          // Ignore
        }
        return;
      }

      // Full search
      dispatch({ type: 'SET_PHASE', state: { phase: 'searching', query: q } });
      setSuggestions([]);

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
    [api, filters],
  );

  // Re-run search when filters change.
  useEffect(() => {
    if (query.length >= FULL_SEARCH_MIN_LEN) {
      void handleQueryChange(query);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

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
        .search({ query: { q: query, limit: 1 } as any })
        .catch(() => null); // track click
      if (item.type === 'place') {
        router.push(`/places/${item.id}`);
      }
    },
    [api, query, router],
  );

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
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderResultItem({ item }: { item: SearchResultItem }): ReactElement {
    return <ResultCard item={item} onPress={handleResultPress} />;
  }

  function renderSuggestion({ item }: { item: SearchSuggestion }): ReactElement {
    return (
      <Pressable
        style={styles.suggestionRow}
        onPress={() => {
          dispatch({ type: 'SET_QUERY', query: item.text });
          void handleQueryChange(item.text);
        }}
        accessibilityRole="button"
      >
        <RNText style={styles.suggestionIcon} allowFontScaling={false}>
          {RESULT_TYPE_ICONS[item.type]}
        </RNText>
        <RNText style={styles.suggestionText} numberOfLines={1}>
          {item.text}
        </RNText>
        {item.category && (
          <RNText style={styles.suggestionCategory}>
            {t(`categories.${item.category}` as any)}
          </RNText>
        )}
      </Pressable>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = screen.phase === 'searching';

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <SearchBar
          value={query}
          onQueryChange={handleQueryChange}
          onRawChange={(q) => dispatch({ type: 'SET_QUERY', query: q })}
          showBack
          onBack={() => router.back()}
          loading={isLoading}
          expanded
          style={styles.searchBar}
        />
        {/* Filter button */}
        <Pressable
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => dispatch({ type: 'SET_FILTER_SHEET', open: true })}
          accessibilityRole="button"
          accessibilityLabel={t('search.filterBtn')}
        >
          <RNText style={styles.filterIcon} allowFontScaling={false}>
            {'⚙️'}
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
                    void handleQueryChange(t(`categories.${cat}` as any));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(`categories.${cat}` as any)}
                >
                  <RNText style={styles.categoryIcon} allowFontScaling={false}>
                    {CATEGORY_ICONS[cat]}
                  </RNText>
                  <RNText style={styles.categoryLabel} numberOfLines={1}>
                    {t(`categories.${cat}` as any)}
                  </RNText>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Suggestions */}
      {screen.phase === 'suggesting' && (
        <FlatList
          data={suggestions}
          keyExtractor={(s) => `${s.type}-${s.text}`}
          renderItem={renderSuggestion}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <RNText style={styles.emptyText}>{t('search.suggestionsHint')}</RNText>
          }
        />
      )}

      {/* Loading */}
      {screen.phase === 'searching' && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={tokens.colorAccent} />
        </View>
      )}

      {/* Results */}
      {screen.phase === 'results' && (
        <FlatList
          data={screen.items}
          keyExtractor={(item, i) => `${item.type}-${i}`}
          renderItem={renderResultItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsList}
          ListHeaderComponent={
            <RNText style={styles.resultCount}>
              {t('search.resultCount', { count: screen.total })}
            </RNText>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <RNText style={styles.emptyText}>
                {t('search.empty', { query: screen.query })}
              </RNText>
              <RNText style={styles.emptySubText}>{t('search.noResultsSuggest')}</RNText>
            </View>
          }
        />
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
            <RNText style={styles.sheetClose}>{'✕'}</RNText>
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
    backgroundColor: tokens.colorBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: tokens.colorSurface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colorBorder,
  },
  searchBar: {
    flex: 1,
    marginEnd: 8,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colorSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.colorBorder,
  },
  filterBtnActive: {
    borderColor: tokens.colorAccent,
    backgroundColor: `${tokens.colorAccent}22`,
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
    backgroundColor: tokens.colorAccent,
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
    color: tokens.colorContentPrimary,
  },
  sectionAction: {
    fontSize: 13,
    color: tokens.colorAccent,
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
    color: tokens.colorContentPrimary,
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
    backgroundColor: tokens.colorSurface,
    borderWidth: 1,
    borderColor: tokens.colorBorder,
    marginEnd: 2,
  },
  trendingIcon: {
    fontSize: 14,
  },
  trendingText: {
    fontSize: 14,
    color: tokens.colorContentPrimary,
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
    backgroundColor: tokens.colorSurface,
    borderWidth: 1,
    borderColor: tokens.colorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  categoryIcon: {
    fontSize: 22,
  },
  categoryLabel: {
    fontSize: 11,
    color: tokens.colorContentSecondary,
    textAlign: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colorBorder,
  },
  suggestionIcon: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    color: tokens.colorContentPrimary,
  },
  suggestionCategory: {
    fontSize: 12,
    color: tokens.colorContentSecondary,
  },
  resultsList: {
    paddingBottom: 32,
  },
  resultCount: {
    fontSize: 13,
    color: tokens.colorContentSecondary,
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
    borderColor: tokens.colorBorder,
    backgroundColor: tokens.colorSurface,
  },
  resultIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: `${tokens.colorAccent}18`,
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
    color: tokens.colorContentPrimary,
  },
  resultSubtitle: {
    fontSize: 13,
    color: tokens.colorContentSecondary,
  },
  resultDistance: {
    fontSize: 12,
    color: tokens.colorContentTertiary ?? tokens.colorContentSecondary,
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
    color: tokens.colorContentSecondary,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 13,
    color: tokens.colorContentSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: tokens.colorContentSecondary,
    textAlign: 'center',
  },
  // Filter sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: tokens.colorSurface,
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
    borderColor: tokens.colorBorder,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.colorContentPrimary,
  },
  sheetClose: {
    fontSize: 18,
    color: tokens.colorContentSecondary,
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
    color: tokens.colorContentPrimary,
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
    borderColor: tokens.colorBorder,
    backgroundColor: tokens.colorBackground,
  },
  chipActive: {
    borderColor: tokens.colorAccent,
    backgroundColor: `${tokens.colorAccent}18`,
  },
  chipIcon: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    color: tokens.colorContentPrimary,
  },
  chipLabelActive: {
    color: tokens.colorAccent,
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
    backgroundColor: tokens.colorBorder,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: tokens.colorAccent,
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
    color: tokens.colorContentPrimary,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colorBorder,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tokens.colorBorder,
    alignItems: 'center',
  },
  resetText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.colorContentSecondary,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: tokens.colorAccent,
    alignItems: 'center',
  },
  applyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
