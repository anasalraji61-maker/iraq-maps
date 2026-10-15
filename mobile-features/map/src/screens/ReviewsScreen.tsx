/**
 * ReviewsScreen – full-page list of reviews for a place with star breakdown chart.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Review, RatingSummary } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';
import { reviewsContract } from '@iraq-maps/contracts';
import { t } from '../strings';

I18nManager.forceRTL(true);

const STAR = '★';
const STAR_EMPTY = '☆';

function StarDisplay({ rating }: { rating: number }): ReactElement {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={{ fontSize: 16, color: n <= rating ? '#F5A623' : '#CCC' }}>
          {n <= rating ? STAR : STAR_EMPTY}
        </Text>
      ))}
    </View>
  );
}

function StarBreakdownChart({ summary }: { summary: RatingSummary }): ReactElement | null {
  if (!summary.starBreakdown || summary.count === 0) return null;
  const breakdown = summary.starBreakdown;
  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.title}>{t('reviews.ratingBreakdown')}</Text>
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const count = breakdown[star] ?? 0;
        const pct = summary.count > 0 ? count / summary.count : 0;
        return (
          <View key={star} style={chartStyles.row}>
            <Text style={chartStyles.starLabel}>{star} {STAR}</Text>
            <View style={chartStyles.barTrack}>
              <View style={[chartStyles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <Text style={chartStyles.count}>{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ReviewCard({ review }: { review: Review }): ReactElement {
  return (
    <View style={cardStyles.card}>
      <View style={cardStyles.header}>
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarText}>{review.userId.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <StarDisplay rating={review.rating} />
          <Text style={cardStyles.date}>
            {new Date(review.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      {!!review.text && <Text style={cardStyles.body}>{review.text}</Text>}
      {review.photoAssetIds.length > 0 && (
        <Text style={cardStyles.photoCount}>
          {t('reviews.photoCount', { n: review.photoAssetIds.length })}
        </Text>
      )}
    </View>
  );
}

export function ReviewsScreen(): ReactElement {
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId: string; placeName?: string }>();
  const baseUrl = useApiBaseUrl();
  const client = initClient(reviewsContract, { baseUrl, baseHeaders: {} });

  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!placeId) return;
    try {
      const [listRes, summaryRes] = await Promise.all([
        client.list({ params: { placeId: placeId as never }, query: {} }),
        client.summary({ params: { placeId: placeId as never } }),
      ]);
      if (listRes.status === 200) setReviews(listRes.body.items);
      if (summaryRes.status === 200) setSummary(summaryRes.body);
      setError(null);
    } catch {
      setError(t('reviews.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [placeId, client]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('reviews.title')}</Text>
        <TouchableOpacity
          onPress={() => router.push(`/places/${placeId}/add-review` as Parameters<typeof router.push>[0])}
          style={styles.addBtn}
          accessibilityRole="button"
        >
          <Text style={styles.addBtnText}>{t('reviews.writeReview')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ReviewCard review={item} />}
          ListHeaderComponent={summary ? <StarBreakdownChart summary={summary} /> : null}
          ListEmptyComponent={<Text style={styles.empty}>{t('reviews.empty')}</Text>}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
    gap: 8,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontSize: 22, color: '#2196F3' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  addBtn: { backgroundColor: '#2196F3', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  addBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  listContent: { padding: 12, gap: 12, flexGrow: 1 },
  empty: { textAlign: 'center', color: '#9E9E9E', padding: 24, marginTop: 40 },
  errorText: { textAlign: 'center', color: '#D32F2F', padding: 24 },
});

const chartStyles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#F9F9F9', borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: '#212121', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  starLabel: { width: 36, fontSize: 13, color: '#757575' },
  barTrack: { flex: 1, height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#F5A623', borderRadius: 4 },
  count: { width: 28, fontSize: 12, color: '#757575', textAlign: 'right' },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#1565C0' },
  date: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  body: { fontSize: 14, color: '#424242', lineHeight: 20 },
  photoCount: { fontSize: 12, color: '#757575', marginTop: 6 },
});
