/**
 * SearchBar: animated search input with multi-source autocomplete dropdown.
 *
 * Features:
 * - Expands from compact pill to full-width bar on focus.
 * - Debounces autocomplete requests at 200 ms (fast), full search at 400 ms.
 * - Real-time autocomplete dropdown with groups: recent / places / neighborhoods / categories / trending.
 * - Category filter tabs: الكل / أماكن / أحياء.
 * - Voice search button (stub — opens native mic when ExpoAV permissions available).
 * - Recent searches section in idle state.
 * - Trending searches section in idle state.
 * - "Search in current map area" chip.
 * - Clear button.
 * - Smooth expand/collapse and dropdown fade animations.
 * - RTL-safe: uses start/end, not left/right.
 */

import type { CityId, PlaceCategory, PlaceId } from '@iraq-maps/contracts';
import { tokens } from '@iraq-maps/ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchCategory = 'all' | 'place' | 'neighborhood';

export interface AutocompleteItem {
  text: string;
  secondaryText?: string;
  placeId?: PlaceId;
  category?: PlaceCategory | null;
  city?: CityId;
  groupKey: 'places' | 'neighborhoods' | 'categories' | 'recent' | 'trending';
  score: number;
}

export interface TrendingItem {
  query: string;
  trend: 'rising' | 'stable' | 'falling';
}

export interface RecentItem {
  id: string;
  query: string;
}

