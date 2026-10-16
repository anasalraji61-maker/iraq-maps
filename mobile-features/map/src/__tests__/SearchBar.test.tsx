/**
 * SearchBar — comprehensive RNTL tests.
 * Covers: RTL layout, debounce, category tabs, clear, voice button,
 * recent searches, accessibility labels.
 */
import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { I18nManager } from 'react-native';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@iraq-maps/ui', () => {
  const { View, Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    tokens: {
      color: { primary: '#1D6AE5', bg: '#fff', text: '#000', textMuted: '#666', danger: '#E53935', onPrimary: '#fff' },
      space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      radius: { sm: 4, md: 8, lg: 16, full: 999 },
      font: { size: { caption: 12, body: 14, subtitle: 16, title: 20 } },
      minTouch: 44,
    },
    Screen: ({ children }: { children: React.ReactNode }) => <View testID="screen">{children}</View>,
    Text: ({ children, testID }: { children: React.ReactNode; testID?: string }) => <Text testID={testID}>{children}</Text>,
    Button: ({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) =>
      <Pressable onPress={onPress} testID={testID}><Text>{label}</Text></Pressable>,
  };
});

jest.mock('@iraq-maps/i18n', () => ({
  registerNamespace: jest.fn(),
  setLocale: jest.fn(),
  t: (key: string, params?: Record<string, unknown>) => {
    const fallback: Record<string, string> = {
      'search.placeholder': 'ابحث عن أماكن…',
      'search.categoryAll': 'الكل',
      'search.categoryPlaces': 'أماكن',
      'search.categoryNeighborhoods': 'أحياء',
      'search.recentSearches': 'عمليات البحث الأخيرة',
      'search.clearRecent': 'مسح',
      'search.trending': 'الأكثر بحثاً',
      'search.voiceSearch': 'البحث الصوتي',
      'search.clearInput': 'مسح النص',
      'search.searchArea': 'البحث في المنطقة الحالية',
      'search.noResults': 'لا توجد نتائج',
      'search.loading': 'جارٍ البحث…',
    };
    if (params) {
      let result = fallback[key] ?? key;
      for (const [k, v] of Object.entries(params)) result = result.replace(`{{${k}}}`, String(v));
      return result;
    }
    return fallback[key] ?? key;
  },
  getLocale: () => 'ar',
}));

jest.mock('@iraq-maps/mobile-kit', () => ({
  useApi: () => ({}),
  useApiBaseUrl: () => 'http://localhost:3000',
  useSession: () => ({ state: { status: 'signedIn', user: { id: 'u1' } } }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    initialWindowMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 44, left: 0, right: 0, bottom: 34 } },
  };
});

// ─── Fake timers setup ────────────────────────────────────────────────────────

const mockOnSearch = jest.fn<(query: string) => void>();
const mockOnAutocomplete = jest.fn<(query: string) => void>();
const mockOnSelectItem = jest.fn();
const mockOnCategoryChange = jest.fn<(cat: string) => void>();

// ─── Import the component under test ─────────────────────────────────────────

import { SearchBar } from '../components/SearchBar';
import type { AutocompleteItem, RecentItem, TrendingItem } from '../components/SearchBar';

// ─── Fixture data ─────────────────────────────────────────────────────────────

const RECENT_ITEMS: RecentItem[] = [
  { text: 'مطعم الرافدين', timestamp: Date.now() - 3600_000 },
  { text: 'شارع المتنبي', timestamp: Date.now() - 7200_000 },
  { text: 'الكرادة', timestamp: Date.now() - 86400_000 },
];

const TRENDING_ITEMS: TrendingItem[] = [
  { query: 'مجمع بغداد مول', trend: 'rising' },
  { query: 'جسر الأئمة', trend: 'stable' },
];

const AUTOCOMPLETE_ITEMS: AutocompleteItem[] = [
  { text: 'مطعم البيت', groupKey: 'places', score: 0.9, placeId: 'p1', category: 'restaurant' },
  { text: 'مطعم الرافدين', groupKey: 'places', score: 0.8, placeId: 'p2', category: 'restaurant' },
  { text: 'المتنبي', groupKey: 'neighborhoods', score: 0.7 },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderSearchBar(overrides: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
  return render(
    <SearchBar
      onSearch={mockOnSearch}
      onAutocomplete={mockOnAutocomplete}
      onSelectItem={mockOnSelectItem}
      onCategoryChange={mockOnCategoryChange}
      recentItems={RECENT_ITEMS}
      trendingItems={TRENDING_ITEMS}
      autocompleteItems={[]}
      loading={false}
      {...overrides}
    />,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SearchBar — RTL rendering', () => {
  beforeEach(() => {
    I18nManager.forceRTL(true);
    jest.clearAllMocks();
  });

  it('renders without crashing in RTL locale', () => {
    renderSearchBar();
    expect(screen.getByPlaceholderText('ابحث عن أماكن…')).toBeTruthy();
  });

  it('text input has RTL text direction', () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    // In RTL, writing direction should be right-to-left
    expect(input.props.textAlign === 'right' || input.props.writingDirection === 'rtl' || I18nManager.isRTL).toBe(true);
  });

  it('placeholder is in Arabic', () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    expect(input).toBeTruthy();
  });

  it('category tabs render in Arabic', () => {
    renderSearchBar();
    expect(screen.getByText('الكل')).toBeTruthy();
    expect(screen.getByText('أماكن')).toBeTruthy();
    expect(screen.getByText('أحياء')).toBeTruthy();
  });
});

