/**
 * MessageSearchScreen – search messages across all conversations.
 *
 * Features:
 * - Search across all conversations
 * - Highlight matches in results
 * - Filter by: contact, date range, media type
 * - Navigate to message in context
 * - Recent searches (persisted in-memory per session)
 */
import { useRouter } from 'expo-router';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../strings';

I18nManager.forceRTL(true);

// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 350;
const MAX_RECENT = 10;
const PAGE_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaFilter = 'all' | 'image' | 'document' | 'voice' | 'location';

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface ContactFilter {
  contactId: string;
  displayName: string;
}

export interface SearchResult {
  messageId: string;
  conversationId: string;
  conversationType: 'direct' | 'group';
  conversationName: string;
  senderId: string;
  senderName: string;
  snippet: string;
  messageType: 'text' | 'image' | 'document' | 'voice' | 'location' | 'place_share';
  createdAt: string;
  matchStart: number;
  matchEnd: number;
}

// ─── Mock data (replaced by real search endpoint in production) ───────────────

function buildMockResults(query: string): SearchResult[] {
  if (!query.trim()) return [];
  const now = Date.now();
  return Array.from({ length: 15 }, (_, i) => ({
    messageId: `msg-${i}`,
    conversationId: `conv-${i % 4}`,
    conversationType: (i % 3 === 0 ? 'group' : 'direct') as SearchResult['conversationType'],
    conversationName: `conversation-${(i % 4) + 1}`,
    senderId: `user-${i % 5}`,
    senderName: `user-${(i % 5) + 1}`,
    snippet: `message containing "${query}" in conversation ${i + 1}`,
    messageType: (['text', 'image', 'document', 'voice'] as const)[i % 4]!,
    createdAt: new Date(now - i * 2 * 60 * 60 * 1000).toISOString(),
    matchStart: 20,
    matchEnd: 20 + query.length,
  }));
}

// ─── HighlightedText ──────────────────────────────────────────────────────────

