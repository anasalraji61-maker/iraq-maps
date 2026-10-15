import { useHaptics } from '@iraq-maps/mobile-kit';
import { type ReactElement, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

interface Props {
  placeId: string;
  name: string;
  /** Current check-in count from API (may be undefined if not yet loaded). */
  initialCount?: number;
  /** Called when the user checks in; the implementer fires the API call. */
  onCheckIn: () => Promise<void>;
}

/** Lets the user check in at a place and shows the running total. */
export function CheckInButton({ name, initialCount = 0, onCheckIn }: Props): ReactElement {
  const haptics = useHaptics();
  const [checkedIn, setCheckedIn] = useState(false);
  const [count, setCount] = useState(initialCount);

  const handlePress = async () => {
    if (checkedIn) return;
    haptics.like();
    setCheckedIn(true);
    setCount((c) => c + 1);
    try {
      await onCheckIn();
    } catch {
      // best-effort — revert on failure
      setCheckedIn(false);
      setCount((c) => Math.max(0, c - 1));
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        testID="place.checkin"
        style={[styles.btn, checkedIn && styles.btnDone]}
        onPress={() => { void handlePress(); }}
        accessibilityRole="button"
        accessibilityLabel={t('place.checkinA11y', { name })}
        disabled={checkedIn}
      >
        <Text style={[styles.label, checkedIn && styles.labelDone]}>
          {checkedIn ? t('place.checkinDone') : t('place.checkin')}
        </Text>
      </Pressable>
      {count > 0 ? (
        <Text style={styles.count} testID="place.checkinCount">
          {t('place.checkinCount', { count })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  btn: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  btnDone: {
    backgroundColor: '#E8F5E9',
    borderColor: '#A5D6A7',
  },
  label: {
    color: '#1565C0',
    fontWeight: '600',
    fontSize: 14,
  },
  labelDone: {
    color: '#2E7D32',
  },
  count: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
  },
});
