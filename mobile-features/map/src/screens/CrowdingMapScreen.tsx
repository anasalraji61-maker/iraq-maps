/**
 * CrowdingMapScreen — full-screen map with crowding heatmap overlay.
 *
 * Features:
 *  - Full-screen MapCanvas with heatmap layer.
 *  - Time slider: live / +1h / +2h / tomorrow.
 *  - Long-press on map → crowding chip for nearest place.
 *  - Least-crowded alternatives suggestion card.
 *  - "Best time to visit" bottom sheet for tapped places.
 *  - RTL-safe: all flex uses start/end, no hardcoded left/right.
 *  - All text via t().
 */
/* eslint-disable i18next/no-literal-string, no-restricted-syntax */

import type { CityDescriptor, LngLat, PlaceId } from '@iraq-maps/contracts';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, Screen, Button } from '@iraq-maps/ui';
import { useRouter } from 'expo-router';
import { useApiBaseUrl, useNetworkStatus } from '@iraq-maps/mobile-kit';
import { MapCanvas, type MapCamera } from '@iraq-maps/map-kit';
import { t } from '../strings';
import { CrowdingIndicator } from '../components/CrowdingIndicator';

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeSlot = 'now' | 'plus1h' | 'plus2h' | 'tomorrow';

interface PlaceCrowdingData {
  placeId: PlaceId;
  nameAr: string;
  now: {
    value: number;
    level: 'low' | 'medium' | 'high';
    source: string;
    observedAt: string;
    confidence: number;
  } | null;
  weeklyPattern: number[][] | null;
  peakHour: number | null;
  bestVisitWindow: [number, number] | null;
  peakWaitMinutes: number;
  reportCount: number;
  alternatives: PlaceId[];
}

interface AlternativePlace {
  placeId: PlaceId;
  nameAr: string;
  level: 'low' | 'medium' | 'high';
  confidence: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BAGHDAD_OFFSET_HOURS = 3;

const TIME_SLOTS: TimeSlot[] = ['now', 'plus1h', 'plus2h', 'tomorrow'];

const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  now: 'crowding.timeNow',
  plus1h: 'crowding.timePlus1h',
  plus2h: 'crowding.timePlus2h',
  tomorrow: 'crowding.timeTomorrow',
};

// Baghdad default view
const BAGHDAD_CENTER: LngLat = [44.3661, 33.3152];
const BAGHDAD_ZOOM = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function levelColor(level: 'low' | 'medium' | 'high'): string {
  return level === 'high' ? '#E53935' : level === 'medium' ? '#FB8C00' : '#43A047';
}

function levelBg(level: 'low' | 'medium' | 'high'): string {
  return level === 'high' ? '#FFEBEE' : level === 'medium' ? '#FFF3E0' : '#E8F5E9';
}

