/**
 * SpeedLimit — Iraq-style speed limit sign.
 * White circle with red border and black speed number, matching Iraqi road signage.
 * Optionally shows a speeding warning when currentKmh exceeds the limit.
 *
 * Implemented with View + Text (no SVG dependency).
 */
import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { t } from '../strings';

export interface SpeedLimitProps {
  /** Posted speed limit in km/h. */
  limitKmh: number;
  /** Current speed in km/h. Used to detect speeding. */
  currentKmh?: number;
  /** Sign diameter in dp. Default 72. */
  size?: number;
}

export function SpeedLimit({ limitKmh, currentKmh, size = 72 }: SpeedLimitProps): ReactElement {
  const isSpeeding = typeof currentKmh === 'number' && currentKmh > limitKmh;
  const borderColor = isSpeeding ? '#EF4444' : '#DC2626';
  const bgColor = isSpeeding ? '#FEF2F2' : '#FFFFFF';
  const textColor = isSpeeding ? '#B91C1C' : '#111827';
  const borderWidth = Math.max(4, size * 0.07);
  const fontSize = limitKmh >= 100 ? size * 0.3 : size * 0.34;

  const label = isSpeeding
    ? t('active.speedingWarning')
    : t('active.speedLimit', { kmh: limitKmh });

  return (
    <View
      style={[
        speedStyles.sign,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor,
          backgroundColor: bgColor,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
      testID="speed-limit-sign"
    >
      <Text style={[speedStyles.number, { fontSize, color: textColor }]}>
        {String(limitKmh)}
      </Text>
    </View>
  );
}

const speedStyles = StyleSheet.create({
  sign: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});

/** Compact speed readout showing current speed alongside limit. */
export interface CurrentSpeedProps {
  currentKmh: number;
  limitKmh?: number;
  size?: number;
}

export function CurrentSpeed({ currentKmh, limitKmh, size = 56 }: CurrentSpeedProps): ReactElement {
  const isSpeeding = typeof limitKmh === 'number' && currentKmh > limitKmh;
  const bgColor = isSpeeding ? '#EF4444' : '#1F2937';
  const fontSize = currentKmh >= 100 ? size * 0.32 : size * 0.38;

  return (
    <View
      style={[
        currentStyles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={t('active.speed', { kmh: currentKmh })}
      testID="current-speed"
    >
      <Text style={[currentStyles.number, { fontSize }]}>{String(currentKmh)}</Text>
      <Text style={currentStyles.unit}>{'km/h'}</Text>
    </View>
  );
}

const currentStyles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  number: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: undefined,
  },
  unit: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 9,
    textAlign: 'center',
    marginTop: -2,
  },
});