export interface SearchBarProps {
  /** Current query string (controlled). */
  value: string;
  /** Called after the autocomplete debounce with the new query (200 ms). */
  onQueryChange: (q: string) => void;
  /** Called immediately on every keystroke (unthrottled). For local UI state. */
  onRawChange?: (q: string) => void;
  /** Autocomplete suggestions to show in the dropdown. */
  suggestions?: AutocompleteItem[];
  /** Recent search history to show when idle (query empty). */
  recentSearches?: RecentItem[];
  /** Trending searches to show when idle (query empty). */
  trendingSearches?: TrendingItem[];
  /** Called when user picks a suggestion from the dropdown. */
  onSuggestionSelect?: (item: AutocompleteItem) => void;
  /** Called when user picks a recent search entry. */
  onRecentSelect?: (item: RecentItem) => void;
  /** Called when user taps a trending chip. */
  onTrendingSelect?: (q: string) => void;
  /** Called when "search in map area" chip is pressed. */
  onSearchInArea?: () => void;
  /** Whether to show the "search in map area" chip. */
  showSearchInArea?: boolean;
  /** Active category tab. */
  activeCategory?: SearchCategory;
  /** Called when category tab changes. */
  onCategoryChange?: (cat: SearchCategory) => void;
  /** Show the back (←) button. When pressed, `onBack` is called. */
  showBack?: boolean;
  onBack?: () => void;
  /** Show a loading spinner in place of the search icon. */
  loading?: boolean;
  /** Debounce delay in ms (default 200 for autocomplete). */
  debounceMs?: number;
  /** Called when the input is focused. */
  onFocus?: () => void;
  /** Called when the input is blurred. */
  onBlur?: () => void;
  /** Whether the bar is in expanded (focused) state — controls animation. */
  expanded?: boolean;
  /** If true the input is rendered as a non-focusable tappable pill. */
  pressable?: boolean;
  onPress?: () => void;
  /** Extra style for the outer container. */
  style?: object;
  /** Hide the dropdown even when suggestions are available (e.g. results screen has its own). */
  hideDropdown?: boolean;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLAPSED_HORIZONTAL_MARGIN = 16;
const EXPANDED_HORIZONTAL_MARGIN = 0;
const ANIMATION_DURATION = 200;
const MAX_DROPDOWN_ITEMS = 12;

const CATEGORY_TABS: Array<{ key: SearchCategory; label: string }> = [
  { key: 'all', label: 'الكل' },
  { key: 'place', label: 'أماكن' },
  { key: 'neighborhood', label: 'أحياء' },
];

const GROUP_ICONS: Record<AutocompleteItem['groupKey'], string> = {
  recent: '🕐',
  places: '📍',
  neighborhoods: '🏘️',
  categories: '🏷️',
  trending: '🔥',
};

// ---------------------------------------------------------------------------
// SearchBar
// ---------------------------------------------------------------------------

export function SearchBar({
  value,
  onQueryChange,
  onRawChange,
  suggestions = [],
  recentSearches = [],
  trendingSearches = [],
  onSuggestionSelect,
  onRecentSelect,
  onTrendingSelect,
  onSearchInArea,
  showSearchInArea = false,
  activeCategory = 'all',
  onCategoryChange,
  showBack = false,
  onBack,
  loading = false,
  debounceMs = 200,
  onFocus,
  onBlur,
  expanded = false,
  pressable = false,
  onPress,
  style,
  hideDropdown = false,
  testID,
}: SearchBarProps): ReactElement {
  const [localValue, setLocalValue] = useState(value);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const margin = useRef(new Animated.Value(COLLAPSED_HORIZONTAL_MARGIN)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // Sync controlled value in.
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Animate margin on expand/collapse.
  useEffect(() => {
    Animated.timing(margin, {
      toValue: expanded ? EXPANDED_HORIZONTAL_MARGIN : COLLAPSED_HORIZONTAL_MARGIN,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    }).start();
  }, [expanded, margin]);

  // Show/hide dropdown with fade.
  const showDropdown = !hideDropdown && expanded && (
    localValue.length >= 1
      ? suggestions.length > 0
      : recentSearches.length > 0 || trendingSearches.length > 0
  );

  useEffect(() => {
    setDropdownVisible(showDropdown);
    Animated.timing(dropdownOpacity, {
      toValue: showDropdown ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [showDropdown, dropdownOpacity]);

  const handleChange = useCallback(
    (text: string) => {
      setLocalValue(text);
      onRawChange?.(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onQueryChange(text);
      }, debounceMs);
    },
    [onQueryChange, onRawChange, debounceMs],
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    onRawChange?.('');
    onQueryChange('');
    inputRef.current?.focus();
  }, [onQueryChange, onRawChange]);

  const handleFocus = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  const handleBlur = useCallback(() => {
    onBlur?.();
  }, [onBlur]);

  const handleSuggestionPress = useCallback(
    (item: AutocompleteItem) => {
      setLocalValue(item.text);
      onQueryChange(item.text);
      onSuggestionSelect?.(item);
    },
    [onQueryChange, onSuggestionSelect],
  );

  const handleRecentPress = useCallback(
    (item: RecentItem) => {
      setLocalValue(item.query);
      onQueryChange(item.query);
      onRecentSelect?.(item);
    },
    [onQueryChange, onRecentSelect],
  );

  const handleTrendingPress = useCallback(
    (q: string) => {
      setLocalValue(q);
      onQueryChange(q);
      onTrendingSelect?.(q);
    },
    [onQueryChange, onTrendingSelect],
  );

  // Cleanup debounce on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const showClear = localValue.length > 0;

  // ---------------------------------------------------------------------------
  // Dropdown content
  // ---------------------------------------------------------------------------

  const renderDropdownItem = ({ item }: { item: AutocompleteItem }) => (
    <Pressable
      style={styles.dropdownRow}
      onPress={() => handleSuggestionPress(item)}
      accessibilityRole="button"
      accessibilityLabel={item.text}
    >
      <RNText style={styles.dropdownIcon} allowFontScaling={false}>
        {GROUP_ICONS[item.groupKey]}
      </RNText>
      <View style={styles.dropdownTextWrap}>
        <RNText style={styles.dropdownText} numberOfLines={1}>
          {item.text}
        </RNText>
        {item.secondaryText && (
          <RNText style={styles.dropdownSecondary} numberOfLines={1}>
            {item.secondaryText}
          </RNText>
        )}
      </View>
    </Pressable>
  );

  const dropdownData: AutocompleteItem[] = localValue.length >= 1
    ? suggestions.slice(0, MAX_DROPDOWN_ITEMS)
    : [
        ...recentSearches.slice(0, 4).map((r): AutocompleteItem => ({
          text: r.query,
          groupKey: 'recent',
          score: 1,
        })),
        ...trendingSearches.slice(0, 3).map((tr): AutocompleteItem => ({
          text: tr.query,
          groupKey: 'trending',
          score: 0.5,
        })),
      ];

  // ---------------------------------------------------------------------------
  // Inner content
  // ---------------------------------------------------------------------------

  const innerContent = (
    <View style={styles.inner}>
      {/* Leading: back button or search icon */}
      {showBack ? (
        <Pressable
          onPress={onBack}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('search.backBtn')}
          hitSlop={8}
        >
          <RNText style={styles.backIcon} allowFontScaling={false}>
            {'←'}
          </RNText>
        </Pressable>
      ) : loading ? (
        <ActivityIndicator
          size="small"
          color={tokens.color.textMuted}
          style={styles.iconBtn}
          accessibilityLabel={t('search.loadingLabel')}
        />
      ) : (
        <RNText
          style={[styles.iconBtn, styles.searchIcon]}
          allowFontScaling={false}
          accessibilityElementsHidden
        >
          {'🔍'}
        </RNText>
      )}

      {/* Text input or pressable placeholder */}
      {pressable ? (
        <Pressable
          style={styles.pressablePlaceholder}
          onPress={onPress}
          accessibilityRole="search"
          accessibilityLabel={t('search.a11yLabel')}
        >
          <RNText style={styles.placeholder} numberOfLines={1}>
            {t('search.label')}
          </RNText>
        </Pressable>
      ) : (
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={localValue}
          onChangeText={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t('search.placeholder')}
          placeholderTextColor={tokens.color.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('search.a11yLabel')}
          testID={testID ?? 'search-input'}
          textAlign="left"
        />
      )}

      {/* Trailing: clear button */}
      {showClear && !pressable && (
        <Pressable
          onPress={handleClear}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('search.clearInput')}
          hitSlop={8}
        >
          <RNText style={styles.clearIcon} allowFontScaling={false}>
            {t('search.clearIcon')}
          </RNText>
        </Pressable>
      )}

      {/* Trailing: mic / voice search button */}
      {!showClear && !pressable && (
        <Pressable
          style={[styles.iconBtn, styles.micBtn]}
          accessibilityRole="button"
          accessibilityLabel={t('search.voiceInput')}
          onPress={() => {
            // Voice search stub — a future milestone will integrate ExpoAV speech recognition.
          }}
          hitSlop={8}
        >
          <RNText style={styles.micIcon} allowFontScaling={false}>
            {'🎤'}
          </RNText>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={style}>
      <Animated.View style={[styles.container, { marginHorizontal: margin }]}>
        {innerContent}

        {/* Category tabs — shown when expanded and category callback provided */}
        {expanded && !pressable && onCategoryChange && (
          <View style={styles.categoryTabs}>
            {CATEGORY_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.categoryTab, activeCategory === tab.key && styles.categoryTabActive]}
                onPress={() => onCategoryChange(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeCategory === tab.key }}
              >
                <RNText
                  style={[
                    styles.categoryTabLabel,
                    activeCategory === tab.key && styles.categoryTabLabelActive,
                  ]}
                >
                  {tab.label}
                </RNText>
              </Pressable>
            ))}

            {/* Search in map area chip */}
            {showSearchInArea && onSearchInArea && (
              <Pressable
                style={styles.areaChip}
                onPress={onSearchInArea}
                accessibilityRole="button"
                accessibilityLabel={t('advancedSearch.searchHere')}
              >
                <RNText style={styles.areaChipText} numberOfLines={1}>
                  {t('advancedSearch.searchHere')}
                </RNText>
              </Pressable>
            )}
          </View>
        )}
      </Animated.View>

