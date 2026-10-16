/**
 * NavigationScreen — enhanced turn-by-turn navigation screen.
 *
 * Features (beyond ActiveNavigationScreen):
 * - Large next-turn instruction card with Arabic direction text
 * - Distance to next turn (large, readable)
 * - LaneGuidance SVG visualization
 * - SpeedLimit sign (Iraq style) + CurrentSpeed display
 * - ETA + remaining distance/time row
 * - Re-route on deviation
 * - Night mode (dark theme auto via useColorScheme)
 * - Arrived! screen with trip summary
 * - Search along route shortcut
 */
import type { CityDescriptor, ManeuverModifier, ManeuverType } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { MapCanvas } from '@iraq-maps/map-kit';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, Text as RNText, TouchableOpacity, useColorScheme, View } from 'react-native';
import type { Lane } from '../components/LaneGuidance';
import { LaneGuidance } from '../components/LaneGuidance';
import { ManeuverArrow } from '../components/ManeuverArrow';
import { CurrentSpeed, SpeedLimit } from '../components/SpeedLimit';
import type { NavigationState } from '../hooks/useNavigation';
import { t } from '../strings';
import { SavedRoutesSheet } from './SavedRoutesSheet';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.ceil((totalS % 3600) / 60);
  if (h === 0) return t('active.durationMin', { n: Math.max(1, m) });
  if (m === 0) return t('active.durationHour', { h });
  return t('active.durationHourMin', { h, m });
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtEta(date: Date): string {
  return date.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Arabic direction text for a maneuver. */
function arabicDirection(type: ManeuverType, modifier?: ManeuverModifier): string {
  if (type === 'depart') return 'انطلق';
  if (type === 'arrive') return 'وصلت إلى وجهتك';
  if (type === 'uturn') return 'استدر';
  if (type === 'roundabout_enter') return 'ادخل الدوار';
  if (type === 'roundabout_exit') return 'اخرج من الدوار';
  if (type === 'ferry_enter') return 'اركب العبّارة';
  if (type === 'ferry_exit') return 'انزل من العبّارة';
  if (type === 'ramp') return 'خذ المنحدر';
  if (type === 'exit') return 'اخرج من الطريق';
  if (type === 'fork') return 'خذ التشعب';
  if (type === 'merge') return 'اندمج';
  // turn / continue
  switch (modifier) {
    case 'slight_right': return 'انحرف يميناً قليلاً';
    case 'right': return 'انعطف يميناً';
    case 'sharp_right': return 'انعطف يميناً بشدة';
    case 'slight_left': return 'انحرف يساراً قليلاً';
    case 'left': return 'انعطف يساراً';
    case 'sharp_left': return 'انعطف يساراً بشدة';
    default: return 'استمر في الطريق';
  }
}

// ─── Night-mode palette ───────────────────────────────────────────────────────

interface NavPalette {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  instructionBg: string;
  etaBg: string;
}

const NIGHT: NavPalette = {
  bg: '#0F172A',
  surface: '#1E293B',
  border: '#334155',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  primary: '#3B82F6',
  instructionBg: '#1E293B',
  etaBg: '#0F172A',
};

const DAY: NavPalette = {
  bg: tokens.color.bg,
  surface: tokens.color.surface,
  border: tokens.color.border,
  text: tokens.color.text,
  textMuted: '#6B7280',
  primary: '#2563EB',
  instructionBg: '#FFFFFF',
  etaBg: '#F9FAFB',
};

// ─── Alert types ─────────────────────────────────────────────────────────────

export interface SpeedCameraAlert {
  distanceM: number;
  limitKmh: number;
}

export interface PoliceCheckpointAlert {
  distanceM: number;
}

// ─── Speed camera alert banner ────────────────────────────────────────────────

interface SpeedCameraAlertProps {
  alert: SpeedCameraAlert;
  palette: typeof DAY;
  onDismiss: () => void;
}

function SpeedCameraAlertBanner({ alert, palette: _palette, onDismiss }: SpeedCameraAlertProps): ReactElement {
  const flashAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flashAnim]);

  const distLabel = alert.distanceM < 1000
    ? t('active.distM', { n: Math.round(alert.distanceM) })
    : t('active.distKm', { n: (alert.distanceM / 1000).toFixed(1) });

  return (
    <Animated.View
      style={[alertStyles.banner, alertStyles.bannerCamera, { opacity: flashAnim }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      testID="nav.speedCamera"
    >
      <RNText style={alertStyles.alertEmoji}>📷</RNText>
      <View style={alertStyles.alertBody}>
        <RNText style={alertStyles.alertTitle}>{t('alerts.speedCameraTitle')}</RNText>
        <RNText style={alertStyles.alertSub}>
          {t('alerts.speedCamera', { dist: distLabel })}
          {` · ${alert.limitKmh} كم/س`}
        </RNText>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('alerts.dismiss')}
        style={alertStyles.dismissBtn}
      >
        <RNText style={alertStyles.dismissText}>✕</RNText>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Police checkpoint warning ────────────────────────────────────────────────

interface PoliceCheckpointAlertProps {
  alert: PoliceCheckpointAlert;
  palette: typeof DAY;
  onDismiss: () => void;
}

function PoliceCheckpointAlertBanner({ alert, onDismiss }: PoliceCheckpointAlertProps): ReactElement {
  const slideAnim = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 9,
    }).start();
  }, [slideAnim]);

  const distLabel = alert.distanceM < 1000
    ? t('active.distM', { n: Math.round(alert.distanceM) })
    : t('active.distKm', { n: (alert.distanceM / 1000).toFixed(1) });

  return (
    <Animated.View
      style={[alertStyles.banner, alertStyles.bannerPolice, { transform: [{ translateY: slideAnim }] }]}
      accessibilityRole="alert"
      testID="nav.policeCheckpoint"
    >
      <RNText style={alertStyles.alertEmoji}>🚔</RNText>
      <View style={alertStyles.alertBody}>
        <RNText style={alertStyles.alertTitle}>{t('alerts.policeCheckpointTitle')}</RNText>
        <RNText style={alertStyles.alertSub}>{t('alerts.policeCheckpoint', { dist: distLabel })}</RNText>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('alerts.dismiss')}
        style={alertStyles.dismissBtn}
      >
        <RNText style={alertStyles.dismissText}>✕</RNText>
      </TouchableOpacity>
    </Animated.View>
  );
}

const alertStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: tokens.space.s,
    marginVertical: 2,
    borderRadius: 12,
    paddingVertical: tokens.space.s,
    paddingHorizontal: tokens.space.m,
    gap: tokens.space.s,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bannerCamera: { backgroundColor: '#FEF3C7', borderWidth: 2, borderColor: '#F59E0B' },
  bannerPolice: { backgroundColor: '#EFF6FF', borderWidth: 2, borderColor: '#3B82F6' },
  alertEmoji: { fontSize: 26 },
  alertBody: { flex: 1, gap: 2 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  alertSub: { fontSize: 12, color: '#6B7280' },
  dismissBtn: { padding: 4 },
  dismissText: { fontSize: 16, color: '#9CA3AF', fontWeight: '700' },
});

// ─── Rerouting animation overlay ──────────────────────────────────────────────

function ReroutingOverlay({ palette }: { palette: typeof DAY }): ReactElement {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    ]).start();
    return () => {
      rotateAnim.stopAnimation();
      fadeAnim.stopAnimation();
    };
  }, [rotateAnim, fadeAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[rerouteStyles.overlay, { backgroundColor: palette.surface, opacity: fadeAnim }]}
      accessibilityRole="progressbar"
      testID="nav.rerouting-overlay"
    >
      <Animated.Text style={[rerouteStyles.spinner, { transform: [{ rotate: spin }] }]}>
        🔄
      </Animated.Text>
      <RNText style={[rerouteStyles.label, { color: palette.text }]}>
        {t('alerts.rerouting')}
      </RNText>
    </Animated.View>
  );
}

const rerouteStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.m,
    zIndex: 50,
  },
  spinner: { fontSize: 48 },
  label: { fontSize: 18, fontWeight: '700', writingDirection: 'rtl' },
});

// ─── Lock screen view ─────────────────────────────────────────────────────────

interface LockScreenViewProps {
  instruction: string;
  distanceM: number;
  palette: typeof DAY;
}

function LockScreenView({ instruction, distanceM, palette }: LockScreenViewProps): ReactElement {
  const distLabel = distanceM < 1000
    ? t('active.distM', { n: Math.round(distanceM) })
    : t('active.distKm', { n: (distanceM / 1000).toFixed(1) });

  return (
    <View style={[lockStyles.container, { backgroundColor: palette.bg }]}>
      <RNText style={[lockStyles.title, { color: palette.text }]} accessibilityRole="header">
        {t('alerts.lockScreenTitle')}
      </RNText>
      <RNText style={[lockStyles.instruction, { color: palette.primary }]}>
        {instruction}
      </RNText>
      <RNText style={[lockStyles.distance, { color: palette.textMuted }]}>
        {distLabel}
      </RNText>
    </View>
  );
}

const lockStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, start: 0, end: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.l,
    zIndex: 100,
    paddingHorizontal: tokens.space.xl,
  },
  title: { fontSize: 20, fontWeight: '600', opacity: 0.7 },
  instruction: { fontSize: 42, fontWeight: '900', textAlign: 'center' },
  distance: { fontSize: 28, fontWeight: '700' },
});

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NavigationScreenProps extends NavigationState {
  onStop: () => void;
  onNavigateAgain?: () => void;
  routePolyline6?: string;
  city?: CityDescriptor;
  apiBaseUrl?: string;
  lang?: string;
  /** Current GPS speed in m/s. */
  currentSpeedMps?: number | null;
  /** Speed limit on current segment in km/h. */
  speedLimitKmh?: number | null;
  /** Total planned route distance in metres. */
  tripDistanceM?: number;
  /** Total planned route duration in seconds. */
  tripDurationS?: number;
  /** Destination name. */
  destinationName?: string;
  /** Lane guidance data for the current maneuver. */
  lanes?: Lane[];
  /** Called when user wants to search for services along the route. */
  onSearchAlong?: () => void;
  /** Speed camera ahead. */
  speedCameraAlert?: SpeedCameraAlert | null;
  /** Police checkpoint ahead. */
  policeCheckpointAlert?: PoliceCheckpointAlert | null;
  /** Current GPS heading in degrees (0 = north). */
  currentHeadingDeg?: number | null;
  /** Sunset time: when to auto-switch to night palette. */
  sunsetTime?: Date | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface InstructionCardProps {
  type: ManeuverType;
  modifier?: ManeuverModifier;
  instruction: string;
  distanceM: number;
  nextInstruction?: string;
  palette: typeof DAY;
}

function InstructionCard({
  type,
  modifier,
  instruction,
  distanceM,
  nextInstruction,
  palette,
}: InstructionCardProps): ReactElement {
  const arabic = arabicDirection(type, modifier);
  return (
    <View style={[instructionStyles.card, { backgroundColor: palette.instructionBg, borderColor: palette.border }]}>
      <View style={instructionStyles.row}>
        <ManeuverArrow
          type={type}
          modifier={modifier}
          size={56}
          bgColor={palette.primary}
          accessibilityLabel={arabic}
        />
        <View style={instructionStyles.body}>
          <RNText style={[instructionStyles.arabic, { color: palette.text }]} testID={navigationTestIDs.active.instruction}>
            {arabic}
          </RNText>
          <RNText style={[instructionStyles.streetName, { color: palette.textMuted }]}>
            {instruction}
          </RNText>
        </View>
        <RNText style={[instructionStyles.dist, { color: palette.primary }]}>
          {fmtDist(distanceM)}
        </RNText>
      </View>
      {nextInstruction != null ? (
        <View style={[instructionStyles.nextRow, { borderTopColor: palette.border }]}>
          <RNText style={[instructionStyles.thenLabel, { color: palette.textMuted }]}>
            {t('active.then')}
          </RNText>
          <RNText style={[instructionStyles.nextText, { color: palette.textMuted }]} testID={navigationTestIDs.active.next}>
            {nextInstruction}
          </RNText>
        </View>
      ) : null}
    </View>
  );
}

const instructionStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: tokens.space.m,
    gap: tokens.space.xs,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.s },
  body: { flex: 1, gap: 2 },
  arabic: { fontSize: 22, fontWeight: '700', writingDirection: 'rtl' },
  streetName: { fontSize: 14 },
  dist: { fontSize: 18, fontWeight: '700', textAlign: 'center', minWidth: 56 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.xs, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: tokens.space.xs },
  thenLabel: { fontSize: 13 },
  nextText: { fontSize: 13, flex: 1 },
});

