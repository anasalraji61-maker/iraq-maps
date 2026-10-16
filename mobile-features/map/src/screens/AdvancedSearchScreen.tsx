/**
 * AdvancedSearchScreen – power search with full filter panel, saved presets,
 * recent searches, and results displayed on map or list.
 *
 * Route: map/search/advanced
 */

import type { PlaceCategory, SearchFilters } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Button, Screen, Sheet } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIMARY = '#1976D2';
const SURFACE = '#FFFFFF';
const DIVIDER = '#E0E0E0';
const CHIP_BG = '#F5F5F5';
const CHIP_SELECTED = '#E3F2FD';
const CHIP_SELECTED_BORDER = '#1976D2';
const ACCENT = '#F5A623';
const DANGER = '#E53935';

const DISTANCE_STEPS = [0.5, 1, 2, 5, 10, 20, 50];
const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;
const PRICE_OPTIONS = ['free', 'cheap', 'moderate', 'expensive'] as const;
const SORT_OPTIONS = [
  'relevance',
  'distance',
  'rating',
  'newest',
  'most_reviewed',
] as const;
const CUISINE_OPTIONS = [
  'iraqi',
  'arabic',
  'grills',
  'seafood',
  'pizza',
  'fastfood',
  'asian',
  'western',
  'vegetarian',
  'desserts',
] as const;

const AMENITY_OPTIONS = [
  { key: 'openNow', icon: '🕐' },
  { key: 'acceptsCards', icon: '💳' },
  { key: 'hasParking', icon: '🅿️' },
  { key: 'hasWifi', icon: '📶' },
  { key: 'hasDelivery', icon: '🛵' },
] as const;

type AmenityKey = (typeof AMENITY_OPTIONS)[number]['key'];
type SortOption = (typeof SORT_OPTIONS)[number];
type PriceOption = (typeof PRICE_OPTIONS)[number];
type CuisineOption = (typeof CUISINE_OPTIONS)[number];

const CATEGORY_LIST: PlaceCategory[] = [
  'food',
  'cafe',
  'lodging',
  'shopping',
  'tourism',
  'health',
  'finance',
  'education',
  'entertainment',
  'transport',
  'fuel',
  'worship',
  'government',
  'office',
];

export interface AdvancedFilters {
  categories: PlaceCategory[];
  minRating: number | null;
  distanceKm: number;
  priceRange: PriceOption[];
  amenities: Record<AmenityKey, boolean>;
  sortBy: SortOption;
  cuisines: CuisineOption[];
  nearMode: 'current' | 'custom' | 'address';
  customLat?: number;
  customLng?: number;
  customAddress?: string;
}

const DEFAULT_FILTERS: AdvancedFilters = {
  categories: [],
  minRating: null,
  distanceKm: 5,
  priceRange: [],
  amenities: {
    openNow: false,
    acceptsCards: false,
    hasParking: false,
    hasWifi: false,
    hasDelivery: false,
  },
  sortBy: 'relevance',
  cuisines: [],
  nearMode: 'current',
};

interface SavedPreset {
  id: string;
  name: string;
  filters: AdvancedFilters;
  createdAt: string;
}

interface RecentSearch {
  query: string;
  filters: Partial<AdvancedFilters>;
  searchedAt: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdvancedSearchScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('list');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<unknown[]>([]);
  const [resultCount, setResultCount] = useState(0);

  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [savePresetVisible, setSavePresetVisible] = useState(false);
  const [presetName, setPresetName] = useState('');

  // Section collapse state
  const [sections, setSections] = useState({
    categories: true,
    distance: false,
    rating: false,
    price: false,
    amenities: true,
    cuisine: false,
    sort: false,
    near: false,
  });

  const searchInputRef = useRef<TextInput>(null);

  // ── Load saved presets ────────────────────────────────────────────────────

  useEffect(() => {
    api
      .get('/v1/search/presets')
      .then((res: { status: number; body: unknown }) => {
        if (res.status === 200) {
          setSavedPresets((res.body as { presets: SavedPreset[] }).presets ?? []);
        }
      })
      .catch(() => null);

    api
      .get('/v1/search/history')
      .then((res: { status: number; body: unknown }) => {
        if (res.status === 200) {
          const history = (res.body as { history: Array<{ query: string; filters: unknown; searchedAt: string }> }).history ?? [];
          setRecentSearches(
            history.map((h) => ({
              query: h.query,
              filters: (h.filters ?? {}) as Partial<AdvancedFilters>,
              searchedAt: h.searchedAt,
            })),
          );
        }
      })
      .catch(() => null);
  }, [api]);

