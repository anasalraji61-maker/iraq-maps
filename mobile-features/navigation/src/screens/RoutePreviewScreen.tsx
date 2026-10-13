import type { RouteResult, TravelMode } from '@iraq-maps/contracts';
import { navigationTestIDs } from '@iraq-maps/contracts';
import { Banner, Button, Screen, Text, tokens } from '@iraq-maps/ui';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

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

interface Props {
  route: RouteResult;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onStart: () => void;
  isLoading?: boolean;
  error?: string;
}

export function RoutePreviewScreen({ route, mode, onModeChange, onStart, isLoading, error }: Props): ReactElement {
  return (
    <Screen testID={navigationTestIDs.preview.view}>
      <Text variant="title" testID={navigationTestIDs.preview.summary}>
        {fmtDist(route.distanceM)} · {fmtDuration(route.durationS)}
      </Text>

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

      {error ? <Banner kind="error" message={error} /> : null}

      <Button
        testID={navigationTestIDs.preview.start}
        label={isLoading ? '…' : 'ابدأ'}
        onPress={onStart}
      />
    </Screen>
  );
}

const { space } = tokens;
const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', gap: space.s },
});