interface EtaBarProps {
  eta: Date;
  remainingDurationS: number;
  remainingDistanceM: number;
  palette: typeof DAY;
}

function EtaBar({ eta, remainingDurationS, remainingDistanceM, palette }: EtaBarProps): ReactElement {
  return (
    <View style={[etaStyles.bar, { backgroundColor: palette.etaBg, borderTopColor: palette.border }]} testID="nav.eta-row">
      <View style={etaStyles.cell}>
        <RNText style={[etaStyles.label, { color: palette.textMuted }]}>وصول</RNText>
        <RNText style={[etaStyles.value, { color: palette.text }]}>{fmtEta(eta)}</RNText>
      </View>
      <View style={[etaStyles.divider, { backgroundColor: palette.border }]} />
      <View style={etaStyles.cell}>
        <RNText style={[etaStyles.label, { color: palette.textMuted }]}>متبقي</RNText>
        <RNText style={[etaStyles.value, { color: palette.text }]} testID="nav.remaining">
          {fmtDuration(remainingDurationS)}
        </RNText>
      </View>
      <View style={[etaStyles.divider, { backgroundColor: palette.border }]} />
      <View style={etaStyles.cell}>
        <RNText style={[etaStyles.label, { color: palette.textMuted }]}>مسافة</RNText>
        <RNText style={[etaStyles.value, { color: palette.text }]}>{fmtDist(remainingDistanceM)}</RNText>
      </View>
    </View>
  );
}

const etaStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingVertical: tokens.space.s,
    paddingHorizontal: tokens.space.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cell: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: 1, marginVertical: 4 },
  label: { fontSize: 11 },
  value: { fontSize: 15, fontWeight: '600' },
});

interface ArrivedScreenProps {
  destinationName?: string;
  tripDistanceM?: number;
  tripDurationS?: number;
  onNavigateAgain?: () => void;
  onStop: () => void;
  palette: typeof DAY;
}