  // ── Toggle section ────────────────────────────────────────────────────────

  const toggleSection = useCallback((key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Filter updaters ───────────────────────────────────────────────────────

  const toggleCategory = useCallback((cat: PlaceCategory) => {
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));
  }, []);

  const toggleCuisine = useCallback((c: CuisineOption) => {
    setFilters((f) => ({
      ...f,
      cuisines: f.cuisines.includes(c)
        ? f.cuisines.filter((x) => x !== c)
        : [...f.cuisines, c],
    }));
  }, []);

  const togglePrice = useCallback((p: PriceOption) => {
    setFilters((f) => ({
      ...f,
      priceRange: f.priceRange.includes(p)
        ? f.priceRange.filter((x) => x !== p)
        : [...f.priceRange, p],
    }));
  }, []);

  const toggleAmenity = useCallback((key: AmenityKey) => {
    setFilters((f) => ({
      ...f,
      amenities: { ...f.amenities, [key]: !f.amenities[key] },
    }));
  }, []);

  const setRating = useCallback((r: number | null) => {
    setFilters((f) => ({ ...f, minRating: f.minRating === r ? null : r }));
  }, []);

  const setDistance = useCallback((km: number) => {
    setFilters((f) => ({ ...f, distanceKm: km }));
  }, []);

  const setSort = useCallback((s: SortOption) => {
    setFilters((f) => ({ ...f, sortBy: s }));
  }, []);

