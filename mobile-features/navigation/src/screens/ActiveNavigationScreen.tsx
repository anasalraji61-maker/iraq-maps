import { navigationTestIDs } from '@iraq-maps/contracts';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NavigationState } from '../hooks/useNavigation';

interface Props extends NavigationState {
  onStop: () => void;
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
}

export function ActiveNavigationScreen({
  currentInstruction,
  nextInstruction,
  distanceToManeuver,
  isRerouting,
  hasArrived,
  onStop,
}: Props): ReactElement {
  if (hasArrived) {
    return (
      <Screen>
        <Text variant="title" testID={navigationTestIDs.active.arrived}>
          وصلت إلى وجهتك
        </Text>
        <Button label="إغلاق" onPress={onStop} testID={navigationTestIDs.active.stop} />
      </Screen>
    );
  }

  return (
    <Screen>
      {isRerouting ? (
        <Banner kind="info" message="يُعاد حساب المسار…" testID={navigationTestIDs.active.reroute} />
      ) : null}

      <View style={styles.instructionBlock}>
        <Text variant="title" testID={navigationTestIDs.active.instruction}>
          {currentInstruction}
        </Text>
        <Text tone="muted">{fmtDist(distanceToManeuver)}</Text>
      </View>

      {nextInstruction ? (
        <View style={styles.nextBlock}>
          <Text tone="muted">بعد ذلك:</Text>
          <Text testID={navigationTestIDs.active.next}>
            {nextInstruction}
          </Text>
        </View>
      ) : null}

      <Button
        testID={navigationTestIDs.active.stop}
        label="إيقاف الملاحة"
        variant="secondary"
        onPress={onStop}
      />
    </Screen>
  );
}

const { space, color } = tokens;
const styles = StyleSheet.create({
  instructionBlock: { gap: space.xs, backgroundColor: color.bg, padding: space.m, borderRadius: 8 },
  nextBlock: { gap: space.xs, padding: space.s },
});