function HighlightedText({
  text,
  start,
  end,
  style,
  highlightStyle,
}: {
  text: string;
  start: number;
  end: number;
  style?: object;
  highlightStyle?: object;
}): ReactElement {
  if (start < 0 || end <= start || start >= text.length) {
    return <Text style={style}>{text}</Text>;
  }
  const before = text.slice(0, start);
  const match = text.slice(start, end);
  const after = text.slice(end);

  return (
    <Text style={style}>
      {before}
      <Text style={[highlightStyle]}>{match}</Text>
      {after}
    </Text>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({
  result,
  onPress,
}: {
  result: SearchResult;
  onPress: (r: SearchResult) => void;
}): ReactElement {
  const typeIcon: Record<SearchResult['messageType'], string> = {
    text: '💬',
    image: '🖼',
    document: '📄',
    voice: '🎤',
    location: '📍',
    place_share: '🏢',
  };

  const formattedDate = useMemo(() => {
    try {
      return new Date(result.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [result.createdAt]);

  return (
    <TouchableOpacity
      style={resultStyles.card}
      onPress={() => onPress(result)}
      accessibilityRole="button"
    >
      {/* Conversation + sender info */}
      <View style={resultStyles.header}>
        <Text style={resultStyles.convName} numberOfLines={1}>
          {result.conversationType === 'group' ? '👥 ' : ''}
          {result.conversationName}
        </Text>
        <Text style={resultStyles.date}>{formattedDate}</Text>
      </View>

      <View style={resultStyles.body}>
        <Text style={resultStyles.typeIcon}>{typeIcon[result.messageType]}</Text>
        <View style={resultStyles.snippetWrap}>
          <Text style={resultStyles.senderName}>{result.senderName}</Text>
          <HighlightedText
            text={result.snippet}
            start={result.matchStart}
            end={result.matchEnd}
            style={resultStyles.snippet}
            highlightStyle={resultStyles.highlight}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const resultStyles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  convName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1976D2',
  },
  date: { fontSize: 11, color: '#9E9E9E' },
  body: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  typeIcon: { fontSize: 16, marginTop: 1 },
  snippetWrap: { flex: 1 },
  senderName: { fontSize: 12, color: '#757575', marginBottom: 2 },
  snippet: { fontSize: 14, color: '#424242', lineHeight: 20 },
  highlight: {
    backgroundColor: '#FFF176',
    color: '#212121',
    fontWeight: '700',
  },
});

// ─── FilterSheet ──────────────────────────────────────────────────────────────

function FilterSheet({
  visible,
  mediaFilter,
  dateRange,
  onMediaChange,
  onDateRangeChange,
  onClose,
}: {
  visible: boolean;
  mediaFilter: MediaFilter;
  dateRange: DateRange;
  onMediaChange: (f: MediaFilter) => void;
  onDateRangeChange: (r: DateRange) => void;
  onClose: () => void;
}): ReactElement {
  const mediaOptions: Array<{ value: MediaFilter; label: string; icon: string }> = [
    { value: 'all', label: t('search.filterAll'), icon: '🗂' },
    { value: 'image', label: t('attachment.addPhoto'), icon: '🖼' },
    { value: 'document', label: t('search.filterDocument'), icon: '📄' },
    { value: 'voice', label: t('search.filterVoice'), icon: '🎤' },
    { value: 'location', label: t('conversation.location'), icon: '📍' },
  ];

  const datePresets: Array<{ label: string; from: Date | undefined; to: Date | undefined }> = [
    { label: t('search.dateAny'), from: undefined, to: undefined },
    {
      label: t('time.today'),
      from: new Date(new Date().setHours(0, 0, 0, 0)),
      to: new Date(),
    },
    {
      label: t('time.yesterday'),
      from: new Date(new Date().setDate(new Date().getDate() - 1)),
      to: new Date(new Date().setHours(0, 0, 0, 0)),
    },
    {
      label: t('search.lastWeek'),
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
    {
      label: t('search.lastMonth'),
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date(),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={filterStyles.overlay}>
        <View style={filterStyles.sheet}>
          <View style={filterStyles.handleBar} />
          <Text style={filterStyles.title}>{t('search.filters')}</Text>

          {/* Media type */}
          <Text style={filterStyles.sectionLabel}>{t('search.mediaType')}</Text>
          <View style={filterStyles.chipRow}>
            {mediaOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  filterStyles.chip,
                  mediaFilter === opt.value && filterStyles.chipActive,
                ]}
                onPress={() => onMediaChange(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: mediaFilter === opt.value }}
              >
                <Text style={filterStyles.chipIcon}>{opt.icon}</Text>
                <Text
                  style={[
                    filterStyles.chipLabel,
                    mediaFilter === opt.value && filterStyles.chipLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date range */}
          <Text style={filterStyles.sectionLabel}>{t('search.dateRange')}</Text>
          <View style={filterStyles.chipRow}>
            {datePresets.map((preset, idx) => {
              const isActive =
                String(dateRange.from) === String(preset.from) &&
                String(dateRange.to) === String(preset.to);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[filterStyles.chip, isActive && filterStyles.chipActive]}
                  onPress={() => onDateRangeChange({ from: preset.from, to: preset.to })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isActive }}
                >
                  <Text
                    style={[
                      filterStyles.chipLabel,
                      isActive && filterStyles.chipLabelActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={onClose} style={filterStyles.closeBtn} accessibilityRole="button">
            <Text style={filterStyles.closeBtnText}>{t('compose.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const filterStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#757575',
    marginBottom: 8,
    marginTop: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
  },
  chipActive: { backgroundColor: '#E3F2FD', borderColor: '#1976D2' },
  chipIcon: { fontSize: 13 },
  chipLabel: { fontSize: 13, color: '#424242' },
  chipLabelActive: { color: '#1976D2', fontWeight: '600' },
  closeBtn: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F0F0F0',
  },
  closeBtnText: { fontSize: 15, color: '#1976D2', fontWeight: '600' },
});

// ─── RecentSearches ───────────────────────────────────────────────────────────

function RecentSearches({
  recents,
  onSelect,
  onClearAll,
}: {
  recents: string[];
  onSelect: (q: string) => void;
  onClearAll: () => void;
}): ReactElement {
  if (recents.length === 0) return <View />;
  return (
    <View style={recentStyles.container}>
      <View style={recentStyles.headerRow}>
        <Text style={recentStyles.label}>{t('search.recentSearches')}</Text>
        <TouchableOpacity onPress={onClearAll} accessibilityRole="button">
          <Text style={recentStyles.clearAll}>{t('search.clearAll')}</Text>
        </TouchableOpacity>
      </View>
      {recents.map((q, i) => (
        <TouchableOpacity
          key={i}
          style={recentStyles.row}
          onPress={() => onSelect(q)}
          accessibilityRole="button"
        >
          <Text style={recentStyles.icon}>🕐</Text>
          <Text style={recentStyles.query}>{q}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const recentStyles = StyleSheet.create({
  container: { paddingTop: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'space-between',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#757575' },
  clearAll: { fontSize: 13, color: '#1976D2' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F5F5F5',
  },
  icon: { fontSize: 14, color: '#9E9E9E' },
  query: { fontSize: 14, color: '#424242' },
});

// ─── EmptyResults ─────────────────────────────────────────────────────────────

function EmptyResults({ query }: { query: string }): ReactElement {
  return (
    <View style={emptyStyles.container}>
      <Text style={emptyStyles.icon}>🔍</Text>
      <Text style={emptyStyles.title}>{t('search.noResults')}</Text>
      <Text style={emptyStyles.body}>
        {t('search.noResultsFor', { query })}
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#424242', textAlign: 'center' },
  body: { fontSize: 14, color: '#9E9E9E', textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function MessageSearchScreen(): ReactElement {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [showFilters, setShowFilters] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchInputRef = useRef<TextInput>(null);

  // ── Search ────────────────────────────────────────────────────────────────

  const runSearch = useCallback(
    async (q: string, media: MediaFilter, dates: DateRange, pageNum = 1) => {
      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Production: call search API endpoint
        // const res = await client.searchMessages({ query: { q, media, ...dates, page: pageNum } });
        const allMock = buildMockResults(q).filter((r) => {
          if (media !== 'all' && r.messageType !== media) return false;
          if (dates.from && new Date(r.createdAt) < dates.from) return false;
          if (dates.to && new Date(r.createdAt) > dates.to) return false;
          return true;
        });

        const start = (pageNum - 1) * PAGE_SIZE;
        const slice = allMock.slice(start, start + PAGE_SIZE);
        setResults((prev) => (pageNum === 1 ? slice : [...prev, ...slice]));
        setHasMore(allMock.length > start + PAGE_SIZE);
        setPage(pageNum);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q);
      clearTimeout(debounceTimer.current);
      if (!q.trim()) {
        setResults([]);
        return;
      }
      debounceTimer.current = setTimeout(() => {
        void runSearch(q, mediaFilter, dateRange);
      }, DEBOUNCE_MS);
    },
    [mediaFilter, dateRange, runSearch],
  );

  const handleSubmit = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    // Save to recents
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r !== q);
      return [q, ...filtered].slice(0, MAX_RECENT);
    });
    void runSearch(q, mediaFilter, dateRange);
  }, [query, mediaFilter, dateRange, runSearch]);

  const handleRecentSelect = useCallback(
    (q: string) => {
      setQuery(q);
      void runSearch(q, mediaFilter, dateRange);
    },
    [mediaFilter, dateRange, runSearch],
  );

  const handleMediaChange = useCallback(
    (f: MediaFilter) => {
      setMediaFilter(f);
      if (query.trim()) void runSearch(query, f, dateRange);
    },
    [query, dateRange, runSearch],
  );

  const handleDateRangeChange = useCallback(
    (r: DateRange) => {
      setDateRange(r);
      if (query.trim()) void runSearch(query, mediaFilter, r);
    },
    [query, mediaFilter, runSearch],
  );

  // ── Navigate to message ───────────────────────────────────────────────────

  const handleResultPress = useCallback(
    (result: SearchResult) => {
      // Save query on navigation
      const q = query.trim();
      if (q) {
        setRecentSearches((prev) => {
          const filtered = prev.filter((r) => r !== q);
          return [q, ...filtered].slice(0, MAX_RECENT);
        });
      }

      if (result.conversationType === 'group') {
        router.push(
          `/messages/groups/${result.conversationId}?highlight=${result.messageId}` as Parameters<typeof router.push>[0],
        );
      } else {
        router.push(
          `/messages/conversation/${result.conversationId}?highlight=${result.messageId}` as Parameters<typeof router.push>[0],
        );
      }
    },
    [query, router],
  );

  // ── Load more ─────────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    void runSearch(query, mediaFilter, dateRange, page + 1);
  }, [hasMore, loading, query, mediaFilter, dateRange, page, runSearch]);

  // ── Active filters count ──────────────────────────────────────────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (mediaFilter !== 'all') count++;
    if (dateRange.from || dateRange.to) count++;
    return count;
  }, [mediaFilter, dateRange]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('list.title')}
        >
          <Text style={styles.backIcon}>{I18nManager.isRTL ? '›' : '‹'}</Text>
        </TouchableOpacity>

        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          value={query}
          onChangeText={handleQueryChange}
          onSubmitEditing={handleSubmit}
          placeholder={t('search.placeholder')}
          placeholderTextColor="#9E9E9E"
          returnKeyType="search"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />

        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
          accessibilityRole="button"
          accessibilityLabel={t('search.filters')}
        >
          <Text style={styles.filterIcon}>⚙</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFiltersRow}>
          {mediaFilter !== 'all' && (
            <TouchableOpacity
              style={styles.activeChip}
              onPress={() => handleMediaChange('all')}
              accessibilityRole="button"
            >
              <Text style={styles.activeChipText}>{mediaFilter}{t('search.removeFilter')}</Text>
            </TouchableOpacity>
          )}
          {(dateRange.from || dateRange.to) && (
            <TouchableOpacity
              style={styles.activeChip}
              onPress={() => handleDateRangeChange({})}
              accessibilityRole="button"
            >
              <Text style={styles.activeChipText}>{t('search.dateRange')}{t('search.removeFilter')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Loading indicator */}
      {loading && results.length === 0 && (
        <View style={styles.loaderRow}>
          <ActivityIndicator size="small" color="#1976D2" />
        </View>
      )}

      {/* Results / empty / recent */}
      {!query.trim() ? (
        <RecentSearches
          recents={recentSearches}
          onSelect={handleRecentSelect}
          onClearAll={() => setRecentSearches([])}
        />
      ) : results.length === 0 && !loading ? (
        <EmptyResults query={query} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(r) => r.messageId}
          renderItem={({ item }) => (
            <ResultCard result={item} onPress={handleResultPress} />
          )}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loading && results.length > 0 ? (
              <ActivityIndicator size="small" color="#1976D2" style={styles.footerLoader} />
            ) : null
          }
          style={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Filter modal */}
      <FilterSheet
        visible={showFilters}
        mediaFilter={mediaFilter}
        dateRange={dateRange}
        onMediaChange={handleMediaChange}
        onDateRangeChange={handleDateRangeChange}
        onClose={() => setShowFilters(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7FA' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    gap: 8,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 24, color: '#1976D2' },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#212121',
  },
  filterBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    position: 'relative',
  },
  filterBtnActive: { backgroundColor: '#E3F2FD' },
  filterIcon: { fontSize: 18 },
  filterBadge: {
    position: 'absolute',
    top: 0,
    end: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 9, color: '#fff', fontWeight: '700' },

  activeFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    flexWrap: 'wrap',
  },
  activeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
  },
  activeChipText: { fontSize: 12, color: '#1976D2', fontWeight: '600' },

  loaderRow: { paddingVertical: 16, alignItems: 'center' },
  list: { flex: 1, backgroundColor: '#fff' },
  footerLoader: { paddingVertical: 12 },
});
