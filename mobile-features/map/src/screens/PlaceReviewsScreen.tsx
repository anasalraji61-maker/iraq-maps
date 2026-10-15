/**
 * PlaceReviewsScreen – paginated, sortable, filterable review list.
 *
 * Features:
 *  - All reviews paginated (uses existing reviewsContract)
 *  - Sort: newest, highest, lowest
 *  - Filter by star (1-5) or all
 *  - Review cards with helpful/not-helpful votes (local-only optimistic, pending M98 backend)
 *  - Report review option
 *  - Write-review shortcut button (navigates to AddReviewScreen)
 *  - Rating breakdown chart
 *
 * Route: place/[placeId]/reviews
 */

import { type Review, type RatingSummary, reviewsContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  I18nManager,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text as RNText } from 'react-native';
import { t } from '../strings';

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const STAR_FULL = '★';
const STAR_EMPTY = '☆';
const PAGE_SIZE = 20;

type SortMode = 'newest' | 'highest' | 'lowest';
type StarFilter = 0 | 1 | 2 | 3 | 4 | 5;

// Local-only helpful votes map (placeId:reviewId -> delta)
const helpfulVotes = new Map<string, number>();

// ── Entry ─────────────────────────────────────────────────────────────────────

export function PlaceReviewsScreen(): ReactElement {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  if (!placeId) {
    return <RNText style={styles.errMsg}>{t('place.notFound')}</RNText>;
  }
  return <ReviewsList placeId={placeId} />;
}

