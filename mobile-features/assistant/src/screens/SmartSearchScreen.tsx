/**
 * SmartSearchScreen — NLP-powered place search
 * Used standalone or embedded in MapScreen via SmartSearchBar
 */
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAssistantClient } from '../client';
import { t } from '../strings';
import type { NLPSearchResponseType } from '@iraq-maps/contracts';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const SURFACE = '#F5F5F5';
const TEXT = '#212121';
const MUTED = '#757575';
const ACCENT = '#FF6F00';
const ERROR_COLOR = '#C62828';

const EXAMPLE_KEYS = [
  'search.example1',
  'search.example2',
  'search.example3',
  'search.example4',
] as const;

interface SearchResultCardProps {
  result: NLPSearchResponseType['results'][number];
  rank: number;
}

function SearchResultCard({ result, rank }: SearchResultCardProps): ReactElement {
  const distText = result.distanceMeters != null
    ? result.distanceMeters < 1000
      ? t('search.distanceM', { dist: result.distanceMeters })
      : t('search.distanceKm', { dist: (result.distanceMeters / 1000).toFixed(1) })
    : null;

  const scorePercent = Math.round(result.score * 100);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{rank}</Text>
        </View>
        <Text style={styles.placeName}>{result.name}</Text>
        <View style={[styles.scoreBadge, scorePercent >= 80 ? styles.scoreHigh : styles.scoreMid]}>
          <Text style={styles.scoreText}>{scorePercent}%</Text>
        </View>
      </View>

      {result.address != null && (
        <Text style={styles.placeAddress}>{result.address}</Text>
      )}

      <View style={styles.metaRow}>
        {result.category != null && (
          <Text style={styles.categoryPill}>{result.category}</Text>
        )}
        {distText != null && <Text style={styles.distText}>{distText}</Text>}
      </View>

      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>{t('search.matchReason')}</Text>
        <Text style={styles.reasonText}>{result.matchReason}</Text>
      </View>
    </View>
  );
}

export function SmartSearchScreen(): ReactElement {
  const router = useRouter();
  const client = useAssistantClient();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NLPSearchResponseType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleSearch = async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError(false);
    setResults(null);
    try {
      const res = await client.naturalLanguageSearch({ body: { query: q } });
      if (res.status === 200) {
        setResults(res.body);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const renderFilters = (filters: Record<string, unknown>) => {
    const entries = Object.entries(filters).filter(([k]) => k !== 'raw');
    if (entries.length === 0) return null;
    return (
      <View style={styles.filtersBox}>
        <Text style={styles.filtersTitle}>{t('search.parsedFilters')}</Text>
        <View style={styles.filterChips}>
          {entries.map(([key, val]) => (
            <View key={key} style={styles.filterChip}>
              <Text style={styles.filterChipText}>{key}: {String(val)}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('search.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={MUTED}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
          returnKeyType="search"
          onSubmitEditing={() => void handleSearch(query)}
          accessibilityLabel={t('search.title')}
        />
        <Pressable
          style={styles.searchBtn}
          onPress={() => void handleSearch(query)}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={t('search.title')}
        >
          <Text style={styles.searchBtnIcon}>🔍</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Example queries (shown when no results yet) */}
        {results == null && !loading && !error && (
          <View style={styles.examples}>
            <Text style={styles.examplesTitle}>{t('search.exampleQueries')}</Text>
            {EXAMPLE_KEYS.map(key => (
              <Pressable
                key={key}
                style={styles.exampleChip}
                onPress={() => void handleSearch(t(key as Parameters<typeof t>[0]))}
              >
                <Text style={styles.exampleText}>{t(key as Parameters<typeof t>[0])}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>{t('search.searching')}</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{t('search.error')}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void handleSearch(query)}>
              <Text style={styles.retryText}>{t('chat.retry')}</Text>
            </Pressable>
          </View>
        )}

        {/* Results */}
        {results != null && !loading && (
          <>
            {renderFilters(results.parsedFilters)}
            <Text style={styles.totalFound}>
              {t('search.totalFound', { count: results.totalFound })}
            </Text>
            {results.results.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.noResults}>{t('search.noResults')}</Text>
              </View>
            ) : (
              results.results.map((result, idx) => (
                <SearchResultCard
                  key={result.placeId ?? `${idx}`}
                  result={result}
                  rank={idx + 1}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── SmartSearchBar: compact component for embedding in MapScreen ──────────

interface SmartSearchBarProps {
  onSearchPress?: () => void;
}

export function SmartSearchBar({ onSearchPress }: SmartSearchBarProps): ReactElement {
  const router = useRouter();

  const handlePress = () => {
    if (onSearchPress) {
      onSearchPress();
    } else {
      router.push('/assistant/search' as never);
    }
  };

  return (
    <Pressable
      style={styles.floatingBar}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t('search.title')}
    >
      <Text style={styles.floatingBarIcon}>🔍</Text>
      <Text style={styles.floatingBarText}>{t('search.placeholder')}</Text>
      <Text style={styles.floatingBarMic} accessibilityLabel={t('search.micA11y')}>{t('search.micIcon')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, backgroundColor: PRIMARY },
  backBtn: { padding: 8 },
  backText: { color: '#fff', fontSize: 20 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 36 },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 16, gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 12, fontSize: 15, color: TEXT, backgroundColor: SURFACE },
  searchBtn: { padding: 12, backgroundColor: PRIMARY, borderRadius: 12 },
  searchBtnIcon: { fontSize: 18 },
  content: { flex: 1 },
  examples: { padding: 16 },
  examplesTitle: { fontSize: 14, fontWeight: '700', color: MUTED, marginBottom: 12, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  exampleChip: { padding: 12, borderRadius: 10, backgroundColor: '#E3F2FD', marginBottom: 8 },
  exampleText: { fontSize: 14, color: PRIMARY, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: MUTED, fontSize: 15 },
  errorText: { color: ERROR_COLOR, fontSize: 15, marginBottom: 12, textAlign: 'center' },
  retryBtn: { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  filtersBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 10 },
  filtersTitle: { fontSize: 12, fontWeight: '700', color: ACCENT, marginBottom: 6, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: { backgroundColor: '#FFE0B2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  filterChipText: { fontSize: 12, color: TEXT },
  totalFound: { marginHorizontal: 16, marginBottom: 8, fontSize: 13, color: MUTED, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  noResults: { color: MUTED, fontSize: 15, textAlign: 'center' },
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E0E0E0', padding: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  rankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  placeName: { flex: 1, fontSize: 16, fontWeight: '700', color: TEXT, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  scoreBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  scoreHigh: { backgroundColor: '#E8F5E9' },
  scoreMid: { backgroundColor: '#FFF8E1' },
  scoreText: { fontSize: 12, fontWeight: '700', color: TEXT },
  placeAddress: { fontSize: 13, color: MUTED, marginBottom: 6, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' },
  categoryPill: { fontSize: 12, color: '#fff', backgroundColor: ACCENT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  distText: { fontSize: 12, color: PRIMARY, fontWeight: '500' },
  reasonBox: { backgroundColor: SURFACE, borderRadius: 8, padding: 10 },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: MUTED, marginBottom: 3, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  reasonText: { fontSize: 13, color: TEXT, lineHeight: 20, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  // Floating bar (for map screen)
  floatingBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 28, paddingHorizontal: 16, paddingVertical: 12, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  floatingBarIcon: { fontSize: 18 },
  floatingBarText: { flex: 1, color: MUTED, fontSize: 14 },
  floatingBarMic: { fontSize: 18 },
});
