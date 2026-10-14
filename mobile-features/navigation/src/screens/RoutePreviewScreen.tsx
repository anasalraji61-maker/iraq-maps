import type { Maneuver, ManeuverModifier, RouteResult, TravelMode } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
}

function fmtDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${h} س ${rem} د` : `${h} ساعة`;
}

/** Returns a Unicode arrow representing the maneuver direction. */
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

/** Short Arabic direction word for a maneuver modifier. */
function directionWord(modifier?: ManeuverModifier): string {
  switch (modifier) {
    case 'slight_right':
    case 'right': return 'انعطف يميناً';
    case 'sharp_right': return 'تحول يميناً';
    case 'slight_left':
    case 'left': return 'انعطف يساراً';
    case 'sharp_left': return 'انعطف يساراً بحدة';
    default: return 'استمر';
  }
}

/** Format a Date as Arabic clock time, e.g. "3:45 م". */
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
}

export function RoutePreviewScreen({ route, mode, onModeChange, onStart, isLoading, error }: Props): ReactElement {
  const eta = new Date(Date.now() + route.durationS * 1000);
  // Show all maneuvers except the final "arrive" step in the step list
  const steps = route.maneuvers.filter((m) => m.type !== 'arrive');

  return (
    <Screen testID={navigationTestIDs.preview.view}>
      <Text variant="title" testID={navigationTestIDs.preview.summary}>
        {fmtDist(route.distanceM)} · {fmtDuration(route.durationS)}
      </Text>
      <Text tone="muted">{`تصل الساعة ${fmtEta(eta)}`}</Text>

      <View style={styles.modeRow}>
        <Button
          testID={navigationTestIDs.preview.modeCar}
          label="سيارة"
          variant={mode === 'car' ? 'primary' : 'secondary'}
          onPress={() => onModeChange('car')}
        />
        <Button
          testID={navigationTestIDs.preview.modeWalk}
          label="مشياً"
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
        label={isLoading ? '…' : 'ابدأ'}
        onPress={onStart}
      />
    </Screen>
  );
}

const { space, color } = tokens;
const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: space.s },
  stepList: { maxHeight: 300 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  stepIcon: { width: 28, alignItems: 'center' },
  stepBody: { flex: 1, gap: 2 },
});