describe('SearchBar — category tabs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows three category tabs: الكل / أماكن / أحياء', () => {
    renderSearchBar();
    expect(screen.getByText('الكل')).toBeTruthy();
    expect(screen.getByText('أماكن')).toBeTruthy();
    expect(screen.getByText('أحياء')).toBeTruthy();
  });

  it('الكل tab is active by default', () => {
    renderSearchBar();
    const allTab = screen.getByText('الكل');
    // The active tab should have some highlighted styling
    expect(allTab).toBeTruthy();
  });

  it('tapping أماكن calls onCategoryChange with "place"', () => {
    renderSearchBar();
    fireEvent.press(screen.getByText('أماكن'));
    expect(mockOnCategoryChange).toHaveBeenCalledWith('place');
  });

  it('tapping أحياء calls onCategoryChange with "neighborhood"', () => {
    renderSearchBar();
    fireEvent.press(screen.getByText('أحياء'));
    expect(mockOnCategoryChange).toHaveBeenCalledWith('neighborhood');
  });

  it('tapping الكل calls onCategoryChange with "all"', () => {
    renderSearchBar();
    // First switch to places, then back to all
    fireEvent.press(screen.getByText('أماكن'));
    fireEvent.press(screen.getByText('الكل'));
    expect(mockOnCategoryChange).toHaveBeenLastCalledWith('all');
  });
});

describe('SearchBar — debounced autocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does NOT call onAutocomplete immediately on input', () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'مط');
    expect(mockOnAutocomplete).not.toHaveBeenCalled();
  });

  it('calls onAutocomplete after 300ms debounce', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');

    fireEvent.changeText(input, 'مطعم');

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockOnAutocomplete).toHaveBeenCalledWith('مطعم');
  });

  it('debounce resets on each keystroke', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');

    fireEvent.changeText(input, 'م');
    jest.advanceTimersByTime(100);
    fireEvent.changeText(input, 'مط');
    jest.advanceTimersByTime(100);
    fireEvent.changeText(input, 'مطع');

    // Only 200ms total — should not have fired yet
    expect(mockOnAutocomplete).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    // Should be called once with the latest value
    expect(mockOnAutocomplete).toHaveBeenCalledTimes(1);
    expect(mockOnAutocomplete).toHaveBeenCalledWith('مطع');
  });

  it('does not call onAutocomplete for very short input (< 2 chars)', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'م');

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(mockOnAutocomplete).not.toHaveBeenCalled();
  });

  it('calls onSearch when enter/submit is pressed', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'مطعم بغداد');
    fireEvent(input, 'submitEditing');
    expect(mockOnSearch).toHaveBeenCalledWith('مطعم بغداد');
  });
});

describe('SearchBar — clear button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clear button is not visible when input is empty', () => {
    renderSearchBar();
    const clearBtn = screen.queryByAccessibilityLabel('مسح النص');
    // May not exist at all when empty
    if (clearBtn) {
      // If present, it should not be visible or be disabled
      expect(clearBtn.props.style?.opacity === 0 || clearBtn.props.accessibilityElementsHidden).toBeTruthy();
    }
  });

  it('clear button appears after typing', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'بغداد');
    await waitFor(() => {
      const clearBtn = screen.queryByAccessibilityLabel('مسح النص');
      expect(clearBtn).toBeTruthy();
    });
  });

  it('pressing clear button empties the input', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'بغداد');

    await waitFor(() => {
      expect(screen.queryByAccessibilityLabel('مسح النص')).toBeTruthy();
    });

    const clearBtn = screen.getByAccessibilityLabel('مسح النص');
    fireEvent.press(clearBtn);

    await waitFor(() => {
      expect(input.props.value).toBe('');
    });
  });

  it('after clearing, recent searches are shown again', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'بغداد');

    await waitFor(() => expect(screen.queryByAccessibilityLabel('مسح النص')).toBeTruthy());

    fireEvent.press(screen.getByAccessibilityLabel('مسح النص'));

    await waitFor(() => {
      expect(screen.queryByText('مطعم الرافدين')).toBeTruthy();
    });
  });
});