function ArrivedScreen({ destinationName, tripDistanceM, tripDurationS, onNavigateAgain, onStop, palette }: ArrivedScreenProps): ReactElement {
  return (
    <View style={[arrivedStyles.container, { backgroundColor: palette.bg }]}>
      <RNText style={arrivedStyles.emoji}>📍</RNText>
      <RNText style={[arrivedStyles.title, { color: palette.text }]} testID={navigationTestIDs.active.arrived}>
        {t('active.arrived')}
      </RNText>
      {destinationName != null ? (
        <RNText style={[arrivedStyles.subtitle, { color: palette.textMuted }]} testID="arrived-destination">
          {destinationName}
        </RNText>
      ) : null}
      {(tripDistanceM != null || tripDurationS != null) ? (
        <View style={[arrivedStyles.summaryCard, { backgroundColor: palette.surface, borderColor: palette.border }]} testID="trip-summary">
          {tripDistanceM != null ? (
            <View style={arrivedStyles.summaryRow}>
              <RNText style={[arrivedStyles.summaryLabel, { color: palette.textMuted }]}>{t('active.tripDistance')}</RNText>
              <RNText style={[arrivedStyles.summaryValue, { color: palette.text }]}>{fmtDist(tripDistanceM)}</RNText>
            </View>
          ) : null}
          {tripDurationS != null ? (
            <View style={arrivedStyles.summaryRow}>
              <RNText style={[arrivedStyles.summaryLabel, { color: palette.textMuted }]}>{t('active.tripDuration')}</RNText>
              <RNText style={[arrivedStyles.summaryValue, { color: palette.text }]}>{fmtDuration(tripDurationS)}</RNText>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={arrivedStyles.actions}>
        {onNavigateAgain != null ? (
          <View style={arrivedStyles.flex1}>
            <Button label={t('active.navigateAgain')} onPress={onNavigateAgain} />
          </View>
        ) : null}
        <View style={arrivedStyles.flex1}>
          <Button label={t('active.close')} onPress={onStop} variant="secondary" testID={navigationTestIDs.active.stop} />
        </View>
      </View>
    </View>
  );
}

const arrivedStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: tokens.space.l, gap: tokens.space.m },
  emoji: { fontSize: 56 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center' },
  summaryCard: { width: '100%', borderRadius: 12, borderWidth: 1, padding: tokens.space.m, gap: tokens.space.s },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: tokens.space.s, width: '100%' },
  flex1: { flex: 1 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export function NavigationScreen({
  currentManeuver,
  currentInstruction,
  nextInstruction,
  distanceToManeuver,
  isRerouting,
  hasArrived,
  isOffRoute,
  eta,
  remainingDurationS,
  remainingDistanceM,
  onRecalculate,
  onStop,
  onNavigateAgain,
  routePolyline6,
  city,
  apiBaseUrl,
  lang,
  currentSpeedMps,
  speedLimitKmh,
  tripDistanceM,
  tripDurationS,
  destinationName,
  lanes,
  onSearchAlong,
  speedCameraAlert: speedCameraAlertProp = null,
  policeCheckpointAlert: policeCheckpointAlertProp = null,
  currentHeadingDeg: _currentHeadingDeg,
  sunsetTime,
}: NavigationScreenProps): ReactElement {
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [dismissedCamera, setDismissedCamera] = useState(false);
  const [dismissedPolice, setDismissedPolice] = useState(false);
  const [lockScreen, setLockScreen] = useState(false);
  const [followMode, setFollowMode] = useState(true);
  const colorScheme = useColorScheme();

  // Auto night mode: switch to NIGHT palette at sunset time.
  const isAfterSunset = useMemo(() => {
    if (sunsetTime == null) return false;
    return Date.now() > sunsetTime.getTime();
  }, [sunsetTime]);

  const palette = (colorScheme === 'dark' || isAfterSunset) ? NIGHT : DAY;

  // Reset camera dismiss when a new alert comes in.
  useEffect(() => { setDismissedCamera(false); }, [speedCameraAlertProp?.distanceM]);
  useEffect(() => { setDismissedPolice(false); }, [policeCheckpointAlertProp?.distanceM]);

  const showCameraAlert = speedCameraAlertProp != null && !dismissedCamera;
  const showPoliceAlert = policeCheckpointAlertProp != null && !dismissedPolice;

  const toggleFollowMode = useCallback(() => setFollowMode((v) => !v), []);
  const toggleLockScreen = useCallback(() => setLockScreen((v) => !v), []);

  const routeProp = useMemo(
    () => (routePolyline6 != null ? { polyline6: routePolyline6 } : undefined),
    [routePolyline6],
  );

  const currentKmh = typeof currentSpeedMps === 'number' ? Math.round(currentSpeedMps * 3.6) : undefined;
  const isSpeeding = typeof currentKmh === 'number' && typeof speedLimitKmh === 'number' && currentKmh > speedLimitKmh;

  const etaDate = eta ?? new Date(Date.now() + remainingDurationS * 1000);

  if (hasArrived) {
    return (
      <Screen>
        <View style={{ flex: 1, backgroundColor: palette.bg }}>
          <ArrivedScreen
            destinationName={destinationName}
            tripDistanceM={tripDistanceM}
            tripDurationS={tripDurationS}
            onNavigateAgain={onNavigateAgain}
            onStop={onStop}
            palette={palette}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* ── Map ── */}
      {city != null && apiBaseUrl != null ? (
        <View style={navStyles.mapContainer}>
          <MapCanvas
            city={city}
            apiBaseUrl={apiBaseUrl}
            lang={(lang ?? 'ar') as 'ar' | 'en' | 'ckb'}
            route={routeProp}
            showUserLocation
            followUser={followMode}
          />
        </View>
      ) : null}

      {/* ── Rerouting overlay animation ── */}
      {isRerouting ? <ReroutingOverlay palette={palette} /> : null}

      {/* ── Rerouting banner (fallback when overlay not used) ── */}
      {isRerouting ? (
        <Banner kind="info" message={t('active.rerouting')} testID={navigationTestIDs.active.reroute} />
      ) : null}

      {/* ── Speed camera alert ── */}
      {showCameraAlert && speedCameraAlertProp != null ? (
        <SpeedCameraAlertBanner
          alert={speedCameraAlertProp}
          palette={palette}
          onDismiss={() => setDismissedCamera(true)}
        />
      ) : null}

      {/* ── Police checkpoint alert ── */}
      {showPoliceAlert && policeCheckpointAlertProp != null ? (
        <PoliceCheckpointAlertBanner
          alert={policeCheckpointAlertProp}
          palette={palette}
          onDismiss={() => setDismissedPolice(true)}
        />
      ) : null}

      {/* ── Lock screen (big text night driving view) ── */}
      {lockScreen && currentInstruction != null ? (
        <LockScreenView
          instruction={currentInstruction}
          distanceM={distanceToManeuver}
          palette={palette}
        />
      ) : null}

      {/* ── Off-route banner ── */}
      {isOffRoute && !isRerouting ? (
        <View
          style={[navStyles.offRouteBanner, { backgroundColor: '#FEF3C7' }]}
          testID="nav.off_route"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
          <Text style={navStyles.offRouteText}>{t('active.offRoute')}</Text>
          <Button
            label={t('active.recalculate')}
            onPress={onRecalculate}
            testID="nav.recalculate"
          />
        </View>
      ) : null}

      {/* ── Main instruction card ── */}
      {currentManeuver != null && currentInstruction != null ? (
        <View style={navStyles.instructionWrap}>
          <InstructionCard
            type={currentManeuver.type}
            modifier={currentManeuver.modifier}
            instruction={currentInstruction}
            distanceM={distanceToManeuver}
            nextInstruction={nextInstruction ?? undefined}
            palette={palette}
          />
        </View>
      ) : null}

      {/* ── Lane guidance ── */}
      {lanes != null && lanes.length > 0 ? (
        <View style={navStyles.laneWrap}>
          <LaneGuidance lanes={lanes} height={72} />
        </View>
      ) : null}

      {/* ── Speed row: current speed + limit ── */}
      <View style={navStyles.speedRow}>
        {typeof currentKmh === 'number' ? (
          <CurrentSpeed
            currentKmh={currentKmh}
            limitKmh={typeof speedLimitKmh === 'number' ? speedLimitKmh : undefined}
            size={60}
          />
        ) : null}
        {typeof speedLimitKmh === 'number' ? (
          <SpeedLimit
            limitKmh={speedLimitKmh}
            currentKmh={currentKmh}
            size={68}
          />
        ) : null}
        {isSpeeding ? (
          <RNText style={navStyles.speedingText} testID="nav.speeding-warning">
            {t('active.speedingWarning')}
          </RNText>
        ) : null}
      </View>

      {/* ── ETA bar ── */}
      <EtaBar
        eta={etaDate}
        remainingDurationS={remainingDurationS}
        remainingDistanceM={remainingDistanceM}
        palette={palette}
      />

      {/* ── Action buttons ── */}
      <View style={[navStyles.actionsRow, { backgroundColor: palette.surface, borderTopColor: palette.border }]}>
        {onSearchAlong != null ? (
          <TouchableOpacity
            style={navStyles.actionBtn}
            onPress={onSearchAlong}
            accessibilityRole="button"
            testID="nav.searchAlong"
          >
            <RNText style={[navStyles.actionBtnLabel, { color: palette.text }]}>
              🔍 {t('searchAlong.title')}
            </RNText>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={navStyles.actionBtn}
          onPress={() => setShowSavedRoutes(true)}
          accessibilityRole="button"
          testID="nav.saved-routes"
        >
          <RNText style={[navStyles.actionBtnLabel, { color: palette.text }]}>
            ⭐ {t('active.favoriteRoutes')}
          </RNText>
        </TouchableOpacity>

        {/* Follow mode toggle */}
        <TouchableOpacity
          style={[navStyles.actionBtn, followMode && navStyles.actionBtnActive]}
          onPress={toggleFollowMode}
          accessibilityRole="button"
          accessibilityLabel={t('alerts.followMode')}
          testID="nav.followMode"
        >
          <RNText style={[navStyles.actionBtnLabel, { color: followMode ? '#2563EB' : palette.text }]}>
            {followMode ? '🧭' : '🗺️'} {t('alerts.followMode')}
          </RNText>
        </TouchableOpacity>

        {/* Lock screen toggle */}
        <TouchableOpacity
          style={[navStyles.actionBtn, lockScreen && navStyles.actionBtnActive]}
          onPress={toggleLockScreen}
          accessibilityRole="button"
          accessibilityLabel={t('alerts.lockScreenTitle')}
          testID="nav.lockScreen"
        >
          <RNText style={[navStyles.actionBtnLabel, { color: palette.text }]}>
            🔒
          </RNText>
        </TouchableOpacity>

        {/* Hands-free stub */}
        <TouchableOpacity
          style={navStyles.actionBtn}
          onPress={() => { /* voice commands stub — wired in a later milestone */ }}
          accessibilityRole="button"
          accessibilityLabel={t('alerts.handsFreeVoice')}
          testID="nav.handsFree"
        >
          <RNText style={[navStyles.actionBtnLabel, { color: palette.text }]}>
            🎙️
          </RNText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[navStyles.actionBtn, navStyles.stopBtn]}
          onPress={onStop}
          accessibilityRole="button"
          testID={navigationTestIDs.active.stop}
        >
          <RNText style={navStyles.stopBtnLabel}>{t('active.stop')}</RNText>
        </TouchableOpacity>
      </View>

      <SavedRoutesSheet
        visible={showSavedRoutes}
        onClose={() => setShowSavedRoutes(false)}
        currentRoute={
          destinationName != null
            ? {
                placeId: 'dest:unknown',
                destinationName,
                mode: 'car',
                distanceM: remainingDistanceM,
                durationS: remainingDurationS,
              }
            : null
        }
      />
    </Screen>
  );
}

const navStyles = StyleSheet.create({
  mapContainer: { flex: 1, minHeight: 200, borderRadius: 0 },
  instructionWrap: { paddingHorizontal: tokens.space.s, paddingTop: tokens.space.xs },
  laneWrap: { paddingHorizontal: tokens.space.s },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s,
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.xs,
  },
  speedingText: {
    flex: 1,
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
  },
  offRouteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokens.space.s,
    gap: tokens.space.s,
  },
  offRouteText: { flex: 1 },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: tokens.space.s,
    paddingVertical: tokens.space.xs,
    gap: tokens.space.xs,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnLabel: { fontSize: 12, fontWeight: '500' },
  actionBtnActive: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  stopBtn: { backgroundColor: '#FEE2E2' },
  stopBtnLabel: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
});
