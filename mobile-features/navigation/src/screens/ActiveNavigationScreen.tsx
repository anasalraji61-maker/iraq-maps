import type { CityDescriptor, ManeuverModifier } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { MapCanvas } from '@iraq-maps/map-kit';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import type { NavigationState } from '../hooks/useNavigation';
import { t } from '../strings';
import { SavedRoutesSheet } from './SavedRoutesSheet';

interface Props extends NavigationState {
  onStop: () => void;
  /** Optional: called when user wants to navigate again after arrival. */
  onNavigateAgain?: () => void;
  /** Route polyline6 for the map. */
  routePolyline6?: string;
  city?: CityDescriptor;
  apiBaseUrl?: string;
  lang?: string;
  /** Current GPS speed in m/s (null when unavailable). M195. */
  currentSpeedMps?: number | null;
  /** Speed limit on the current road segment in km/h (null when not available). */
  speedLimitKmh?: number | null;
  /** Total planned route distance in metres — shown on trip summary at arrival. */
  tripDistanceM?: number;
  /** Total planned route duration in seconds — shown on trip summary at arrival. */
  tripDurationS?: number;
  /** Destination name — shown on trip summary at arrival. */
  destinationName?: string;
}

/** Format remaining duration as a human-readable string. */
function fmtDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.ceil((totalS % 3600) / 60);
  if (h === 0) return t('active.durationMin', { n: Math.max(1, m) });
  if (m === 0) return t('active.durationHour', { h });
  return t('active.durationHourMin', { h, m });
}

/** Returns a Unicode arrow for the current maneuver direction. */
function directionIcon(modifier?: ManeuverModifier): string {
  switch (modifier) {
    case 'slight_right': return '↗';
    case 'right': return '→';
    case 'sharp_right': return '↘';
    case 'slight_left': return '↖';
    case 'left': return '←';
    case 'sharp_left': return '↙';
    default: return '↑';
  }
}

function fmtDist(m: number): string {
  return m < 1000
    ? t('active.distM', { n: Math.round(m) })
    : t('active.distKm', { n: (m / 1000).toFixed(1) });
}

