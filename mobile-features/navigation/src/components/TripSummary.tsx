/**
 * TripSummary — post-trip summary card shown after navigation ends.
 *
 * Features:
 * - Trip completed animation (scale + fade in)
 * - Duration vs estimated comparison
 * - Distance traveled
 * - Route taken on MapCanvas
 * - Report issue with the route
 * - Rate this route (1–5 stars)
 * - Share trip stats
 * - "Navigate again" button
 */
import { Text, tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { t } from '../strings';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripSummaryTrip {
  /** Actual duration in seconds. */
  durationS: number;
  /** Estimated duration in seconds (from route plan). */
  estimatedDurationS: number;
  /** Distance traveled in meters. */
  distanceM: number;
  /** Origin label. */
  originName: string;
  /** Destination label. */
  destinationName: string;
  /** When the trip started (ISO-8601). */
  startedAt: string;
  /** Rough polyline (lat/lon pairs) for map display. */
  polyline?: Array<{ lat: number; lon: number }>;
}

export interface TripSummaryProps {
  trip: TripSummaryTrip;
  onNavigateAgain?: () => void;
  onClose?: () => void;
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

function getDurationDelta(actualS: number, estimatedS: number): { label: string; positive: boolean } {
  const diffS = estimatedS - actualS;
  const diffMin = Math.round(Math.abs(diffS) / 60);
  if (diffMin < 2) return { label: t('tripSummary.onTime'), positive: true };
  if (diffS > 0) return { label: t('tripSummary.faster', { min: diffMin }), positive: true };
  return { label: t('tripSummary.slower', { min: diffMin }), positive: false };
}

// ─── Star rating ──────────────────────────────────────────────────────────────

interface StarRatingProps {
  value: number;
  onChange: (n: number) => void;
}

function StarRating({ value, onChange }: StarRatingProps): ReactElement {
  return (
    <View style={styles.starsRow} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ checked: value >= n }}
          style={styles.starBtn}
        >
          <Text style={[styles.starText, value >= n && styles.starFilled]}>
            {value >= n ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Report modal ─────────────────────────────────────────────────────────────

interface ReportModalProps {
  visible: boolean;
  dark: boolean;
  onSubmit: (issue: string) => void;
  onCancel: () => void;
}

function ReportModal({ visible, dark, onSubmit, onCancel }: ReportModalProps): ReactElement {
  const [text, setText] = useState('');
  const issues = [
    'الخريطة غير دقيقة',
    'وقت الوصول خاطئ',
    'المسار يمر بطريق مغلق',
    'تحذير مرور مفقود',
    'أخرى',
  ];
  const [selected, setSelected] = useState('');

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.reportOverlay}>
        <View style={[styles.reportBox, dark && styles.reportBoxDark]}>
          <Text style={[styles.reportTitle, dark && styles.textPrimaryDark]}>
            {t('tripSummary.reportIssue')}
          </Text>

          {issues.map((issue) => (
            <TouchableOpacity
              key={issue}
              style={[
                styles.issueOption,
                selected === issue && styles.issueOptionSelected,
                dark && styles.issueOptionDark,
              ]}
              onPress={() => setSelected(issue)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected === issue }}
            >
              <View style={[styles.radioCircle, selected === issue && styles.radioCircleSelected]} />
              <Text style={[styles.issueText, dark && styles.textPrimaryDark]}>{issue}</Text>
            </TouchableOpacity>
          ))}

          <TextInput
            style={[styles.reportInput, dark && styles.reportInputDark]}
            value={text}
            onChangeText={setText}
            placeholder="ملاحظات إضافية (اختياري)"
            placeholderTextColor={dark ? '#666' : '#bbb'}
            multiline
            textAlign="right"
          />

          <View style={styles.reportActions}>
            <TouchableOpacity onPress={onCancel} style={styles.reportCancelBtn}>
              <Text style={[styles.reportCancelText, dark && styles.textSecondaryDark]}>
                {t('savedRoutes.scheduleCancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reportSubmitBtn}
              onPress={() => {
                const issue = selected || text.trim();
                if (issue) onSubmit(issue);
              }}
            >
              <Text style={styles.reportSubmitText}>إرسال</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Completion animation ─────────────────────────────────────────────────────

function CompletionBadge(): ReactElement {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [scale, opacity]);

  return (
    <Animated.View style={[styles.completionBadge, { transform: [{ scale }], opacity }]}>
      <Text style={styles.completionEmoji}>✅</Text>
      <Text style={styles.completionTitle}>{t('tripSummary.title')}</Text>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TripSummary({ trip, onNavigateAgain, onClose }: TripSummaryProps): ReactElement {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  const delta = getDurationDelta(trip.durationS, trip.estimatedDurationS);

  const handleRating = useCallback((n: number) => {
    setRating(n);
    // In production, call API to record rating
    setTimeout(() => setRatingSubmitted(true), 500);
  }, []);

  const handleReport = useCallback((_issue: string) => {
    setReportVisible(false);
    // In production, call API with issue
    Alert.alert('', t('tripSummary.issueReported'), [{ text: 'حسناً' }]);
  }, []);

  const handleShare = useCallback(async () => {
    const km = (trip.distanceM / 1000).toFixed(1);
    const duration = fmtDuration(trip.durationS);
    const text = t('tripSummary.shareText', { km, duration });
    try {
      await Share.share({ message: text });
    } catch {
      // user cancelled
    }
  }, [trip]);

  // Center map on route midpoint
  const mapRegion = trip.polyline && trip.polyline.length > 0
    ? (() => {
        const mid = trip.polyline[Math.floor(trip.polyline.length / 2)]!;
        return { latitude: mid.lat, longitude: mid.lon, zoom: 13 };
      })()
    : undefined;

  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Completion badge */}
        <CompletionBadge />

        {/* Origin → Destination */}
        <View style={[styles.routeLabel, dark && styles.routeLabelDark]}>
          <RNText style={[styles.routeLabelText, dark && styles.textSecondaryDark]} numberOfLines={1}>
            {trip.originName}
          </RNText>
          <Text style={[styles.routeArrow, dark && styles.textSecondaryDark]}>→</Text>
          <RNText style={[styles.routeLabelText, dark && styles.textSecondaryDark]} numberOfLines={1}>
            {trip.destinationName}
          </RNText>
        </View>

        {/* Stat tiles */}
        <View style={styles.statGrid}>
          {/* Duration */}
          <View style={[styles.statCard, dark && styles.statCardDark]}>
            <Text style={[styles.statCardTitle, dark && styles.textSecondaryDark]}>
              {t('tripSummary.duration')}
            </Text>
            <Text style={[styles.statCardValue, dark && styles.textPrimaryDark]}>
              {fmtDuration(trip.durationS)}
            </Text>
            <Text style={[styles.statCardSub, dark && styles.textSecondaryDark]}>
              {t('tripSummary.estimated', { duration: fmtDuration(trip.estimatedDurationS) })}
            </Text>
            <Text
              style={[
                styles.statCardDelta,
                delta.positive ? styles.deltaPositive : styles.deltaNegative,
              ]}
            >
              {delta.label}
            </Text>
          </View>

          {/* Distance */}
          <View style={[styles.statCard, dark && styles.statCardDark]}>
            <Text style={[styles.statCardTitle, dark && styles.textSecondaryDark]}>
              {t('tripSummary.distance')}
            </Text>
            <Text style={[styles.statCardValue, dark && styles.textPrimaryDark]}>
              {fmtDist(trip.distanceM)}
            </Text>
            <Text style={[styles.statCardSub, dark && styles.textSecondaryDark]}>
              {t('tripSummary.distanceKm', { n: (trip.distanceM / 1000).toFixed(2) })}
            </Text>
          </View>
        </View>

        {/* Map */}
        {mapRegion && (
          <View style={[styles.mapCard, dark && styles.mapCardDark]}>
            <Text style={[styles.mapCardTitle, dark && styles.textSecondaryDark]}>
              {t('tripSummary.routeTaken')}
            </Text>
            <View style={styles.mapWrap}>
              {/* MapCanvas placeholder — city/apiBaseUrl injected by host */}
              <View style={[styles.map, styles.mapPlaceholder]} />
            </View>
          </View>
        )}

        {/* Star rating */}
        <View style={[styles.ratingCard, dark && styles.ratingCardDark]}>
          <Text style={[styles.ratingTitle, dark && styles.textPrimaryDark]}>
            {t('tripSummary.rateRoute')}
          </Text>
          {ratingSubmitted ? (
            <Text style={[styles.ratingConfirm, dark && styles.textSecondaryDark]}>
              {t('tripSummary.rateSaved')} {'⭐'.repeat(rating)}
            </Text>
          ) : (
            <StarRating value={rating} onChange={handleRating} />
          )}
        </View>

        {/* Action buttons */}
        <Pressable
          style={[styles.primaryBtn]}
          onPress={onNavigateAgain}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>{t('tripSummary.navigateAgain')}</Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            style={[styles.secondaryBtn, dark ? styles.secondaryBtnDark : styles.secondaryBtnLight]}
            onPress={() => setReportVisible(true)}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryBtnText, dark && styles.textPrimaryDark]}>
              ⚠️ {t('tripSummary.reportIssue')}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, dark ? styles.secondaryBtnDark : styles.secondaryBtnLight]}
            onPress={handleShare}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryBtnText, dark && styles.textPrimaryDark]}>
              📤 {t('tripSummary.share')}
            </Text>
          </Pressable>
        </View>

        {onClose && (
          <TouchableOpacity style={styles.closeLink} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.closeLinkText, dark && styles.textSecondaryDark]}>
              {t('active.close')}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <ReportModal
        visible={reportVisible}
        dark={dark}
        onSubmit={handleReport}
        onCancel={() => setReportVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  rootDark: {
    backgroundColor: '#121212',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
  },
  completionBadge: {
    alignItems: 'center',
    marginBottom: 16,
  },
  completionEmoji: {
    fontSize: 56,
    marginBottom: 8,
  },
  completionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a6b1a',
    textAlign: 'center',
  },
  routeLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    gap: 6,
  },
  routeLabelDark: {
    backgroundColor: '#1e1e1e',
  },
  routeLabelText: {
    fontSize: 13,
    color: '#555',
    flex: 1,
    textAlign: 'center',
  },
  routeArrow: {
    fontSize: 16,
    color: tokens.color.primary,
    fontWeight: '700',
  },
  statGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  statCardDark: {
    backgroundColor: '#1e1e1e',
  },
  statCardTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
    fontWeight: '600',
  },
  statCardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  statCardSub: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  statCardDelta: {
    fontSize: 12,
    fontWeight: '700',
  },
  deltaPositive: {
    color: '#2e7d32',
  },
  deltaNegative: {
    color: '#c62828',
  },
  mapCard: {
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
  mapCardDark: {
    backgroundColor: '#1e1e1e',
  },
  mapCardTitle: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
    padding: 12,
    paddingBottom: 0,
  },
  mapWrap: {
    height: 180,
    margin: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  mapPlaceholder: {
    backgroundColor: '#c8d8c8',
  },
  ratingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  ratingCardDark: {
    backgroundColor: '#1e1e1e',
  },
  ratingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  starBtn: {
    padding: 4,
  },
  starText: {
    fontSize: 32,
    color: '#ccc',
  },
  starFilled: {
    color: '#ffd600',
  },
  ratingConfirm: {
    fontSize: 14,
    color: '#555',
  },
  primaryBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnLight: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secondaryBtnDark: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#444',
  },
  secondaryBtnText: {
    color: '#333',
    fontSize: 13,
    fontWeight: '600',
  },
  closeLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  closeLinkText: {
    color: '#888',
    fontSize: 14,
  },
  bottomPad: {
    height: 40,
  },
  // Report modal
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportBox: {
    backgroundColor: '#fff',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  reportBoxDark: {
    backgroundColor: '#1e1e1e',
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
    marginBottom: 14,
  },
  issueOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 10,
  },
  issueOptionDark: {
    backgroundColor: 'transparent',
  },
  issueOptionSelected: {
    backgroundColor: '#e8f5e9',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  radioCircleSelected: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  issueText: {
    fontSize: 14,
    color: '#222',
  },
  reportInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#333',
    minHeight: 60,
    marginTop: 8,
    marginBottom: 14,
  },
  reportInputDark: {
    borderColor: '#444',
    backgroundColor: '#2a2a2a',
    color: '#e0e0e0',
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  reportCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  reportCancelText: {
    color: '#888',
    fontSize: 15,
  },
  reportSubmitBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  reportSubmitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  textPrimaryDark: {
    color: '#e0e0e0',
  },
  textSecondaryDark: {
    color: '#999',
  },
});
