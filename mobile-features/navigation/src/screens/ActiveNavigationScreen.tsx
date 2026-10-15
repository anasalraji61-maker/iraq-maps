import type { CityDescriptor } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { MapCanvas } from '@iraq-maps/map-kit';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import { useMemo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NavigationState } from '../hooks/useNavigation';
import { t } from '../strings';

interface Props extends NavigationState {
  onStop: () => void;
  /** Optional: called when user wants to navigate again after arrival. */
  onNavigateAgain?: () => void;
  /** Route polyline6 for the map. */
  routePolyline6?: string;
  city?: CityDescriptor;
  apiBaseUrl?: string;
  lang?: string;
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

export function ActiveNavigationScreen({
  currentInstruction,
  nextInstruction,
  distanceToManeuver,
  isRerouting,
  hasArrived,
  isOffRoute,
  eta,
  remainingDurationS,
  onRecalculate,
  onStop,
  onNavigateAgain,
  routePolyline6,
  city,
  apiBaseUrl,
  lang,
}: Props): ReactElement {
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
        <Text variant="title" testID={navigationTestIDs.active.instruction}>
          {currentInstruction}
        </Text>
        <Text tone="muted">{fmtDist(distanceToManeuver)}</Text>
      </View>

      {nextInstruction ? (
        <View style={styles.nextBlock}>
          <Text tone="muted">{t('active.then')}</Text>
          <Text testID={navigationTestIDs.active.next}>
            {nextInstruction}
          </Text>
        </View>
      ) : null}

      <View style={styles.etaWrap}>
        <Text tone="muted">{t('active.eta', { time: fmtEta(etaDate) })}</Text>
      </View>

      <Button
        testID={navigationTestIDs.active.stop}
        label={t('active.stop')}
        variant="secondary"
        onPress={onStop}
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
  instructionBlock: { gap: space.xs, backgroundColor: color.bg, padding: space.m, borderRadius: 8 },
  nextBlock: { gap: space.xs, padding: space.s },
  offRouteBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF3CD', padding: space.s, borderRadius: 8, gap: space.s },
  offRouteTextWrap: { flex: 1 },
  etaWrap: { alignItems: 'center', paddingVertical: space.xs },
});
