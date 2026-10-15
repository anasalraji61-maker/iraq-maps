/**
 * RecommendationsScreen — AI-powered place recommendations with category tabs
 */
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAssistantClient } from '../client';
import { t } from '../strings';
import type { RecommendationsResponseType } from '@iraq-maps/contracts';
import { RecommendationCategory as RecommendationCategorySchema } from '@iraq-maps/contracts';
import { z } from 'zod';

type RecommendationCategory = z.infer<typeof RecommendationCategorySchema>;

I18nManager.forceRTL(true);

const PRIMARY = '#1976D2';
const SURFACE = '#F5F5F5';
const TEXT = '#212121';
const MUTED = '#757575';
const ACCENT = '#FF6F00';
const ERROR_COLOR = '#C62828';

const CATEGORIES: RecommendationCategory[] = RecommendationCategorySchema.options;

const CATEGORY_LABEL_MAP: Record<RecommendationCategory, string> = {
  restaurants: 'recommendations.categoryRestaurants',
  cafes: 'recommendations.categoryCafes',
  hotels: 'recommendations.categoryHotels',
  shopping: 'recommendations.categoryShopping',
  attractions: 'recommendations.categoryAttractions',
};

const CATEGORY_ICONS: Record<RecommendationCategory, string> = {
  restaurants: '🍽️',
  cafes: '☕',
  hotels: '🏨',
  shopping: '🛍️',
  attractions: '🗺️',
};

interface PlaceCardProps {
  place: RecommendationsResponseType['places'][number];
  onTellMeMore: (name: string, reason: string) => void;
}

function PlaceCard({ place, onTellMeMore }: PlaceCardProps): ReactElement {
  const distText = place.distanceMeters != null
    ? place.distanceMeters < 1000
      ? t('recommendations.distance', { dist: place.distanceMeters })
      : t('recommendations.distanceKm', { dist: (place.distanceMeters / 1000).toFixed(1) })
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.placeName}>{place.name}</Text>
        {place.rating != null && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>⭐ {place.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {place.address != null && (
        <Text style={styles.placeAddress}>{place.address}</Text>
      )}

      <View style={styles.metaRow}>
        {distText != null && <Text style={styles.distanceText}>{distText}</Text>}
        {place.estimatedPrice != null && (
          <Text style={styles.priceText}>
            {t('recommendations.estimatedPrice', { price: place.estimatedPrice })}
          </Text>
        )}
      </View>

      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>{t('recommendations.aiReason')}</Text>
        <Text style={styles.reasonText}>{place.aiReason}</Text>
      </View>

      <Pressable
        style={styles.tellMoreBtn}
        onPress={() => onTellMeMore(place.name, place.aiReason)}
        accessibilityRole="button"
        accessibilityLabel={t('recommendations.tellMeMore')}
      >
        <Text style={styles.tellMoreText}>{t('recommendations.tellMeMore')} 💬</Text>
      </Pressable>
    </View>
  );
}

export function RecommendationsScreen(): ReactElement {
  const router = useRouter();
  const client = useAssistantClient();

  const [activeCategory, setActiveCategory] = useState<RecommendationCategory>('restaurants');
  const [data, setData] = useState<Partial<Record<RecommendationCategory, RecommendationsResponseType>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchCategory = async (category: RecommendationCategory) => {
    if (data[category]) return; // cached
    setLoading(true);
    setError(false);
    try {
      const res = await client.getRecommendations({ query: { category } });
      if (res.status === 200) {
        setData(prev => ({ ...prev, [category]: res.body }));
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCategory(activeCategory);
  }, [activeCategory]);

  const current = data[activeCategory];

  const handleTellMeMore = (name: string, reason: string) => {
    // Navigate to assistant chat with a pre-filled query
    router.push({
      pathname: '/assistant',
      params: { initialMessage: t('common.tellMeMoreMessage', { name, reason }) },
    } as never);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('recommendations.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {CATEGORIES.map(cat => (
          <Pressable
            key={cat}
            style={[styles.tab, activeCategory === cat && styles.tabActive]}
            onPress={() => setActiveCategory(cat)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeCategory === cat }}
          >
            <Text style={styles.tabIcon}>{CATEGORY_ICONS[cat]}</Text>
            <Text style={[styles.tabText, activeCategory === cat && styles.tabTextActive]}>
              {t(CATEGORY_LABEL_MAP[cat] as Parameters<typeof t>[0])}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.loadingText}>{t('recommendations.loading')}</Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{t('recommendations.error')}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void fetchCategory(activeCategory)}>
              <Text style={styles.retryText}>{t('chat.retry')}</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && current != null && (
          <>
            {current.contextNote != null && (
              <Text style={styles.contextNote}>{current.contextNote}</Text>
            )}
            {current.places.length === 0 ? (
              <View style={styles.centered}>
                <Text style={styles.noResults}>{t('recommendations.noResults')}</Text>
              </View>
            ) : (
              current.places.map((place, idx) => (
                <PlaceCard
                  key={place.placeId ?? `${idx}`}
                  place={place}
                  onTellMeMore={handleTellMeMore}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, backgroundColor: PRIMARY },
  backBtn: { padding: 8 },
  backText: { color: '#fff', fontSize: 20 },
  headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSpacer: { width: 36 },
  tabsScroll: { maxHeight: 72, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  tabsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: SURFACE },
  tabActive: { backgroundColor: PRIMARY },
  tabIcon: { fontSize: 16 },
  tabText: { fontSize: 14, color: TEXT, fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 12, color: MUTED, fontSize: 15 },
  errorText: { color: ERROR_COLOR, fontSize: 15, marginBottom: 12, textAlign: 'center' },
  noResults: { color: MUTED, fontSize: 15, textAlign: 'center' },
  retryBtn: { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '700' },
  contextNote: { fontSize: 14, color: MUTED, textAlign: I18nManager.isRTL ? 'right' : 'left', marginBottom: 4 },
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#E0E0E0', padding: 16, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  placeName: { flex: 1, fontSize: 17, fontWeight: '700', color: TEXT, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  ratingBadge: { backgroundColor: '#FFF8E1', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginStart: 8 },
  ratingText: { fontSize: 12, fontWeight: '700', color: ACCENT },
  placeAddress: { fontSize: 13, color: MUTED, marginBottom: 6, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  metaRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  distanceText: { fontSize: 12, color: PRIMARY, fontWeight: '500' },
  priceText: { fontSize: 12, color: ACCENT, fontWeight: '500' },
  reasonBox: { backgroundColor: '#E8F5E9', borderRadius: 8, padding: 10, marginBottom: 10 },
  reasonLabel: { fontSize: 12, fontWeight: '700', color: '#2E7D32', marginBottom: 4, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  reasonText: { fontSize: 13, color: TEXT, lineHeight: 20, textAlign: I18nManager.isRTL ? 'right' : 'left' },
  tellMoreBtn: { alignSelf: I18nManager.isRTL ? 'flex-start' : 'flex-end', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#E3F2FD', borderRadius: 20 },
  tellMoreText: { color: PRIMARY, fontSize: 13, fontWeight: '600' },
});
