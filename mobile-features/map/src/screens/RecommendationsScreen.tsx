/**
 * RecommendationsScreen – personalised "For You" recommendations feed.
 *
 * Sections:
 *  - Try Something New
 *  - Based on Your Reviews
 *  - Popular Near You
 *  - Hidden Gems
 *
 * Recommendations come from the backend only (no client-side inference).
 * Each card shows a "Why recommended" tooltip and supports thumbs up/down feedback.
 *
 * Route: map/recommendations
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { PlaceSearchResult } from '@iraq-maps/contracts';
import { useApi } from '@iraq-maps/mobile-kit';
import { Screen } from '@iraq-maps/ui';
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
  Animated,
  I18nManager,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
const ACCENT = '#F5A623';

const SECTION_ICONS: Record<string, string> = {
  new: '✨',
  reviews: '⭐',
  popular: '🔥',
  hidden: '💎',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecommendedPlace extends PlaceSearchResult {
  reason: string;
  sectionKey: string;
  photoUri?: string | null;
  userFeedback?: 'up' | 'down' | null;
}

interface RecommendationSection {
  key: string;
  titleKey: string;
  places: RecommendedPlace[];
}

// ── Feedback animation ────────────────────────────────────────────────────────

function FeedbackButton({
  type,
  active,
  onPress,
}: {
  type: 'up' | 'down';
  active: boolean;
  onPress: () => void;
}): ReactElement {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [scale, onPress]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          styles.feedbackBtn,
          active && (type === 'up' ? styles.feedbackBtnUp : styles.feedbackBtnDown),
        ]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={
          type === 'up' ? t('recommendations.thumbsUp') : t('recommendations.thumbsDown')
        }
        accessibilityState={{ checked: active }}
      >
        <RNText style={[styles.feedbackIcon, active && styles.feedbackIconActive]}>
          {type === 'up' ? '👍' : '👎'}
        </RNText>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function WhyTooltip({
  reason,
  visible,
  onClose,
}: {
  reason: string;
  visible: boolean;
  onClose: () => void;
}): ReactElement | null {
  if (!visible) return null;

  return (
    <TouchableOpacity
      style={styles.tooltip}
      onPress={onClose}
      activeOpacity={1}
      accessibilityRole="button"
    >
      <View style={styles.tooltipArrow} />
      <RNText style={styles.tooltipText}>{reason}</RNText>
    </TouchableOpacity>
  );
}

// ── Place card ────────────────────────────────────────────────────────────────

function RecommendationCard({
  place,
  onPress,
  onFeedback,
}: {
  place: RecommendedPlace;
  onPress: () => void;
  onFeedback: (id: string, feedback: 'up' | 'down') => void;
}): ReactElement {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <View style={styles.card}>
      {/* Photo */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <View style={styles.cardPhoto}>
          {place.photoUri ? (
            <Image
              source={{ uri: place.photoUri }}
              style={styles.cardPhotoImg}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardPhotoPlaceholder}>
              <RNText style={styles.cardPhotoIcon}>
                {SECTION_ICONS[place.sectionKey] ?? '📍'}
              </RNText>
            </View>
          )}

          {/* Open badge */}
          {place.openNow != null && (
            <View
              style={[
                styles.openBadge,
                place.openNow ? styles.openBadgeOpen : styles.openBadgeClosed,
              ]}
            >
              <RNText style={styles.openBadgeText}>
                {place.openNow
                  ? t('markerSheet.openBadge')
                  : t('markerSheet.closedBadge')}
              </RNText>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Body */}
      <View style={styles.cardBody}>
        <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
          <RNText style={styles.cardName} numberOfLines={2}>
            {place.name}
          </RNText>
        </TouchableOpacity>

        <View style={styles.cardMeta}>
          {place.category && (
            <RNText style={styles.cardCategory}>
              {t(`categories.${place.category}`)}
            </RNText>
          )}
          {place.rating != null && (
            <>
              <RNText style={styles.metaDot}>·</RNText>
              <RNText style={styles.cardRating}>★ {place.rating.toFixed(1)}</RNText>
              {place.reviewCount > 0 && (
                <RNText style={styles.cardReviewCount}>
                  ({place.reviewCount})
                </RNText>
              )}
            </>
          )}
          {place.distanceM != null && (
            <>
              <RNText style={styles.metaDot}>·</RNText>
              <RNText style={styles.cardDist}>
                {place.distanceM < 1000
                  ? `${Math.round(place.distanceM)} م`
                  : `${(place.distanceM / 1000).toFixed(1)} كم`}
              </RNText>
            </>
          )}
        </View>

        {/* Why recommended */}
        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={styles.whyBtn}
            onPress={() => setTooltipVisible((v) => !v)}
            accessibilityLabel={t('recommendations.whyLabel')}
          >
            <RNText style={styles.whyBtnText}>
              ℹ️ {t('recommendations.why')}
            </RNText>
          </TouchableOpacity>

          <View style={styles.feedbackRow}>
            <FeedbackButton
              type="up"
              active={place.userFeedback === 'up'}
              onPress={() => onFeedback(place.id, 'up')}
            />
            <FeedbackButton
              type="down"
              active={place.userFeedback === 'down'}
              onPress={() => onFeedback(place.id, 'down')}
            />
          </View>
        </View>

        <WhyTooltip
          reason={place.reason}
          visible={tooltipVisible}
          onClose={() => setTooltipVisible(false)}
        />
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function RecommendationsScreen(): ReactElement {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = useApi() as any;

  const [sections, setSections] = useState<RecommendationSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await api.get('/v1/search/recommendations');

        if (res.status === 200) {
          const body = res.body as {
            sections: Array<{
              key: string;
              places: Array<RecommendedPlace>;
            }>;
          };

          setSections(
            (body.sections ?? []).map((s) => ({
              key: s.key,
              titleKey: s.key,
              places: s.places.map((p) => ({ ...p, sectionKey: s.key })),
            })),
          );
        } else {
          setError(t('search.networkError'));
        }
      } catch {
        setError(t('search.networkError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [api],
  );

  useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  const handleFeedback = useCallback(
    async (placeId: string, feedback: 'up' | 'down') => {
      // Optimistic update
      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          places: section.places.map((p) =>
            p.id === placeId
              ? {
                  ...p,
                  userFeedback:
                    p.userFeedback === feedback ? null : feedback,
                }
              : p,
          ),
        })),
      );

      await api
        .post('/v1/search/recommendations/feedback', {
          body: { placeId, feedback },
        })
        .catch(() => null);
    },
    [api],
  );

  const handlePlacePress = useCallback(
    (place: RecommendedPlace) => {
      router.push(`/place/${place.id}`);
    },
    [router],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={PRIMARY} size="large" />
          <RNText style={styles.loadingText}>
            {t('search.loadingLabel')}
          </RNText>
        </View>
      </Screen>
    );
  }

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
          <RNText style={styles.backIcon}>→</RNText>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <RNText style={styles.headerTitle}>
            {t('recommendations.title')}
          </RNText>
          <RNText style={styles.headerSubtitle}>
            {t('recommendations.subtitle')}
          </RNText>
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => loadRecommendations(true)}
          disabled={refreshing}
          accessibilityLabel={t('recommendations.refresh')}
        >
          {refreshing ? (
            <ActivityIndicator color={PRIMARY} size="small" />
          ) : (
            <RNText style={styles.refreshIcon}>↻</RNText>
          )}
        </TouchableOpacity>
      </View>

      {/* Error */}
      {error && (
        <View style={styles.errorBanner}>
          <RNText style={styles.errorText}>{error}</RNText>
          <TouchableOpacity onPress={() => loadRecommendations()}>
            <RNText style={styles.retryText}>{t('recommendations.retry')}</RNText>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadRecommendations(true)}
            tintColor={PRIMARY}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {sections.length === 0 && !loading ? (
          <View style={styles.emptyState}>
            <RNText style={styles.emptyStateIcon}>🗺️</RNText>
            <RNText style={styles.emptyStateTitle}>
              {t('recommendations.emptyTitle')}
            </RNText>
            <RNText style={styles.emptyStateBody}>
              {t('recommendations.emptyBody')}
            </RNText>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.sectionContainer}>
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <RNText style={styles.sectionIcon}>
                  {SECTION_ICONS[section.key] ?? '📍'}
                </RNText>
                <RNText style={styles.sectionTitle}>
                  {t(('recommendations.section_' + section.key) as Parameters<typeof t>[0])}
                </RNText>
              </View>

              {/* Horizontal scroll of cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardsRow}
              >
                {section.places.map((place) => (
                  <RecommendationCard
                    key={place.id}
                    place={place}
                    onPress={() => handlePlacePress(place)}
                    onFeedback={handleFeedback}
                  />
                ))}
              </ScrollView>
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </Screen>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14, color: '#999' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 10,
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 18, color: '#444', transform: [{ scaleX: I18nManager.isRTL ? 1 : -1 }] },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 12, color: '#999', marginTop: 1 },
  refreshBtn: { padding: 8 },
  refreshIcon: { fontSize: 20, color: PRIMARY },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: '#C62828' },
  retryText: { fontSize: 13, color: PRIMARY, fontWeight: '600' },
  scroll: { flex: 1, backgroundColor: '#F8F8F8' },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyStateIcon: { fontSize: 48 },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
  },
  emptyStateBody: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionContainer: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 8,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  cardsRow: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  card: {
    width: 200,
    backgroundColor: SURFACE,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: DIVIDER,
  },
  cardPhoto: { position: 'relative' },
  cardPhotoImg: { width: '100%', height: 120 },
  cardPhotoPlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoIcon: { fontSize: 40 },
  openBadge: {
    position: 'absolute',
    top: 8,
    start: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openBadgeOpen: { backgroundColor: 'rgba(67,160,71,0.9)' },
  openBadgeClosed: { backgroundColor: 'rgba(229,57,53,0.9)' },
  openBadgeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  cardBody: { padding: 12, gap: 5 },
  cardName: { fontSize: 14, fontWeight: '600', color: '#111', lineHeight: 19 },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  cardCategory: { fontSize: 11, color: '#888' },
  metaDot: { fontSize: 10, color: '#CCC' },
  cardRating: { fontSize: 11, color: ACCENT },
  cardReviewCount: { fontSize: 11, color: '#AAA' },
  cardDist: { fontSize: 11, color: '#AAA' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  whyBtn: { flex: 1 },
  whyBtnText: { fontSize: 12, color: '#777' },
  feedbackRow: { flexDirection: 'row', gap: 4 },
  feedbackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBtnUp: { backgroundColor: '#E8F5E9' },
  feedbackBtnDown: { backgroundColor: '#FFEBEE' },
  feedbackIcon: { fontSize: 14 },
  feedbackIconActive: { opacity: 1 },
  tooltip: {
    marginTop: 6,
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 10,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -5,
    start: 14,
    width: 10,
    height: 10,
    backgroundColor: '#333',
    transform: [{ rotate: '45deg' }],
  },
  tooltipText: { fontSize: 12, color: '#fff', lineHeight: 17 },
});