  const setNearMode = useCallback((mode: AdvancedFilters['nearMode']) => {
    setFilters((f) => ({ ...f, nearMode: mode }));
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ── Search ────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const apiFilters: Partial<SearchFilters> = {
        type: 'place',
        ...(filters.categories.length === 1
          ? { category: filters.categories[0] }
          : {}),
        radiusM: filters.distanceKm * 1000,
        ...(filters.minRating != null ? { ratingMin: filters.minRating } : {}),
        openNow: filters.amenities.openNow,
      };

      const res = await api.get('/v1/search', {
        params: { q: query, ...apiFilters, limit: 30 },
      });

      if (res.status === 200) {
        const body = res.body as { items: unknown[]; total: number };
        setResults(body.items);
        setResultCount(body.total);
      }
    } catch {
      // handled via empty results
    } finally {
      setLoading(false);
    }
  }, [query, filters, api]);

  // ── Save preset ───────────────────────────────────────────────────────────

  const savePreset = useCallback(async () => {
    if (!presetName.trim()) return;
    try {
      const res = await api.post('/v1/search/presets', {
        body: { name: presetName.trim(), filters },
      });
      if (res.status === 201) {
        const preset = (res.body as { preset: SavedPreset }).preset;
        setSavedPresets((p) => [preset, ...p]);
      }
    } catch {
      // ignore
    } finally {
      setSavePresetVisible(false);
      setPresetName('');
    }
  }, [presetName, filters, api]);

  const applyPreset = useCallback((preset: SavedPreset) => {
    setFilters(preset.filters);
  }, []);

  const deletePreset = useCallback(
    async (id: string) => {
      setSavedPresets((p) => p.filter((x) => x.id !== id));
      await api.delete(`/v1/search/presets/${id}`).catch(() => null);
    },
    [api],
  );

  const applyRecent = useCallback((r: RecentSearch) => {
    setQuery(r.query);
    if (r.filters.categories) {
      setFilters((f) => ({
        ...f,
        ...(r.filters as Partial<AdvancedFilters>),
      }));
    }
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────

  const SectionHeader = ({
    titleKey,
    sectionKey,
  }: {
    titleKey: string;
    sectionKey: keyof typeof sections;
  }): ReactElement => (
    <TouchableOpacity
      style={styles.sectionHeader}
      onPress={() => toggleSection(sectionKey)}
      accessibilityRole="button"
    >
      <RNText style={styles.sectionTitle}>{titleKey}</RNText>
      <RNText style={styles.sectionChevron}>
        {sections[sectionKey] ? '▲' : '▼'}
      </RNText>
    </TouchableOpacity>
  );

  const activeFilterCount =
    filters.categories.length +
    filters.priceRange.length +
    filters.cuisines.length +
    Object.values(filters.amenities).filter(Boolean).length +
    (filters.minRating != null ? 1 : 0) +
    (filters.distanceKm !== DEFAULT_FILTERS.distanceKm ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('search.backBtn')}
        >
          <RNText style={styles.backIcon}>{'→'}</RNText>
        </TouchableOpacity>
        <RNText style={styles.headerTitle}>{t('advancedSearch.title')}</RNText>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
            <RNText style={styles.resetBtnText}>
              {t('advancedSearch.reset')} ({activeFilterCount})
            </RNText>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search input */}
        <View style={styles.searchRow}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            placeholderTextColor="#9E9E9E"
            returnKeyType="search"
            onSubmitEditing={doSearch}
            accessibilityLabel={t('search.a11yLabel')}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={styles.clearBtn}
              accessibilityLabel={t('search.clearInput')}
            >
              <RNText style={styles.clearIcon}>{t('search.clearIcon')}</RNText>
            </TouchableOpacity>
          )}
        </View>

        {/* View mode toggle */}
        <View style={styles.viewToggleRow}>
          <TouchableOpacity
            style={[
              styles.viewToggleBtn,
              viewMode === 'list' && styles.viewToggleBtnActive,
            ]}
            onPress={() => setViewMode('list')}
          >
            <RNText
              style={[
                styles.viewToggleText,
                viewMode === 'list' && styles.viewToggleTextActive,
              ]}
            >
              {t('advancedSearch.viewList')}
            </RNText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewToggleBtn,
              viewMode === 'map' && styles.viewToggleBtnActive,
            ]}
            onPress={() => setViewMode('map')}
          >
            <RNText
              style={[
                styles.viewToggleText,
                viewMode === 'map' && styles.viewToggleTextActive,
              ]}
            >
              {t('advancedSearch.viewMap')}
            </RNText>
          </TouchableOpacity>
        </View>

        {/* Saved presets */}
        {savedPresets.length > 0 && (
          <View style={styles.section}>
            <RNText style={styles.sectionTitle}>
              {t('advancedSearch.savedPresets')}
            </RNText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {savedPresets.map((preset) => (
                  <View key={preset.id} style={styles.presetChip}>
                    <TouchableOpacity
                      onPress={() => applyPreset(preset)}
                      style={styles.presetChipInner}
                    >
                      <RNText style={styles.presetChipText}>
                        {preset.name}
                      </RNText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deletePreset(preset.id)}
                      style={styles.presetDelete}
                      accessibilityLabel={t('advancedSearch.deletePreset')}
                    >
                      <RNText style={styles.presetDeleteIcon}>✕</RNText>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Recent searches */}
        {recentSearches.length > 0 && query.length === 0 && (
          <View style={styles.section}>
            <RNText style={styles.sectionTitle}>
              {t('search.recentTitle')}
            </RNText>
            {recentSearches.slice(0, 5).map((r, i) => (
              <TouchableOpacity
                key={i}
                style={styles.recentRow}
                onPress={() => applyRecent(r)}
              >
                <RNText style={styles.recentIcon}>🕐</RNText>
                <RNText style={styles.recentQuery} numberOfLines={1}>
                  {r.query}
                </RNText>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Near selector ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.nearTitle')}
            sectionKey="near"
          />
          {sections.near && (
            <View style={styles.nearOptions}>
              {(['current', 'custom', 'address'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.nearOption,
                    filters.nearMode === mode && styles.nearOptionActive,
                  ]}
                  onPress={() => setNearMode(mode)}
                >
                  <RNText
                    style={[
                      styles.nearOptionText,
                      filters.nearMode === mode && styles.nearOptionTextActive,
                    ]}
                  >
                    {t(`advancedSearch.near_${mode}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Distance ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.distanceTitle')}
            sectionKey="distance"
          />
          {sections.distance && (
            <>
              <RNText style={styles.sliderValue}>
                {filters.distanceKm < 1
                  ? `${filters.distanceKm * 1000} م`
                  : `${filters.distanceKm} كم`}
              </RNText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {DISTANCE_STEPS.map((km) => (
                    <TouchableOpacity
                      key={km}
                      style={[
                        styles.chip,
                        filters.distanceKm === km && styles.chipSelected,
                      ]}
                      onPress={() => setDistance(km)}
                    >
                      <RNText
                        style={[
                          styles.chipText,
                          filters.distanceKm === km && styles.chipTextSelected,
                        ]}
                      >
                        {km < 1 ? `${km * 1000} م` : `${km} كم`}
                      </RNText>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </View>

        {/* ── Categories ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.categoriesTitle')}
            sectionKey="categories"
          />
          {sections.categories && (
            <View style={styles.chipGrid}>
              {CATEGORY_LIST.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.chip,
                    filters.categories.includes(cat) && styles.chipSelected,
                  ]}
                  onPress={() => toggleCategory(cat)}
                  accessibilityRole="checkbox"
                  accessibilityState={{
                    checked: filters.categories.includes(cat),
                  }}
                >
                  <RNText
                    style={[
                      styles.chipText,
                      filters.categories.includes(cat) &&
                        styles.chipTextSelected,
                    ]}
                  >
                    {t(`categories.${cat}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Rating ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.ratingTitle')}
            sectionKey="rating"
          />
          {sections.rating && (
            <View style={styles.ratingRow}>
              {RATING_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.ratingBtn,
                    filters.minRating === r && styles.ratingBtnActive,
                  ]}
                  onPress={() => setRating(r)}
                  accessibilityLabel={`${r} ${t('advancedSearch.ratingStars')}`}
                >
                  <RNText style={styles.ratingStar}>{'★'.repeat(r)}</RNText>
                  <RNText
                    style={[
                      styles.ratingLabel,
                      filters.minRating === r && styles.ratingLabelActive,
                    ]}
                  >
                    {r}+
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Price range ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.priceTitle')}
            sectionKey="price"
          />
          {sections.price && (
            <View style={styles.chipRow}>
              {PRICE_OPTIONS.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.chip,
                    filters.priceRange.includes(p) && styles.chipSelected,
                  ]}
                  onPress={() => togglePrice(p)}
                >
                  <RNText
                    style={[
                      styles.chipText,
                      filters.priceRange.includes(p) && styles.chipTextSelected,
                    ]}
                  >
                    {t(`advancedSearch.price_${p}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Amenities (toggles) ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.amenitiesTitle')}
            sectionKey="amenities"
          />
          {sections.amenities && (
            <View style={styles.amenityList}>
              {AMENITY_OPTIONS.map(({ key, icon }) => (
                <View key={key} style={styles.amenityRow}>
                  <RNText style={styles.amenityIcon}>{icon}</RNText>
                  <RNText style={styles.amenityLabel}>
                    {t(`advancedSearch.amenity_${key}`)}
                  </RNText>
                  <Switch
                    value={filters.amenities[key]}
                    onValueChange={() => toggleAmenity(key)}
                    trackColor={{ false: '#E0E0E0', true: '#BBDEFB' }}
                    thumbColor={filters.amenities[key] ? PRIMARY : '#9E9E9E'}
                    accessibilityLabel={t(`advancedSearch.amenity_${key}`)}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Cuisine (restaurants) ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.cuisineTitle')}
            sectionKey="cuisine"
          />
          {sections.cuisine && (
            <View style={styles.chipGrid}>
              {CUISINE_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.chip,
                    filters.cuisines.includes(c) && styles.chipSelected,
                  ]}
                  onPress={() => toggleCuisine(c)}
                >
                  <RNText
                    style={[
                      styles.chipText,
                      filters.cuisines.includes(c) && styles.chipTextSelected,
                    ]}
                  >
                    {t(`advancedSearch.cuisine_${c}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── Sort by ── */}
        <View style={styles.section}>
          <SectionHeader
            titleKey={t('advancedSearch.sortTitle')}
            sectionKey="sort"
          />
          {sections.sort && (
            <View style={styles.sortList}>
              {SORT_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.sortOption,
                    filters.sortBy === s && styles.sortOptionActive,
                  ]}
                  onPress={() => setSort(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: filters.sortBy === s }}
                >
                  <View
                    style={[
                      styles.sortRadio,
                      filters.sortBy === s && styles.sortRadioActive,
                    ]}
                  />
                  <RNText
                    style={[
                      styles.sortLabel,
                      filters.sortBy === s && styles.sortLabelActive,
                    ]}
                  >
                    {t(`advancedSearch.sort_${s}`)}
                  </RNText>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* spacer */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.savePresetBtn}
          onPress={() => setSavePresetVisible(true)}
          accessibilityLabel={t('advancedSearch.savePreset')}
        >
          <RNText style={styles.savePresetText}>
            💾 {t('advancedSearch.savePreset')}
          </RNText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.searchBtn, loading && styles.searchBtnLoading]}
          onPress={doSearch}
          disabled={loading || !query.trim()}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <RNText style={styles.searchBtnText}>
              {t('advancedSearch.searchBtn')}
              {resultCount > 0 ? ` (${resultCount})` : ''}
            </RNText>
          )}
        </TouchableOpacity>
      </View>

      {/* Save preset sheet */}
      {savePresetVisible && (
        <Sheet
          visible={savePresetVisible}
          onClose={() => setSavePresetVisible(false)}
        >
          <View style={styles.savePresetSheet}>
            <RNText style={styles.savePresetSheetTitle}>{t('advancedSearch.savePresetTitle')}</RNText>
            <TextInput
              style={styles.presetInput}
              value={presetName}
              onChangeText={setPresetName}
              placeholder={t('advancedSearch.presetNamePlaceholder')}
              placeholderTextColor="#9E9E9E"
              autoFocus
              textAlign={I18nManager.isRTL ? 'right' : 'left'}
            />
            <View style={styles.savePresetActions}>
              <Button
                variant="secondary"
                onPress={() => {
                  setSavePresetVisible(false);
                  setPresetName('');
                }}
                label={t('addressPicker.cancel')}
              />
              <Button
                variant="primary"
                onPress={savePreset}
                label={t('addressPicker.save')}
                disabled={!presetName.trim()}
              />
            </View>
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 8,
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 18, color: '#444', transform: [{ scaleX: I18nManager.isRTL ? 1 : -1 }] },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111' },
  resetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
  },
  resetBtnText: { fontSize: 12, color: ACCENT, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: '#F8F8F8' },
  scrollContent: { paddingBottom: 16 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DIVIDER,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
    paddingVertical: 12,
  },
  clearBtn: { padding: 8 },
  clearIcon: { fontSize: 14, color: '#9E9E9E' },
  viewToggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DIVIDER,
    overflow: 'hidden',
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
  },
  viewToggleBtnActive: { backgroundColor: PRIMARY },
  viewToggleText: { fontSize: 13, color: '#666' },
  viewToggleTextActive: { color: '#fff', fontWeight: '600' },
  section: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: SURFACE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#222' },
  sectionChevron: { fontSize: 10, color: '#9E9E9E' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: CHIP_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipSelected: {
    backgroundColor: CHIP_SELECTED,
    borderColor: CHIP_SELECTED_BORDER,
  },
  chipText: { fontSize: 13, color: '#555' },
  chipTextSelected: { color: PRIMARY, fontWeight: '600' },
  sliderValue: {
    fontSize: 13,
    color: PRIMARY,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  ratingBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: CHIP_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  ratingBtnActive: {
    backgroundColor: CHIP_SELECTED,
    borderColor: CHIP_SELECTED_BORDER,
  },
  ratingStar: { fontSize: 12, color: ACCENT },
  ratingLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  ratingLabelActive: { color: PRIMARY, fontWeight: '600' },
  amenityList: { paddingBottom: 4 },
  amenityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 10,
  },
  amenityIcon: { fontSize: 18, width: 28 },
  amenityLabel: { flex: 1, fontSize: 14, color: '#333' },
  sortList: { paddingBottom: 8 },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  sortOptionActive: { backgroundColor: '#F5F9FF' },
  sortRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9E9E9E',
  },
  sortRadioActive: { borderColor: PRIMARY, backgroundColor: PRIMARY },
  sortLabel: { fontSize: 14, color: '#333' },
  sortLabelActive: { color: PRIMARY, fontWeight: '600' },
  nearOptions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  nearOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    backgroundColor: CHIP_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  nearOptionActive: {
    backgroundColor: CHIP_SELECTED,
    borderColor: CHIP_SELECTED_BORDER,
  },
  nearOptionText: { fontSize: 12, color: '#555', textAlign: 'center' },
  nearOptionTextActive: { color: PRIMARY, fontWeight: '600' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  recentIcon: { fontSize: 14, color: '#9E9E9E' },
  recentQuery: { flex: 1, fontSize: 14, color: '#333' },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_SELECTED,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHIP_SELECTED_BORDER,
    overflow: 'hidden',
    marginEnd: 4,
  },
  presetChipInner: { paddingHorizontal: 12, paddingVertical: 6 },
  presetChipText: { fontSize: 13, color: PRIMARY },
  presetDelete: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderStartWidth: 1,
    borderStartColor: CHIP_SELECTED_BORDER,
  },
  presetDeleteIcon: { fontSize: 11, color: DANGER },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: SURFACE,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
    alignItems: 'center',
  },
  savePresetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DIVIDER,
    backgroundColor: '#FAFAFA',
  },
  savePresetText: { fontSize: 13, color: '#555' },
  searchBtn: {
    flex: 1,
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  searchBtnLoading: { opacity: 0.7 },
  searchBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  savePresetSheet: { padding: 16, gap: 12 },
  savePresetSheetTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  presetInput: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#FAFAFA',
  },
  savePresetActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
});
