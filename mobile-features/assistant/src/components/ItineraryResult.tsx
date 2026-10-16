/**
 * ItineraryResult — renders a day-trip itinerary with:
 * - Timeline view showing each stop with time, name, duration and icon
 * - "عرض على الخريطة" button to open all stops on the map
 * - "حفظ كمجموعة" button
 * - "ابدأ الملاحة" button for the first stop
 *
 * Used inside AssistantScreen when the assistant returns an itinerary response.
 */
import { useRouter } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItineraryStop {
  time: string;
  placeId?: string;
  placeName: string;
  placeAddress?: string;
  category: string;
  activity: string;
  duration: string;
  notes?: string;
}

export interface ItineraryData {
  city: string;
  durationHours: number;
  budget: string;
  summary: string;
  stops: ItineraryStop[];
  tips?: string[];
}

interface ItineraryResultProps {
  itinerary: ItineraryData;
  onPlacePress?: (placeId: string) => void;
  onStartNavigation?: (placeId: string, placeName: string) => void;
  onSaveCollection?: (itinerary: ItineraryData) => void;
}

// ─── Category icons ───────────────────────────────────────────────────────────

/* eslint-disable no-restricted-syntax */
const CATEGORY_ICONS: Record<string, string> = {
  'مطعم': '🍽️',
  'مطاعم': '🍽️',
  'مقهى': '☕',
  'مقاهي': '☕',
  'متحف': '🏛️',
  'معالم': '🗺️',
  'معلم': '🗺️',
  'سياحي': '📍',
  'معالم سياحية': '🗺️',
  'تسوق': '🛍️',
  'حديقة': '🌳',
  'طبيعة': '🌿',
  'ديني': '🕌',
  'مواقع دينية': '🕌',
  'تاريخي': '🏺',
  'مواقع تاريخية': '🏺',
  'فندق': '🏨',
  'صيدلية': '💊',
};
/* eslint-enable no-restricted-syntax */

function iconForCategory(cat: string): string {
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (cat.includes(key)) return icon;
  }
  return '📌';
}

// ─── Timeline connector ───────────────────────────────────────────────────────

function TimelineConnector({ isLast }: { isLast: boolean }): ReactElement | null {
  if (isLast) return null;
  return <View style={styles.connector} />;
}

// ─── Single stop card ─────────────────────────────────────────────────────────

interface StopCardProps {
  stop: ItineraryStop;
  index: number;
  isLast: boolean;
  onPress?: (placeId: string) => void;
  onNavigate?: (placeId: string, placeName: string) => void;
}