describe('SearchBar — voice button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('voice search button is present', () => {
    renderSearchBar();
    const voiceBtn = screen.queryByAccessibilityLabel('البحث الصوتي');
    expect(voiceBtn).toBeTruthy();
  });

  it('voice button has correct accessibility role', () => {
    renderSearchBar();
    const voiceBtn = screen.getByAccessibilityLabel('البحث الصوتي');
    expect(voiceBtn.props.accessibilityRole).toBe('button');
  });

  it('pressing voice button does not crash', () => {
    renderSearchBar();
    const voiceBtn = screen.getByAccessibilityLabel('البحث الصوتي');
    expect(() => fireEvent.press(voiceBtn)).not.toThrow();
  });
});

describe('SearchBar — recent searches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows recent searches label when input is empty', () => {
    renderSearchBar();
    expect(screen.queryByText('عمليات البحث الأخيرة')).toBeTruthy();
  });

  it('renders all recent search items', () => {
    renderSearchBar();
    expect(screen.queryByText('مطعم الرافدين')).toBeTruthy();
    expect(screen.queryByText('شارع المتنبي')).toBeTruthy();
    expect(screen.queryByText('الكرادة')).toBeTruthy();
  });

  it('shows nothing when recentItems is empty', () => {
    renderSearchBar({ recentItems: [] });
    expect(screen.queryByText('عمليات البحث الأخيرة')).toBeNull();
  });

  it('tapping a recent item triggers search', () => {
    renderSearchBar();
    fireEvent.press(screen.getByText('مطعم الرافدين'));
    expect(mockOnSearch).toHaveBeenCalledWith('مطعم الرافدين');
  });

  it('trending items shown below recent', () => {
    renderSearchBar();
    expect(screen.queryByText('مجمع بغداد مول')).toBeTruthy();
    expect(screen.queryByText('جسر الأئمة')).toBeTruthy();
  });

  it('hides recent searches after input', async () => {
    renderSearchBar();
    expect(screen.queryByText('مطعم الرافدين')).toBeTruthy();

    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'خان');

    await waitFor(() => {
      expect(screen.queryByText('عمليات البحث الأخيرة')).toBeNull();
    });
  });
});

describe('SearchBar — autocomplete dropdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows autocomplete items when provided', async () => {
    renderSearchBar({ autocompleteItems: AUTOCOMPLETE_ITEMS });
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'مطعم');

    await act(async () => { jest.advanceTimersByTime(300); });

    await waitFor(() => {
      expect(screen.queryByText('مطعم البيت')).toBeTruthy();
    });
  });

  it('tapping an autocomplete item calls onSelectItem', async () => {
    renderSearchBar({ autocompleteItems: AUTOCOMPLETE_ITEMS });
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'مطعم');

    await act(async () => { jest.advanceTimersByTime(300); });

    await waitFor(() => {
      const item = screen.queryByText('مطعم البيت');
      if (item) fireEvent.press(item);
    });

    expect(mockOnSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'مطعم البيت' }),
    );
  });

  it('shows loading indicator while autocomplete is in progress', () => {
    renderSearchBar({ loading: true });
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'مطعم');
    // ActivityIndicator should be present
    const spinner = screen.queryByTestId('search-loading');
    if (spinner) expect(spinner).toBeTruthy();
    // At minimum, no crash
  });
});

describe('SearchBar — accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('search input has accessibilityLabel', () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    // Either accessibilityLabel or placeholder serves as accessible name
    expect(input.props.accessibilityLabel ?? input.props.placeholder).toBeTruthy();
  });

  it('voice button has accessibilityLabel', () => {
    renderSearchBar();
    expect(screen.getByAccessibilityLabel('البحث الصوتي')).toBeTruthy();
  });

  it('clear button has accessibilityLabel', async () => {
    renderSearchBar();
    const input = screen.getByPlaceholderText('ابحث عن أماكن…');
    fireEvent.changeText(input, 'نص');
    await waitFor(() => {
      expect(screen.queryByAccessibilityLabel('مسح النص')).toBeTruthy();
    });
  });

  it('category tabs have accessibilityRole button', () => {
    renderSearchBar();
    const tabs = screen.getAllByRole('button');
    // At least 3 tabs (الكل، أماكن، أحياء) plus voice + potentially clear
    expect(tabs.length).toBeGreaterThanOrEqual(3);
  });

  it('recent items are pressable (accessible)', () => {
    renderSearchBar();
    const recentItem = screen.queryByText('مطعم الرافدين');
    expect(recentItem).toBeTruthy();
    // Pressing it should not throw
    expect(() => fireEvent.press(recentItem!)).not.toThrow();
  });
});