      {/* Autocomplete dropdown — rendered outside the animated container so it can overflow */}
      {dropdownVisible && (
        <Animated.View style={[styles.dropdown, { opacity: dropdownOpacity }]}>
          {localValue.length === 0 && recentSearches.length > 0 && (
            <View style={styles.dropdownGroupHeader}>
              <RNText style={styles.dropdownGroupLabel}>{t('search.recentTitle')}</RNText>
            </View>
          )}
          {localValue.length === 0 && trendingSearches.length > 0 && recentSearches.length === 0 && (
            <View style={styles.dropdownGroupHeader}>
              <RNText style={styles.dropdownGroupLabel}>{t('search.trendingTitle')}</RNText>
            </View>
          )}
          <FlatList
            data={dropdownData}
            keyExtractor={(item, idx) => `${item.groupKey}-${item.text}-${idx}`}
            renderItem={renderDropdownItem}
            keyboardShouldPersistTaps="always"
            scrollEnabled={dropdownData.length > 6}
            style={styles.dropdownList}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    fontSize: 18,
  },
  backIcon: {
    fontSize: 20,
    color: tokens.color.text,
  },
  clearIcon: {
    fontSize: 14,
    color: tokens.color.textMuted,
  },
  micIcon: {
    fontSize: 16,
  },
  micBtn: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: tokens.color.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  pressablePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
  },
  placeholder: {
    fontSize: 15,
    color: tokens.color.textMuted,
  },
  // Category tabs
  categoryTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
    flexWrap: 'nowrap',
  },
  categoryTab: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  categoryTabActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  categoryTabLabel: {
    fontSize: 12,
    color: tokens.color.textMuted,
    fontWeight: '500',
  },
  categoryTabLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  areaChip: {
    marginStart: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: `${tokens.color.primary}18`,
    borderWidth: 1,
    borderColor: tokens.color.primary,
  },
  areaChipText: {
    fontSize: 12,
    color: tokens.color.primary,
    fontWeight: '600',
  },
  // Dropdown
  dropdown: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    maxHeight: 320,
    overflow: 'hidden',
  },
  dropdownList: {
    flexGrow: 0,
  },
  dropdownGroupHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  dropdownGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.color.border,
  },
  dropdownIcon: {
    fontSize: 16,
    width: 20,
    textAlign: 'center',
  },
  dropdownTextWrap: {
    flex: 1,
    gap: 1,
  },
  dropdownText: {
    fontSize: 15,
    color: tokens.color.text,
  },
  dropdownSecondary: {
    fontSize: 12,
    color: tokens.color.textMuted,
  },
});
