/**
 * TripDetailScreen — saved trip detail view.
 *
 * Shows:
 * - Map with all stops highlighted (via MapCanvas marker props)
 * - Stop timeline with estimated arrival times
 * - Distance and duration per segment
 * - Edit, Share, Clone and Start navigation actions
 */
import { Button, Text, tokens } from '@iraq-maps/ui';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  Alert,
  Clipboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetailStop {
  id: string;
  placeName: string;
  coord: [number, number];
  position: number;
  note: string | null;
  arrivalOffsetS: number | null;
  durationAtStopS: number;
}

export interface DetailSegment {
  fromStopId: string;
  toStopId: string;
  distanceM: number;
  durationS: number;
}

export interface DetailTripPlan {
  id: string;
  name: string;
  description: string | null;
  totalDistanceM: number;
  totalDurationS: number;
  stopsCount: number;
  mode: 'car' | 'walk';
  shareToken: string | null;
  createdAt: string;
  stops: DetailStop[];
  segments: DetailSegment[];
}

export interface TripDetailScreenProps {
  plan: DetailTripPlan;
  onBack?: () => void;
  onEdit?: (plan: DetailTripPlan) => void;
  onStart?: (plan: DetailTripPlan) => void;
  onShare?: (tripId: string) => Promise<string>;
  onClone?: (tripId: string) => Promise<void>;
  onDelete?: (tripId: string) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (h === 0) return t('active.durationMin', { n: Math.max(1, m) });
  return t('active.durationHourMin', { h, m });
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtArrival(offsetS: number): string {
  const now = new Date();
  const arrival = new Date(now.getTime() + offsetS * 1000);
  return arrival.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatChipProps {
  label: string;
  value: string;
  dark: boolean;
}

function StatChip({ label, value, dark }: StatChipProps): ReactElement {
  return (
    <View style={[styles.statChip, dark && styles.statChipDark]}>
      <RNText style={[styles.statChipValue, dark && styles.textPrimaryDark]}>{value}</RNText>
      <RNText style={[styles.statChipLabel, dark && styles.textSecondaryDark]}>{label}</RNText>
    </View>
  );
}

interface TimelineRowProps {
  stop: DetailStop;
  segment: DetailSegment | null; // segment from this stop to the next
  isFirst: boolean;
  isLast: boolean;
  dark: boolean;
}

function TimelineRow({
  stop,
  segment,
  isFirst,
  isLast,
  dark,
}: TimelineRowProps): ReactElement {
  return (
    <View style={styles.timelineRow}>
      {/* Dot + line */}
      <View style={styles.timelineLeft}>
        <View
          style={[
            styles.timelineDot,
            isFirst && styles.timelineDotFirst,
            isLast && styles.timelineDotLast,
            dark && styles.timelineDotDark,
          ]}
        >
          <RNText style={styles.timelineDotText}>{stop.position + 1}</RNText>
        </View>
        {!isLast && (
          <View style={[styles.timelineLine, dark && styles.timelineLineDark]}>
            {/* Segment distance + time */}
            {segment && (
              <View style={styles.segmentInfo}>
                <RNText style={[styles.segmentText, dark && styles.textSecondaryDark]}>
                  {fmtDist(segment.distanceM)}
                </RNText>
                <RNText style={[styles.segmentTime, dark && styles.textSecondaryDark]}>
                  {fmtDuration(segment.durationS)}
                </RNText>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.timelineContent}>
        <View style={styles.timelineMain}>
          <RNText
            style={[styles.stopName, dark && styles.textPrimaryDark]}
            numberOfLines={1}
          >
            {stop.placeName}
          </RNText>

          {stop.arrivalOffsetS != null && (
            <RNText style={[styles.stopArrival, dark && styles.textSecondaryDark]}>
              {t('tripPlanner.arrivalAt', { time: fmtArrival(stop.arrivalOffsetS) })}
            </RNText>
          )}

          {stop.durationAtStopS > 0 && (
            <RNText style={[styles.stopDwell, dark && styles.textSecondaryDark]}>
              🕐 {t('tripPlanner.durationAtStopMin', { n: Math.round(stop.durationAtStopS / 60) })}
            </RNText>
          )}

          {stop.note ? (
            <RNText
              style={[styles.stopNote, dark && styles.textSecondaryDark]}
              numberOfLines={2}
            >
              📝 {stop.note}
            </RNText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function TripDetailScreen({
  plan,
  onBack,
  onEdit,
  onStart,
  onShare,
  onClone,
  onDelete,
}: TripDetailScreenProps): ReactElement {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [sharing, setSharing] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Compute a bounding box for display label
  const mapBbox = useMemo((): [number, number, number, number] | undefined => {
    if (plan.stops.length === 0) return undefined;
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const s of plan.stops) {
      if (s.coord[0] < minLon) minLon = s.coord[0];
      if (s.coord[0] > maxLon) maxLon = s.coord[0];
      if (s.coord[1] < minLat) minLat = s.coord[1];
      if (s.coord[1] > maxLat) maxLat = s.coord[1];
    }
    const padLon = Math.max(0.005, (maxLon - minLon) * 0.2);
    const padLat = Math.max(0.005, (maxLat - minLat) * 0.2);
    return [minLon - padLon, minLat - padLat, maxLon + padLon, maxLat + padLat] as const;
  }, [plan.stops]);

  // Build segment index keyed by fromStopId
  const segmentByFrom = useMemo(() => {
    const map = new Map<string, DetailSegment>();
    for (const seg of plan.segments) {
      map.set(seg.fromStopId, seg);
    }
    return map;
  }, [plan.segments]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (!onShare) return;
    setSharing(true);
    try {
      const token = await onShare(plan.id);
      const link = `iraqmaps://trip/${token}`;
      Clipboard.setString(link);
      Alert.alert(t('tripPlanner.shareLink'), link);
    } catch {
      Alert.alert('', t('tripPlanner.error'));
    } finally {
      setSharing(false);
    }
  }, [onShare, plan.id]);

  const handleClone = useCallback(async () => {
    if (!onClone) return;
    setCloning(true);
    try {
      await onClone(plan.id);
      Alert.alert('', t('tripPlanner.cloned'));
    } catch {
      Alert.alert('', t('tripPlanner.error'));
    } finally {
      setCloning(false);
    }
  }, [onClone, plan.id]);

  const handleDelete = useCallback(() => {
    Alert.alert(t('tripPlanner.delete'), t('tripPlanner.deleteConfirm'), [
      { text: t('tripPlanner.deleteNo'), style: 'cancel' },
      {
        text: t('tripPlanner.deleteYes'),
        style: 'destructive',
        onPress: async () => {
          await onDelete?.(plan.id);
          onBack?.();
        },
      },
    ]);
  }, [onDelete, onBack, plan.id]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      {/* Header */}
      <View style={[styles.header, dark && styles.headerDark]}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.headerBtn} accessibilityRole="button">
            <RNText style={[styles.headerBtnText, dark && styles.textPrimaryDark]}>←</RNText>
          </TouchableOpacity>
        )}
        <RNText
          style={[styles.headerTitle, dark && styles.textPrimaryDark]}
          numberOfLines={1}
        >
          {plan.name}
        </RNText>
        <TouchableOpacity onPress={handleDelete} style={styles.headerBtn} accessibilityRole="button">
          <RNText style={styles.deleteIcon}>🗑️</RNText>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Map placeholder — host passes a rendered map via children or a map prop */}
        {plan.stops.length > 0 && mapBbox && (
          <View style={[styles.mapWrap, dark && styles.mapWrapDark]}>
            <RNText style={[styles.mapPlaceholderText, dark && styles.textSecondaryDark]}>
              🗺️ {plan.stops.length} {t('tripPlanner.stops', { n: plan.stops.length })}
              {'  ·  '}
              {fmtDist(plan.totalDistanceM)}
            </RNText>
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatChip
            label={t('active.tripDistance')}
            value={fmtDist(plan.totalDistanceM)}
            dark={dark}
          />
          <StatChip
            label={t('active.tripDuration')}
            value={fmtDuration(plan.totalDurationS)}
            dark={dark}
          />
          <StatChip
            label={t('tripPlanner.stops', { n: '' }).replace(' ', '')}
            value={String(plan.stopsCount)}
            dark={dark}
          />
        </View>

        {/* Description */}
        {plan.description ? (
          <View style={[styles.descCard, dark && styles.cardDark]}>
            <RNText style={[styles.descText, dark && styles.textSecondaryDark]}>
              {plan.description}
            </RNText>
          </View>
        ) : null}

        {/* Created at */}
        <RNText style={[styles.createdAt, dark && styles.textSecondaryDark]}>
          {fmtDate(plan.createdAt)}
          {'  ·  '}
          {plan.mode === 'car' ? '🚗' : '🚶'}{' '}
          {plan.mode === 'car' ? t('tripPlanner.modeCar') : t('tripPlanner.modeWalk')}
        </RNText>

        {/* Timeline */}
        <RNText style={[styles.sectionTitle, dark && styles.textSecondaryDark]}>
          {t('tripPlanner.timeline')}
        </RNText>

        <View style={[styles.timelineCard, dark && styles.cardDark]}>
          {plan.stops.map((stop, i) => (
            <TimelineRow
              key={stop.id}
              stop={stop}
              segment={segmentByFrom.get(stop.id) ?? null}
              isFirst={i === 0}
              isLast={i === plan.stops.length - 1}
              dark={dark}
            />
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.actionGrid}>
          {onEdit && (
            <Pressable
              style={[styles.actionBtn, dark ? styles.actionBtnSecDark : styles.actionBtnSec]}
              onPress={() => onEdit(plan)}
              accessibilityRole="button"
            >
              <Text style={[styles.actionBtnText, dark && styles.textPrimaryDark]}>
                ✏️ {t('tripPlanner.edit')}
              </Text>
            </Pressable>
          )}

          {onShare && (
            <Pressable
              style={[styles.actionBtn, dark ? styles.actionBtnSecDark : styles.actionBtnSec, sharing && styles.actionBtnDisabled]}
              onPress={handleShare}
              disabled={sharing}
              accessibilityRole="button"
            >
              <Text style={[styles.actionBtnText, dark && styles.textPrimaryDark]}>
                ⎋ {t('tripPlanner.share')}
              </Text>
            </Pressable>
          )}

          {onClone && (
            <Pressable
              style={[styles.actionBtn, dark ? styles.actionBtnSecDark : styles.actionBtnSec, cloning && styles.actionBtnDisabled]}
              onPress={handleClone}
              disabled={cloning}
              accessibilityRole="button"
            >
              <Text style={[styles.actionBtnText, dark && styles.textPrimaryDark]}>
                ⎘ {t('tripPlanner.clone')}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Start navigation */}
        {onStart && plan.stops.length >= 2 && (
          <View style={styles.startBtn}>
            <Button
              label={t('tripPlanner.start')}
              onPress={() => onStart(plan)}
            />
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f5f5f5' },
  rootDark: { backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerDark: { backgroundColor: '#1e1e1e', borderBottomColor: '#333' },
  headerBtn: { width: 36, alignItems: 'center' },
  headerBtnText: { fontSize: 20, color: '#333' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  deleteIcon: { fontSize: 18 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  mapWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 100,
    marginBottom: 14,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapWrapDark: { backgroundColor: '#1a2e1a' },
  mapPlaceholderText: { fontSize: 14, color: '#555' },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  statChipDark: { backgroundColor: '#1e1e1e' },
  statChipValue: { fontSize: 15, fontWeight: '700', color: '#111' },
  statChipLabel: { fontSize: 11, color: '#888', marginTop: 3, textAlign: 'center' },

  descCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  descText: { fontSize: 13, color: '#555', lineHeight: 20 },

  createdAt: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 14,
    textAlign: 'center',
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },

  timelineCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  cardDark: { backgroundColor: '#1e1e1e' },

  timelineRow: {
    flexDirection: 'row',
    paddingStart: 14,
  },
  timelineLeft: {
    width: 32,
    alignItems: 'center',
    paddingTop: 14,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotFirst: { backgroundColor: '#4CAF50' },
  timelineDotLast: { backgroundColor: '#F44336' },
  timelineDotDark: {},
  timelineDotText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#e0e0e0',
    marginVertical: 2,
    position: 'relative',
    alignItems: 'center',
    minHeight: 40,
  },
  timelineLineDark: { backgroundColor: '#333' },
  segmentInfo: {
    position: 'absolute',
    start: 6,
    top: 4,
    gap: 2,
  },
  segmentText: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  segmentTime: { fontSize: 11, color: '#aaa' },

  timelineContent: {
    flex: 1,
    paddingStart: 12,
    paddingEnd: 16,
    paddingBottom: 14,
  },
  timelineMain: { paddingTop: 14 },
  stopName: { fontSize: 14, fontWeight: '600', color: '#111' },
  stopArrival: { fontSize: 12, color: '#888', marginTop: 3 },
  stopDwell: { fontSize: 12, color: '#888', marginTop: 2 },
  stopNote: { fontSize: 12, color: '#888', marginTop: 2, fontStyle: 'italic' },

  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionBtnSec: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' },
  actionBtnSecDark: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333' },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 14, color: '#333', fontWeight: '600' },

  startBtn: {
    borderRadius: 12,
    marginBottom: 8,
  },

  bottomPad: { height: 60 },

  textPrimaryDark: { color: '#e0e0e0' },
  textSecondaryDark: { color: '#999' },
});