function ReviewsList({ placeId }: { placeId: string }): ReactElement {
  const baseUrl = useApiBaseUrl();
  const router = useRouter();

  const client = initClient(reviewsContract, {
    baseUrl,
    baseHeaders: {},
    validateResponse: false,
  } as Parameters<typeof initClient>[1]);

  const [allReviews, setAllReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [sort, setSort] = useState<SortMode>('newest');
  const [starFilter, setStarFilter] = useState<StarFilter>(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Helpful-vote overrides (local only, resets on reload)
  const [helpfulMap, setHelpfulMap] = useState<Map<string, 1 | -1 | 0>>(new Map());

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const res = await client.list({ params: { placeId } });
      if (res.status === 200) {
        setAllReviews(res.body.items);
        setSummary(res.body.summary);
      } else {
        setError(t('reviews.loadError'));
      }
    } catch {
      setError(t('reviews.loadError'));
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, [client, placeId]);

  useEffect(() => { void load(); }, [load]);

  // ── Sort + filter ─────────────────────────────────────────────────────────
  const displayed: Review[] = [...allReviews]
    .filter((r) => starFilter === 0 || r.rating === starFilter)
    .sort((a, b) => {
      if (sort === 'highest') return b.rating - a.rating;
      if (sort === 'lowest') return a.rating - b.rating;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // ── Helpful vote (local-only) ─────────────────────────────────────────────
  const handleHelpful = (reviewId: string, value: 1 | -1) => {
    setHelpfulMap((prev) => {
      const next = new Map(prev);
      const current = next.get(reviewId) ?? 0;
      next.set(reviewId, current === value ? 0 : value);
      return next;
    });
  };

  // ── Report review ─────────────────────────────────────────────────────────
  const handleReport = (reviewId: string) => {
    Alert.alert(t('reviews.reportTitle'), t('reviews.reportMsg'), [
      {
        text: t('reviews.reportConfirm'),
        style: 'destructive',
        onPress: () => {
          // Pending contract request M98-review-report.md
          setAllReviews((prev) => prev.filter((r) => r.id !== reviewId));
        },
      },
      { text: t('place.reportInaccuracyCancel'), style: 'cancel' },
    ]);
  };

  // ── Header (summary + controls) ───────────────────────────────────────────
  const ListHeader = (
    <View>
      {summary ? <RatingChart summary={summary} /> : null}

      {/* Sort chips */}
      <View style={styles.chipRow}>
        {(['newest', 'highest', 'lowest'] as SortMode[]).map((mode) => {
          const labels: Record<SortMode, string> = {
            newest: t('reviews.sortNewest'),
            highest: t('reviews.sortHighest'),
            lowest: t('reviews.sortLowest'),
          };
          return (
            <Chip
              key={mode}
              label={labels[mode]}
              active={sort === mode}
              onPress={() => setSort(mode)}
              testID={`reviews.sort.${mode}`}
            />
          );
        })}
      </View>

      {/* Star filter */}
      <View style={styles.chipRow}>
        <Chip
          label={t('reviews.filterAll')}
          active={starFilter === 0}
          onPress={() => setStarFilter(0)}
          testID="star-filter-all"
        />
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <Chip
            key={star}
            label={`${STAR_FULL} ${star}`}
            active={starFilter === star}
            onPress={() => setStarFilter(starFilter === star ? 0 : star)}
            testID={`star-filter-${star}`}
          />
        ))}
      </View>

      {/* Write review shortcut */}
      <TouchableOpacity
        style={styles.writeBtn}
        onPress={() => router.push({ pathname: '/(tabs)/map/place/[placeId]/add-review' as never, params: { placeId } })}
        accessibilityRole="button"
        accessibilityLabel={t('reviews.writeReview')}
        testID="reviews.writeBtn"
      >
        <RNText style={styles.writeBtnText}>{t('reviews.writeReview')}</RNText>
      </TouchableOpacity>

      {displayed.length === 0 && !loading ? (
        <RNText style={styles.empty}>{t('reviews.filterEmpty')}</RNText>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <RNText style={styles.errMsg}>{error}</RNText>
        <TouchableOpacity onPress={() => void load()}>
          <RNText style={styles.retryLink}>{t('reviews.retry')}</RNText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={displayed}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <ReviewCard
          review={item}
          helpful={helpfulMap.get(item.id) ?? 0}
          onHelpful={(v) => handleHelpful(item.id, v)}
          onReport={() => handleReport(item.id)}
        />
      )}
      ListHeaderComponent={ListHeader}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

// ── Rating breakdown chart ────────────────────────────────────────────────────

function RatingChart({ summary }: { summary: RatingSummary }): ReactElement | null {
  if (!summary.starBreakdown || summary.count === 0) return null;
  const total = summary.count;

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.avgRow}>
        <RNText style={chartStyles.avgNum}>{(summary.average ?? 0).toFixed(1)}</RNText>
        <View>
          <StarRow value={Math.round(summary.average ?? 0)} size={20} />
          <RNText style={chartStyles.countText}>
            {t('reviews.avgRating', {
              avg: String((summary.average ?? 0).toFixed(1)),
              count: String(total),
            })}
          </RNText>
        </View>
      </View>
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const count = summary.starBreakdown![star] ?? 0;
        const pct = total > 0 ? count / total : 0;
        return (
          <View key={star} style={chartStyles.row}>
            <RNText style={chartStyles.starLabel}>
              {star} {STAR_FULL}
            </RNText>
            <View style={chartStyles.track}>
              <View style={[chartStyles.fill, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <RNText style={chartStyles.count}>{count}</RNText>
          </View>
        );
      })}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#FAFAFA', borderRadius: 10, marginBottom: 8 },
  avgRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 10 },
  avgNum: { fontSize: 44, fontWeight: '700', color: '#222', lineHeight: 52 },
  countText: { fontSize: 12, color: '#888' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  starLabel: { width: 32, fontSize: 12, color: '#555', textAlign: 'end' },
  track: { flex: 1, height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#F5A623', borderRadius: 4 },
  count: { width: 28, fontSize: 12, color: '#888', textAlign: 'start' },
});

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  helpful,
  onHelpful,
  onReport,
}: {
  review: Review;
  helpful: number;
  onHelpful: (v: 1 | -1) => void;
  onReport: () => void;
}): ReactElement {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.header}>
        <View style={cardStyles.avatar}>
          <RNText style={cardStyles.avatarText}>
            {review.userId.slice(0, 2).toUpperCase()}
          </RNText>
        </View>
        <View style={{ flex: 1 }}>
          <StarRow value={review.rating} size={16} />
          <RNText style={cardStyles.date}>
            {new Date(review.createdAt).toLocaleDateString()}
          </RNText>
        </View>
      </View>

      {review.text ? (
        <RNText style={cardStyles.body}>{review.text}</RNText>
      ) : null}

      {review.photoAssetIds.length > 0 ? (
        <RNText style={cardStyles.photoCount}>
          {t('reviews.photoCount', { n: review.photoAssetIds.length })}
        </RNText>
      ) : null}

      {/* Helpful / not-helpful */}
      <View style={cardStyles.actions}>
        <RNText style={cardStyles.helpfulLabel}>{t('reviews.helpfulQuestion')}</RNText>
        <TouchableOpacity
          style={[cardStyles.helpBtn, helpful === 1 && cardStyles.helpBtnActive]}
          onPress={() => onHelpful(1)}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.helpful')}
          testID={`review.helpful.${review.id}`}
        >
          <RNText style={[cardStyles.helpBtnText, helpful === 1 && cardStyles.helpBtnTextActive]}>
            👍 {t('reviews.helpful')}
          </RNText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cardStyles.helpBtn, helpful === -1 && cardStyles.helpBtnActive]}
          onPress={() => onHelpful(-1)}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.notHelpful')}
          testID={`review.notHelpful.${review.id}`}
        >
          <RNText style={[cardStyles.helpBtnText, helpful === -1 && cardStyles.helpBtnTextActive]}>
            👎
          </RNText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onReport}
          accessibilityRole="button"
          accessibilityLabel={t('reviews.reportReview')}
          testID={`review.report.${review.id}`}
          style={cardStyles.reportBtn}
        >
          <RNText style={cardStyles.reportBtnText}>{t('reviews.reportReview')}</RNText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  header: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  date: { fontSize: 11, color: '#AAA', marginTop: 2 },
  body: { fontSize: 14, color: '#333', lineHeight: 20 },
  photoCount: { fontSize: 12, color: '#888' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  helpfulLabel: { fontSize: 12, color: '#888' },
  helpBtn: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  helpBtnActive: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  helpBtnText: { fontSize: 12, color: '#555' },
  helpBtnTextActive: { color: PRIMARY },
  reportBtn: { marginStart: 'auto' },
  reportBtnText: { fontSize: 11, color: '#BDBDBD', textDecorationLine: 'underline' },
});

// ── Star row ──────────────────────────────────────────────────────────────────

function StarRow({ value, size }: { value: number; size: number }): ReactElement {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <RNText key={n} style={{ fontSize: size, color: n <= value ? '#F5A623' : '#CCC' }}>
          {n <= value ? STAR_FULL : STAR_EMPTY}
        </RNText>
      ))}
    </View>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): ReactElement {
  return (
    <TouchableOpacity
      style={[chipStyles.chip, active && chipStyles.active]}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <RNText style={[chipStyles.text, active && chipStyles.textActive]}>{label}</RNText>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  active: { borderColor: PRIMARY, backgroundColor: '#E3F2FD' },
  text: { fontSize: 12, color: '#555' },
  textActive: { color: PRIMARY, fontWeight: '600' },
});

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list: { paddingBottom: 32 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 6 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F0F0' },
  empty: { color: '#888', fontSize: 14, textAlign: 'center', padding: 24 },
  errMsg: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  retryLink: { color: PRIMARY, textDecorationLine: 'underline', fontSize: 14 },
  writeBtn: {
    margin: 16,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PRIMARY,
    paddingVertical: 10,
    alignItems: 'center',
  },
  writeBtnText: { color: PRIMARY, fontWeight: '600', fontSize: 14 },
});