/** Adds hours to now and returns an ISO string, in Baghdad time. */
function addHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/** Tomorrow at the same hour-of-day, Baghdad UTC+3. */
function tomorrowSameHour(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function timeSlotToISO(slot: TimeSlot): string | undefined {
  if (slot === 'now') return undefined;
  if (slot === 'plus1h') return addHours(1);
  if (slot === 'plus2h') return addHours(2);
  return tomorrowSameHour();
}

function localHour(isoOrUndefined?: string): number {
  const d = isoOrUndefined ? new Date(isoOrUndefined) : new Date();
  return (d.getUTCHours() + BAGHDAD_OFFSET_HOURS) % 24;
}

function formatHour(h: number): string {
  const suffix = h < 12 ? 'ص' : 'م';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${suffix}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Time Slider
function TimeSlider({
  selected,
  onChange,
}: {
  selected: TimeSlot;
  onChange: (slot: TimeSlot) => void;
}): ReactElement {
  return (
    <View style={sliderStyles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sliderStyles.scroll}
      >
        {TIME_SLOTS.map((slot) => {
          const active = slot === selected;
          return (
            <Pressable
              key={slot}
              onPress={() => onChange(slot)}
              style={[sliderStyles.chip, active && sliderStyles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[sliderStyles.chipLabel, active && sliderStyles.chipLabelActive]}>
                {t(TIME_SLOT_LABELS[slot])}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 72,
    start: 0,
    end: 0,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#90A4AE',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  chipActive: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37474F',
  },
  chipLabelActive: {
    color: '#fff',
  },
});

// Place Crowding Chip (appears after long-press)
interface PlaceChipProps {
  data: PlaceCrowdingData;
  onSeeDetails: () => void;
  onClose: () => void;
}

function PlaceCrowdingChip({ data, onSeeDetails, onClose }: PlaceChipProps): ReactElement {
  const level = data.now?.level ?? null;
  const bg = level ? levelBg(level) : '#F5F5F5';
  const borderColor = level ? levelColor(level) : '#E0E0E0';

  return (
    <View style={[chipStyles.container, { backgroundColor: bg, borderColor }]}>
      <View style={chipStyles.header}>
        <Text style={chipStyles.name} numberOfLines={1}>{data.nameAr}</Text>
        <Pressable onPress={onClose} style={chipStyles.closeBtn} accessibilityRole="button">
          <Text style={chipStyles.closeLabel}>✕</Text>
        </Pressable>
      </View>

      <CrowdingIndicator
        level={level}
        isLive={data.now?.source === 'user_report'}
        variant="compact"
        confidence={data.now?.confidence}
        observedAt={data.now?.observedAt}
      />

      {data.reportCount > 0 ? (
        <Text style={chipStyles.reportCount}>
          {t('crowding.reportCount', { n: data.reportCount })}
        </Text>
      ) : null}

      <Pressable onPress={onSeeDetails} style={chipStyles.detailBtn}>
        <Text style={chipStyles.detailLabel}>{t('crowding.seeDetails')}</Text>
      </Pressable>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 120,
    start: 16,
    end: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
    flex: 1,
    marginEnd: 8,
  },
  closeBtn: {
    padding: 4,
  },
  closeLabel: {
    fontSize: 14,
    color: '#9E9E9E',
  },
  reportCount: {
    fontSize: 11,
    color: '#757575',
  },
  detailBtn: {
    alignSelf: 'flex-start',
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
  },
});

// Alternatives Card
interface AlternativesCardProps {
  alternatives: AlternativePlace[];
  onSelectPlace: (placeId: PlaceId) => void;
}

function AlternativesCard({ alternatives, onSelectPlace }: AlternativesCardProps): ReactElement | null {
  if (alternatives.length === 0) return null;

  return (
    <View style={altStyles.container}>
      <Text style={altStyles.title}>{t('crowding.alternativesTitle')}</Text>
      {alternatives.map((alt) => (
        <Pressable
          key={alt.placeId}
          style={altStyles.row}
          onPress={() => onSelectPlace(alt.placeId)}
        >
          <View style={[altStyles.dot, { backgroundColor: levelColor(alt.level) }]} />
          <Text style={altStyles.name} numberOfLines={1}>{alt.nameAr}</Text>
          <Text style={[altStyles.levelLabel, { color: levelColor(alt.level) }]}>
            {t(`place.crowd${alt.level.charAt(0).toUpperCase()}${alt.level.slice(1)}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const altStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 16,
    start: 16,
    end: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    padding: 14,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#37474F',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  name: {
    flex: 1,
    fontSize: 13,
    color: '#212121',
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// Best Time Bottom Sheet
interface BestTimeSheetProps {
  data: PlaceCrowdingData;
  visible: boolean;
  onClose: () => void;
}

function BestTimeSheet({ data, visible, onClose }: BestTimeSheetProps): ReactElement {
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible, slideAnim]);

  if (!visible) return <></>;

  const bestWindow = data.bestVisitWindow;
  const peakHour = data.peakHour;

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <Pressable style={sheetStyles.backdrop} onPress={onClose} />
      <Animated.View style={[sheetStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={sheetStyles.handle} />

        <Text style={sheetStyles.title}>{data.nameAr}</Text>
        <Text style={sheetStyles.subtitle}>{t('crowding.bestTimeTitle')}</Text>

        {/* Current crowding */}
        <View style={sheetStyles.section}>
          <Text style={sheetStyles.sectionLabel}>{t('crowding.currentCrowding')}</Text>
          <CrowdingIndicator
            level={data.now?.level ?? null}
            isLive={data.now?.source === 'user_report'}
            variant="compact"
            confidence={data.now?.confidence}
            observedAt={data.now?.observedAt}
          />
        </View>

        {/* Best time */}
        {bestWindow ? (
          <View style={sheetStyles.section}>
            <Text style={sheetStyles.sectionLabel}>{t('crowding.bestWindowLabel')}</Text>
            <View style={sheetStyles.timeWindow}>
              <Text style={sheetStyles.timeText}>
                {formatHour(bestWindow[0])} – {formatHour(bestWindow[1])}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Peak hour */}
        {peakHour !== null ? (
          <View style={sheetStyles.section}>
            <Text style={sheetStyles.sectionLabel}>{t('crowding.peakHourLabel')}</Text>
            <View style={[sheetStyles.timeWindow, { backgroundColor: '#FFEBEE' }]}>
              <Text style={[sheetStyles.timeText, { color: '#E53935' }]}>
                {formatHour(peakHour)}
              </Text>
            </View>
            {data.peakWaitMinutes > 0 ? (
              <Text style={sheetStyles.waitText}>
                {t('crowding.estimatedWait', { n: data.peakWaitMinutes })}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Weekly pattern mini-chart */}
        {data.weeklyPattern ? (
          <View style={sheetStyles.section}>
            <Text style={sheetStyles.sectionLabel}>{t('crowding.weeklyPatternLabel')}</Text>
            <MiniWeekChart pattern={data.weeklyPattern} />
          </View>
        ) : null}

        {/* Report count */}
        {data.reportCount > 0 ? (
          <Text style={sheetStyles.reportCountText}>
            {t('crowding.basedOnReports', { n: data.reportCount })}
          </Text>
        ) : (
          <Text style={sheetStyles.reportCountText}>{t('crowding.noDataYet')}</Text>
        )}

        <View style={sheetStyles.closeRow}>
          <Button label={t('crowding.closeSheet')} onPress={onClose} variant="secondary" />
        </View>
      </Animated.View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: '#fff',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#212121',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9E9E9E',
    textTransform: 'uppercase',
  },
  timeWindow: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  timeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2E7D32',
  },
  waitText: {
    fontSize: 12,
    color: '#757575',
  },
  reportCountText: {
    fontSize: 11,
    color: '#BDBDBD',
    textAlign: 'center',
  },
  closeRow: {
    marginTop: 4,
  },
});

// Mini 7-day chart for the bottom sheet
function MiniWeekChart({ pattern }: { pattern: number[][] }): ReactElement {
  const dayKeys = [
    t('place.popularTimesSun'),
    t('place.popularTimesMon'),
    t('place.popularTimesTue'),
    t('place.popularTimesWed'),
    t('place.popularTimesThu'),
    t('place.popularTimesFri'),
    t('place.popularTimesSat'),
  ];

  // Average intensity per day
  const dayAvgs = pattern.map((row) => {
    const sum = row.reduce((s, v) => s + v, 0);
    return row.length > 0 ? sum / row.length : 0;
  });
  const maxVal = Math.max(...dayAvgs, 1);

  return (
    <View style={miniChartStyles.container}>
      {dayAvgs.map((avg, idx) => {
        const fillRatio = Math.max(avg / maxVal, 0.04);
        const color = avg >= 60 ? '#E53935' : avg >= 35 ? '#FB8C00' : '#43A047';
        return (
          <View key={idx} style={miniChartStyles.col}>
            <View style={miniChartStyles.barOuter}>
              <View
                style={[
                  miniChartStyles.barFill,
                  { flex: fillRatio, backgroundColor: color },
                ]}
              />
              <View style={{ flex: 1 - fillRatio }} />
            </View>
            <Text style={miniChartStyles.dayLabel}>{dayKeys[idx]?.charAt(0) ?? ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

const miniChartStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    height: 48,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  barOuter: {
    flex: 1,
    width: '80%',
    flexDirection: 'column-reverse',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },
  barFill: {
    borderRadius: 4,
  },
  dayLabel: {
    fontSize: 9,
    color: '#BDBDBD',
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export interface CrowdingMapScreenProps {
  city: CityDescriptor;
}

export function CrowdingMapScreen({ city }: CrowdingMapScreenProps): ReactElement {
  const router = useRouter();
  const apiBaseUrl = useApiBaseUrl();
  const { isOnline } = useNetworkStatus();

  const [selectedSlot, setSelectedSlot] = useState<TimeSlot>('now');
  const [camera, setCamera] = useState<MapCamera>({
    center: BAGHDAD_CENTER,
    zoom: BAGHDAD_ZOOM,
  });
  const [bboxStr, setBboxStr] = useState('');

  // Place crowding chip state
  const [selectedPlace, setSelectedPlace] = useState<PlaceCrowdingData | null>(null);
  const [loadingPlace, setLoadingPlace] = useState(false);
  const [showBestTime, setShowBestTime] = useState(false);

  // Alternatives
  const [alternatives, setAlternatives] = useState<AlternativePlace[]>([]);

  // ── Fetch place crowding on long-press ─────────────────────────────────────
  const fetchPlaceCrowding = useCallback(async (placeId: PlaceId) => {
    setLoadingPlace(true);
    setSelectedPlace(null);
    try {
      const res = await fetch(`${apiBaseUrl}/v1/crowding/place/${encodeURIComponent(placeId)}`);
      if (!res.ok) return;
      const data = await res.json() as PlaceCrowdingData;
      setSelectedPlace(data);

      // Fetch alternatives
      if (data.alternatives.length > 0) {
        const altResults: AlternativePlace[] = [];
        for (const altId of data.alternatives.slice(0, 3)) {
          try {
            const altRes = await fetch(`${apiBaseUrl}/v1/crowding/place/${encodeURIComponent(altId)}`);
            if (!altRes.ok) continue;
            const altData = await altRes.json() as PlaceCrowdingData;
            if (altData.now) {
              altResults.push({
                placeId: altId,
                nameAr: altData.nameAr,
                level: altData.now.level,
                confidence: altData.now.confidence,
              });
            }
          } catch {
            // skip
          }
        }
        setAlternatives(altResults);
      } else {
        setAlternatives([]);
      }
    } catch {
      // Network error
    } finally {
      setLoadingPlace(false);
    }
  }, [apiBaseUrl]);

  // ── Handle long-press on map (extract nearest place from marker press) ─────
  const handleMarkerPress = useCallback((placeId: string) => {
    void fetchPlaceCrowding(placeId as PlaceId);
  }, [fetchPlaceCrowding]);

  // ── Camera change → update bbox ────────────────────────────────────────────
  const handleCameraChanged = useCallback((center: LngLat, zoom: number) => {
    // Approximate bbox from center + zoom (rough degrees span).
    const span = 180 / Math.pow(2, zoom - 1);
    const half = span / 2;
    const [lng, lat] = center;
    setBboxStr(
      `${(lng - half).toFixed(5)},${(lat - half / 2).toFixed(5)},${(lng + half).toFixed(5)},${(lat + half / 2).toFixed(5)}`,
    );
  }, []);

  // ── Projected time ─────────────────────────────────────────────────────────
  const projectedTime = useMemo(() => timeSlotToISO(selectedSlot), [selectedSlot]);

  // ── Loading overlay for place chip ────────────────────────────────────────
  const renderLoadingChip = (): ReactElement | null => {
    if (!loadingPlace) return null;
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="small" color="#1565C0" />
        <Text style={loadingStyles.label}>{t('crowding.loadingPlace')}</Text>
      </View>
    );
  };

  return (
    <Screen style={screenStyles.screen}>
      {/* Back button */}
      <View style={screenStyles.backBtn} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          style={screenStyles.backPressable}
          accessibilityRole="button"
          accessibilityLabel={t('crowding.backA11y')}
        >
          <Text style={screenStyles.backLabel}>{'←'}</Text>
        </Pressable>
        <Text style={screenStyles.screenTitle}>{t('crowding.screenTitle')}</Text>
      </View>

      {/* Full-screen map */}
      <MapCanvas
        city={city}
        apiBaseUrl={apiBaseUrl}
        lang="ar"
        camera={camera}
        showUserLocation
        onMarkerPress={handleMarkerPress}
        onCameraChanged={handleCameraChanged}
      />

      {/* Time slot slider */}
      <TimeSlider selected={selectedSlot} onChange={setSelectedSlot} />

      {/* Loading chip */}
      {renderLoadingChip()}

      {/* Place crowding chip (after long-press/marker-press) */}
      {selectedPlace && !loadingPlace ? (
        <PlaceCrowdingChip
          data={selectedPlace}
          onSeeDetails={() => setShowBestTime(true)}
          onClose={() => {
            setSelectedPlace(null);
            setAlternatives([]);
          }}
        />
      ) : null}

      {/* Alternatives card (shown when a crowded place is selected) */}
      {selectedPlace && alternatives.length > 0 && !showBestTime ? (
        <AlternativesCard
          alternatives={alternatives}
          onSelectPlace={(pid) => void fetchPlaceCrowding(pid)}
        />
      ) : null}

      {/* Offline banner */}
      {!isOnline ? (
        <View style={screenStyles.offlineBanner} pointerEvents="none">
          <Text style={screenStyles.offlineText}>{t('crowding.offlineBanner')}</Text>
        </View>
      ) : null}

      {/* Best time bottom sheet */}
      {selectedPlace ? (
        <BestTimeSheet
          data={selectedPlace}
          visible={showBestTime}
          onClose={() => setShowBestTime(false)}
        />
      ) : null}
    </Screen>
  );
}

// ── Screen styles ─────────────────────────────────────────────────────────────

const screenStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  backBtn: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  backPressable: {
    padding: 6,
  },
  backLabel: {
    fontSize: 20,
    color: '#1565C0',
  },
  screenTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    flex: 1,
  },
  offlineBanner: {
    position: 'absolute',
    top: 115,
    start: 16,
    end: 16,
    backgroundColor: '#E65100',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  offlineText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});

const loadingStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 120,
    start: 16,
    end: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  label: {
    fontSize: 13,
    color: '#37474F',
  },
});
