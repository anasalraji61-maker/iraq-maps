import type { CityDescriptor, Maneuver, ManeuverModifier, RouteResult, TravelMode } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { MapCanvas } from '@iraq-maps/map-kit';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { t } from '../strings';

function fmtDist(m: number): string {
  return m < 1000
    ? t('preview.distM', { n: Math.round(m) })
    : t('preview.distKm', { n: (m / 1000).toFixed(1) });
}

function fmtDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return t('preview.durationMin', { n: mins });
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0
    ? t('preview.durationHourMin', { h, m: rem })
    : t('preview.durationHour', { h });
}

/** Returns a Unicode arrow representing the maneuver direction. */
function directionIcon(modifier?: ManeuverModifier): string {
  switch (modifier) {
    case 'slight_right': return '↗'; // ↗
    case 'right': return '→'; // →
    case 'sharp_right': return '↘'; // ↘
    case 'slight_left': return '↖'; // ↖
    case 'left': return '←'; // ←
    case 'sharp_left': return '↙'; // ↙
    default: return '↑'; // ↑
  }
}

/** Localised direction word for a maneuver modifier. */
function directionWord(modifier?: ManeuverModifier): string {
  switch (modifier) {
    case 'slight_right':
    case 'right': return t('preview.dirRight');
    case 'sharp_right': return t('preview.dirSharpRight');
    case 'slight_left':
    case 'left': return t('preview.dirLeft');
    case 'sharp_left': return t('preview.dirSharpLeft');
    default: return t('preview.dirStraight');
  }
}

/** Format a Date as locale-aware clock time. */
function fmtEta(date: Date): string {
  return date.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function StepItem({ maneuver }: { maneuver: Maneuver }): ReactElement {
  const street = maneuver.streetNames[0] ?? '';
  const icon = directionIcon(maneuver.modifier);
  const word = directionWord(maneuver.modifier);
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIcon}>
        <Text>{icon}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text>{word}{street ? ` — ${street}` : ''}</Text>
        <Text tone="muted">{fmtDist(maneuver.distanceM)}</Text>
      </View>
    </View>
  );
}

interface Props {
  route: RouteResult;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onStart: () => void;
  isLoading?: boolean;
  error?: string;
  /** Formatted address of the origin (current location). Shown at the top of the preview. */
  originAddress?: string;
  /** Formatted address of the destination. Shown below the route summary. */
  destinationAddress?: string;
  /** City descriptor used to render the route map. If absent the map is hidden. */
  city?: CityDescriptor;
  /** API base URL for map tile requests. */
  apiBaseUrl?: string;
  /** Locale for map labels. */
  lang?: string;
}

export function RoutePreviewScreen({ route, mode, onModeChange, onStart, isLoading, error, originAddress, destinationAddress, city, apiBaseUrl, lang }: Props): ReactElement {
  const eta = new Date(Date.now() + route.durationS * 1000);
  // Show all maneuvers except the final "arrive" step in the step list
  const steps = route.maneuvers.filter((m) => m.type !== 'arrive');
  const routeProp = useMemo(() => ({ polyline6: route.polyline6 }), [route.polyline6]);

  return (
    <Screen testID={navigationTestIDs.preview.view}>
      {city && apiBaseUrl ? (
        <View style={styles.mapContainer}>
          <MapCanvas
            city={city}
            apiBaseUrl={apiBaseUrl}
            lang={(lang ?? 'ar') as 'ar' | 'en' | 'ckb'}
            route={routeProp}
            showUserLocation
          />
        </View>
      ) : null}
      {originAddress ? (
        <View style={styles.addressRow}>
          <Text variant="caption" tone="muted">{t('preview.from')}</Text>
          <Text variant="caption" tone="muted">{originAddress}</Text>
        </View>
      ) : null}
      <Text variant="title" testID={navigationTestIDs.preview.summary}>
        {`${fmtDist(route.distanceM)} · ${fmtDuration(route.durationS)}`}
      </Text>
      <Text tone="muted">{t('preview.eta', { time: fmtEta(eta) })}</Text>
      {destinationAddress ? (
        <View style={styles.addressRow}>
          <Text variant="caption" tone="muted">{t('preview.to')}</Text>
          <Text variant="caption" tone="muted">{destinationAddress}</Text>
        </View>
      ) : null}

      <View style={styles.modeRow}>
        <Button
          testID={navigationTestIDs.preview.modeCar}
          label={t('preview.car')}
          variant={mode === 'car' ? 'primary' : 'secondary'}
          onPress={() => onModeChange('car')}
        />
        <Button
          testID={navigationTestIDs.preview.modeWalk}
          label={t('preview.walking')}
          variant={mode === 'walk' ? 'primary' : 'secondary'}
          onPress={() => onModeChange('walk')}
        />
      </View>

      <ScrollView style={styles.stepList}>
        {steps.map((step, i) => (
          <StepItem key={i} maneuver={step} />
        ))}
      </ScrollView>

      {error ? <Banner kind="error" message={error} /> : null}

      <Button
        testID={navigationTestIDs.preview.start}
        label={isLoading ? t('preview.loading') : t('preview.start')}
        onPress={onStart}
      />
    </Screen>
  );
}

const { space, color } = tokens;
const styles = StyleSheet.create({
  mapContainer: { height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: space.s },
  modeRow: { flexDirection: 'row', gap: space.s },
  stepList: { maxHeight: 280 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  stepIcon: { width: 28, alignItems: 'center' },
  stepBody: { flex: 1, gap: 2 },
  addressRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
});