function StopCard({ stop, index, isLast, onPress, onNavigate }: StopCardProps): ReactElement {
  const icon = iconForCategory(stop.category);

  return (
    <View style={styles.stopRow}>
      {/* Timeline column */}
      <View style={styles.timelineCol}>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>{stop.time}</Text>
        </View>
        <TimelineConnector isLast={isLast} />
      </View>

      {/* Content card */}
      <Pressable
        style={({ pressed }) => [styles.stopCard, pressed && styles.stopCardPressed]}
        onPress={() => stop.placeId && onPress?.(stop.placeId)}
        accessibilityRole="button"
        accessibilityLabel={`${stop.placeName} — ${stop.activity}`}
      >
        <View style={styles.stopHeader}>
          <Text style={styles.stopIcon}>{icon}</Text>
          <View style={styles.stopTitleBlock}>
            <Text style={styles.stopNumber}>{t('itinerary.stopNumber', { n: String(index + 1) })}</Text>
            <Text style={styles.stopName} numberOfLines={2}>{stop.placeName}</Text>
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{stop.duration}</Text>
          </View>
        </View>

        <Text style={styles.stopActivity}>{stop.activity}</Text>

        {stop.placeAddress ? (
          <Text style={styles.stopAddress} numberOfLines={1}>📍 {stop.placeAddress}</Text>
        ) : null}

        {stop.notes ? (
          <View style={styles.notesRow}>
            <Text style={styles.notesIcon}>💡</Text>
            <Text style={styles.notesText}>{stop.notes}</Text>
          </View>
        ) : null}

        {stop.placeId ? (
          <View style={styles.stopActions}>
            <Pressable
              style={styles.stopActionBtn}
              onPress={() => onPress?.(stop.placeId!)}
              accessibilityRole="button"
              accessibilityLabel={t('itinerary.viewOnMap')}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.stopActionText}>🗺️ {t('itinerary.viewOnMap')}</Text>
            </Pressable>
            <Pressable
              style={[styles.stopActionBtn, styles.stopActionNavBtn]}
              onPress={() => onNavigate?.(stop.placeId!, stop.placeName)}
              accessibilityRole="button"
              accessibilityLabel={t('itinerary.navigateTo', { name: stop.placeName })}
            >
              <Text style={[styles.stopActionText, styles.stopActionNavText]}>
                🧭 {t('itinerary.navigate')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

// ─── Tips section ─────────────────────────────────────────────────────────────

function TipsSection({ tips }: { tips: string[] }): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  if (!tips.length) return null;

  return (
    <View style={styles.tipsCard}>
      <Pressable
        style={styles.tipsHeader}
        onPress={() => setExpanded(p => !p)}
        accessibilityRole="button"
        accessibilityLabel={t('itinerary.tips')}
      >
        <Text style={styles.tipsTitle}>💡 {t('itinerary.tips')}</Text>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <Text style={styles.tipsChevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.tipsList}>
          {tips.map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ItineraryResult({
  itinerary,
  onPlacePress,
  onStartNavigation,
  onSaveCollection,
}: ItineraryResultProps): ReactElement {
  const router = useRouter();

  const allPlaceIds = itinerary.stops
    .map(s => s.placeId)
    .filter((id): id is string => Boolean(id));

  const handleShowAllOnMap = useCallback(() => {
    if (allPlaceIds.length === 0) return;
    // Navigate to map with first place focused; all places highlighted via query param
    router.push(`/?focusPlaceId=${allPlaceIds[0]}&itineraryPlaces=${allPlaceIds.join(',')}`);
  }, [router, allPlaceIds]);

  const handleStartNavigation = useCallback(
    (placeId: string, placeName: string) => {
      if (onStartNavigation) {
        onStartNavigation(placeId, placeName);
      } else {
        router.push(`/navigation?destinationId=${placeId}`);
      }
    },
    [router, onStartNavigation],
  );

  const handleSaveCollection = useCallback(() => {
    if (onSaveCollection) {
      onSaveCollection(itinerary);
    } else {
      Alert.alert(t('itinerary.saveCollection'), t('itinerary.saveCollectionHint'));
    }
  }, [itinerary, onSaveCollection]);

  const handleShare = useCallback(async () => {
    const lines = [
      `🗺️ ${t('itinerary.title')}: ${itinerary.city}`,
      itinerary.summary,
      '',
      ...itinerary.stops.map(s => `⏰ ${s.time} — ${s.placeName} (${s.duration})`),
      '',
      itinerary.tips?.length ? `💡 ${itinerary.tips.join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    try {
      await Share.share({ message: lines });
    } catch {
      // user cancelled or error
    }
  }, [itinerary]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.cityIcon}>🌍</Text>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{t('itinerary.dayTripIn', { city: itinerary.city })}</Text>
            <Text style={styles.headerMeta}>
              {itinerary.durationHours} {t('itinerary.hours')} · {itinerary.budget}
            </Text>
          </View>
        </View>
        <Text style={styles.summary}>{itinerary.summary}</Text>

        {/* Action buttons */}
        <View style={styles.headerActions}>
          {allPlaceIds.length > 0 ? (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={handleShowAllOnMap}
              accessibilityRole="button"
              accessibilityLabel={t('itinerary.showAllOnMap', { count: String(allPlaceIds.length) })}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <Text style={styles.actionBtnTextPrimary}>
                🗺️ {t('itinerary.showAllOnMap', { count: String(allPlaceIds.length) })}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.actionBtn}
            onPress={handleSaveCollection}
            accessibilityRole="button"
            accessibilityLabel={t('itinerary.saveCollection')}
          >
            <Text style={styles.actionBtnText}>🔖 {t('itinerary.saveCollection')}</Text>
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={() => { void handleShare(); }}
            accessibilityRole="button"
            accessibilityLabel={t('itinerary.share')}
          >
            <Text style={styles.actionBtnText}>↑ {t('itinerary.share')}</Text>
          </Pressable>
        </View>
      </View>

      {/* Stops */}
      <ScrollView
        style={styles.stopsScroll}
        contentContainerStyle={styles.stopsContent}
        showsVerticalScrollIndicator={false}
      >
        {itinerary.stops.length === 0 ? (
          <Text style={styles.emptyText}>{t('itinerary.noStops')}</Text>
        ) : (
          itinerary.stops.map((stop, idx) => (
            <StopCard
              key={`${stop.placeId ?? stop.placeName}-${idx}`}
              stop={stop}
              index={idx}
              isLast={idx === itinerary.stops.length - 1}
              onPress={onPlacePress}
              onNavigate={handleStartNavigation}
            />
          ))
        )}

        <TipsSection tips={itinerary.tips ?? []} />

        {/* Start navigation CTA */}
        {itinerary.stops[0]?.placeId ? (
          <Pressable
            style={styles.startNavBtn}
            onPress={() => handleStartNavigation(itinerary.stops[0]!.placeId!, itinerary.stops[0]!.placeName)}
            accessibilityRole="button"
            accessibilityLabel={t('itinerary.startNavigation')}
          >
            <Text style={styles.startNavText}>🧭 {t('itinerary.startNavigation')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PRIMARY = '#1565C0';
const ACCENT = '#0288D1';
const SURFACE = '#FFFFFF';
const BG = '#F5F7FA';
const BORDER = '#E0E6ED';
const TEXT_PRIMARY = '#1A1A2E';
const TEXT_SECONDARY = '#5A6A7A';
const TIMELINE_COLOR = '#B0BEC5';

const styles = StyleSheet.create({
  container: {
    backgroundColor: BG,
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  // Header
  header: {
    backgroundColor: PRIMARY,
    padding: 16,
    gap: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cityIcon: {
    fontSize: 28,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  headerMeta: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 2,
  },
  summary: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 21,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  actionBtnPrimary: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
  actionBtnTextPrimary: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  // Stops list
  stopsScroll: {
    maxHeight: 480,
  },
  stopsContent: {
    padding: 12,
    gap: 0,
  },
  emptyText: {
    color: TEXT_SECONDARY,
    textAlign: 'center',
    padding: 24,
    fontSize: 14,
  },
  // Timeline
  stopRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  timelineCol: {
    alignItems: 'center',
    width: 60,
  },
  timeBadge: {
    backgroundColor: ACCENT,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    minWidth: 52,
    alignItems: 'center',
  },
  timeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  connector: {
    width: 2,
    flex: 1,
    minHeight: 20,
    backgroundColor: TIMELINE_COLOR,
    marginTop: 2,
    marginBottom: 0,
  },
  // Stop card
  stopCard: {
    flex: 1,
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  stopCardPressed: {
    opacity: 0.85,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stopIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  stopTitleBlock: {
    flex: 1,
  },
  stopNumber: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '500',
  },
  stopName: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  durationBadge: {
    backgroundColor: '#E8F4FD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  durationText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '600',
  },
  stopActivity: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    lineHeight: 18,
  },
  stopAddress: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    lineHeight: 16,
  },
  notesRow: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: '#FFFDE7',
    borderRadius: 8,
    padding: 6,
  },
  notesIcon: {
    fontSize: 12,
  },
  notesText: {
    color: '#5D4037',
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  stopActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  stopActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  stopActionNavBtn: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
  },
  stopActionText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '500',
  },
  stopActionNavText: {
    color: '#FFF',
  },
  // Tips
  tipsCard: {
    backgroundColor: '#FFFDE7',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFF9C4',
  },
  tipsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  tipsTitle: {
    color: '#5D4037',
    fontSize: 14,
    fontWeight: '700',
  },
  tipsChevron: {
    color: '#5D4037',
    fontSize: 12,
  },
  tipsList: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
  },
  tipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tipBullet: {
    color: '#5D4037',
    fontSize: 14,
    marginTop: 1,
  },
  tipText: {
    color: '#5D4037',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  // Start navigation
  startNavBtn: {
    backgroundColor: '#43A047',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  startNavText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