/** Format a Date as locale-aware clock time. */
function fmtEta(date: Date): string {
  return date.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Build the voice/text banner instruction line from the current maneuver. */
function buildVoiceBanner(instruction: string, distM: number, streetNames?: string[]): string {
  const dist = fmtDist(distM);
  const street = streetNames?.[0];
  if (street) return t('active.voiceBanner', { direction: instruction, dist, street });
  return t('active.voiceBannerNoStreet', { direction: instruction, dist });
}

export function ActiveNavigationScreen({
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
}: Props): ReactElement {
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const routeProp = useMemo(
    () => (routePolyline6 ? { polyline6: routePolyline6 } : undefined),
    [routePolyline6],
  );

  if (hasArrived) {
    return (
      <Screen>
        <View style={styles.arrivedContainer}>
          <Text variant="title" testID={navigationTestIDs.active.arrived}>
            {t('active.arrived')}
          </Text>
          {destinationName ? (
            <Text variant="subtitle" testID="arrived-destination">
              {destinationName}
            </Text>
          ) : null}
          {(tripDistanceM !== undefined || tripDurationS !== undefined) ? (
            <View style={styles.tripSummaryCard} testID="trip-summary">
              {tripDistanceM !== undefined ? (
                <View style={styles.tripSummaryRow}>
                  <RNText style={styles.tripSummaryLabel}>{t('active.tripDistance')}</RNText>
                  <RNText style={styles.tripSummaryValue}>{fmtDist(tripDistanceM)}</RNText>
                </View>
              ) : null}
              {tripDurationS !== undefined ? (
                <View style={styles.tripSummaryRow}>
                  <RNText style={styles.tripSummaryLabel}>{t('active.tripDuration')}</RNText>
                  <RNText style={styles.tripSummaryValue}>{fmtDuration(tripDurationS)}</RNText>
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.arrivedActions}>
            {onNavigateAgain ? (
              <View style={styles.flex1}>
                <Button label={t('active.navigateAgain')} onPress={onNavigateAgain} />
              </View>
            ) : null}
            <View style={styles.flex1}>
              <Button label={t('active.close')} onPress={onStop} variant="secondary" testID={navigationTestIDs.active.stop} />
            </View>
          </View>
        </View>
      </Screen>
    );
  }

  // Use live ETA if available, otherwise estimate from remaining duration
  const etaDate = eta ?? new Date(Date.now() + remainingDurationS * 1000);

  return (
    <Screen>
      {city && apiBaseUrl ? (
        <View style={styles.mapContainer}>
          <MapCanvas
            city={city}
            apiBaseUrl={apiBaseUrl}
            lang={(lang ?? 'ar') as 'ar' | 'en' | 'ckb'}
            route={routeProp}
            showUserLocation
            followUser
          />
        </View>
      ) : null}

      {/* Feature: Voice prompts text banner — turn instruction at top of screen */}
      {!isRerouting && currentInstruction && distanceToManeuver > 0 ? (
        <View style={styles.voiceBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <RNText style={styles.voiceBannerText} testID="nav.voice-banner">
            {buildVoiceBanner(currentInstruction, distanceToManeuver, currentManeuver?.streetNames)}
          </RNText>
        </View>
      ) : null}

      {isRerouting ? (
        <Banner kind="info" message={t('active.rerouting')} testID={navigationTestIDs.active.reroute} />
      ) : null}

      {isOffRoute && !isRerouting ? (
        <View
          style={styles.offRouteBanner}
          testID="nav.off_route"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          accessibilityLabel={t('active.offRoute')}
        >
          <View style={styles.offRouteTextWrap}>
            <Text>{t('active.offRoute')}</Text>
          </View>
          <Button
            label={t('active.recalculate')}
            onPress={onRecalculate}
            testID="nav.recalculate"
            accessibilityLabel={t('active.recalculateA11y')}
          />
        </View>
      ) : null}

      <View style={styles.instructionBlock}>
        <RNText style={styles.turnArrow} accessibilityElementsHidden>
          {directionIcon(currentManeuver?.modifier)}
        </RNText>
        <View style={styles.instructionBody}>
          <Text variant="title" testID={navigationTestIDs.active.instruction}>
            {currentInstruction}
          </Text>
          <Text tone="muted">{fmtDist(distanceToManeuver)}</Text>
        </View>
      </View>

      {nextInstruction ? (
        <View style={styles.nextBlock}>
          <Text tone="muted">{t('active.then')}</Text>
          <Text testID={navigationTestIDs.active.next}>
            {nextInstruction}
          </Text>
        </View>
      ) : null}

      <View style={styles.etaWrap} testID="nav.eta-row">
        <Text tone="muted">{t('active.eta', { time: fmtEta(etaDate) })}</Text>
        <Text tone="muted" testID="nav.remaining">{t('active.remaining', { dist: fmtDist(remainingDistanceM), duration: fmtDuration(remainingDurationS) })}</Text>
        {typeof currentSpeedMps === 'number' && currentSpeedMps != null ? (
          <Text tone="muted" testID="nav.speed">{t('active.speed', { kmh: Math.round(currentSpeedMps * 3.6) })}</Text>
        ) : null}
      </View>

      {/* Feature: Speed limit display + speeding warning */}
      {typeof speedLimitKmh === 'number' && speedLimitKmh != null ? (() => {
        const currentKmh = typeof currentSpeedMps === 'number' && currentSpeedMps != null
          ? Math.round(currentSpeedMps * 3.6)
          : 0;
        const isSpeeding = currentKmh > speedLimitKmh;
        return (
          <View
            style={[styles.speedLimitWrap, isSpeeding && styles.speedLimitWrapWarning]}
            testID="nav.speed-limit"
            accessibilityRole="text"
            accessibilityLabel={isSpeeding ? t('active.speedingWarning') : t('active.speedLimit', { kmh: speedLimitKmh })}
          >
            <RNText style={[styles.speedLimitText, isSpeeding && styles.speedLimitTextWarning]}>
              {t('active.speedLimit', { kmh: speedLimitKmh })}
            </RNText>
            {isSpeeding ? (
              <RNText style={styles.speedingWarningText} testID="nav.speeding-warning">
                {t('active.speedingWarning')}
              </RNText>
            ) : null}
          </View>
        );
      })() : null}

      {/* Feature 7: Save / view favorite routes */}
      <Button
        testID="nav.saved-routes"
        label={t('active.favoriteRoutes')}
        variant="secondary"
        onPress={() => setShowSavedRoutes(true)}
      />

      <Button
        testID={navigationTestIDs.active.stop}
        label={t('active.stop')}
        variant="secondary"
        onPress={onStop}
      />

      <SavedRoutesSheet
        visible={showSavedRoutes}
        onClose={() => setShowSavedRoutes(false)}
        currentRoute={destinationName ? {
          placeId: 'dest:unknown',
          destinationName,
          mode: 'car',
          distanceM: remainingDistanceM,
          durationS: remainingDurationS,
        } : null}
      />
    </Screen>
  );
}

const { space, color } = tokens;
const styles = StyleSheet.create({
  mapContainer: { height: 240, borderRadius: 12, overflow: 'hidden', marginBottom: space.s },
  flex1: { flex: 1 },
  arrivedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.l, padding: space.m },
  arrivedActions: { flexDirection: 'row', gap: space.s, width: '100%' },
  tripSummaryCard: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: space.m, gap: space.s, width: '100%' },
  tripSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tripSummaryLabel: { fontSize: 14, color: '#777' },
  tripSummaryValue: { fontSize: 15, fontWeight: '600', color: '#222' },
  instructionBlock: { flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: color.bg, padding: space.m, borderRadius: 8 },
  instructionBody: { flex: 1, gap: space.xs },
  turnArrow: { fontSize: 40, lineHeight: 48, color: color.primary },
  nextBlock: { gap: space.xs, padding: space.s },
  offRouteBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF3CD', padding: space.s, borderRadius: 8, gap: space.s },
  offRouteTextWrap: { flex: 1 },
  etaWrap: { alignItems: 'center', paddingVertical: space.xs },
  // Feature 4: voice prompts text banner
  voiceBanner: { backgroundColor: color.primary, paddingVertical: space.s, paddingHorizontal: space.m, borderRadius: 8, marginBottom: space.xs },
  voiceBannerText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  // Feature 1: speed limit
  speedLimitWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s, paddingVertical: space.xs, paddingHorizontal: space.m, borderRadius: 8, backgroundColor: color.surface, borderWidth: 2, borderColor: color.border },
  speedLimitWrapWarning: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  speedLimitText: { fontSize: 13, fontWeight: '600', color: color.text },
  speedLimitTextWarning: { color: '#EF4444' },
  speedingWarningText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
});
