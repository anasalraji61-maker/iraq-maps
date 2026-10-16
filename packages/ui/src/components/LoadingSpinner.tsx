/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * LoadingSpinner — branded loading indicators.
 *
 * Variants:
 * - default: ActivityIndicator in brand color.
 * - pulse: pulsing logo/circle animation.
 * - skeleton: rectangular placeholder blocks.
 * - overlay: full-screen dimmed overlay with spinner.
 */
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpinnerVariant = 'default' | 'pulse' | 'skeleton' | 'overlay';
export type SpinnerSize = 'small' | 'medium' | 'large';

export interface LoadingSpinnerProps {
  variant?: SpinnerVariant;
  size?: SpinnerSize;
  /** Loading message (shown in overlay variant). */
  message?: string;
  /** For overlay variant: whether it's visible. Default: true. */
  visible?: boolean;
  /** Skeleton: number of rows to render. Default: 3. */
  skeletonRows?: number;
  /** Skeleton: show a circle avatar placeholder at start of each row. */
  skeletonAvatar?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const { color, space, radius, font } = tokens;

const INDICATOR_SIZE: Record<SpinnerSize, 'small' | 'large'> = {
  small: 'small',
  medium: 'large',
  large: 'large',
};
const PULSE_SIZE: Record<SpinnerSize, number> = { small: 32, medium: 56, large: 80 };

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pulse
  pulseCircle: {
    borderRadius: 100,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseInner: {
    borderRadius: 100,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseIcon: {
    color: color.primary,
  },
  // Skeleton
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    marginBottom: space.m,
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.surface,
    flexShrink: 0,
  },
  skeletonLines: {
    flex: 1,
    gap: space.xs,
  },
  skeletonLine: {
    height: 14,
    borderRadius: radius.s,
    backgroundColor: color.surface,
  },
  skeletonLineShort: {
    width: '60%',
    height: 12,
    borderRadius: radius.s,
    backgroundColor: color.surface,
  },
  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: color.bg,
    borderRadius: radius.l,
    paddingHorizontal: space.xl,
    paddingVertical: space.l,
    alignItems: 'center',
    gap: space.m,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  overlayMessage: {
    fontFamily: fonts.regular,
    fontSize: font.size.body,
    color: color.text,
    textAlign: 'center',
  },
});

// ── Pulse animation ───────────────────────────────────────────────────────────

function PulseSpinner({ size }: { size: SpinnerSize }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  const circleSize = PULSE_SIZE[size];

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.15,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  const innerSize = circleSize * 0.55;

  return (
    <Animated.View
      style={[
        s.pulseCircle,
        { width: circleSize, height: circleSize, transform: [{ scale }], opacity },
      ]}
    >
      <View style={[s.pulseInner, { width: innerSize, height: innerSize }]}>
        <Text style={[s.pulseIcon, { fontSize: innerSize * 0.55 }]}>🗺️</Text>
      </View>
    </Animated.View>
  );
}

// ── Skeleton shimmer ──────────────────────────────────────────────────────────

function SkeletonRow({ avatar }: { avatar: boolean }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const bg = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [color.surface, color.border + '55'],
  });

  return (
    <View style={s.skeletonRow}>
      {avatar && <Animated.View style={[s.skeletonAvatar, { backgroundColor: bg }]} />}
      <View style={s.skeletonLines}>
        <Animated.View style={[s.skeletonLine, { backgroundColor: bg }]} />
        <Animated.View style={[s.skeletonLineShort, { backgroundColor: bg }]} />
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LoadingSpinner({
  variant = 'default',
  size = 'medium',
  message,
  visible = true,
  skeletonRows = 3,
  skeletonAvatar = false,
  style,
  testID,
}: LoadingSpinnerProps) {
  if (variant === 'skeleton') {
    return (
      <View style={style} testID={testID} accessibilityLabel="جارٍ التحميل">
        {Array.from({ length: skeletonRows }, (_, i) => (
          <SkeletonRow key={i} avatar={skeletonAvatar} />
        ))}
      </View>
    );
  }

  if (variant === 'overlay') {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.overlayCard}>
            <ActivityIndicator size="large" color={color.primary} />
            {message && <Text style={s.overlayMessage}>{message}</Text>}
          </View>
        </View>
      </Modal>
    );
  }

  if (variant === 'pulse') {
    return (
      <View
        style={[s.center, style]}
        testID={testID}
        accessibilityLabel="جارٍ التحميل"
        accessibilityRole="progressbar"
      >
        <PulseSpinner size={size} />
      </View>
    );
  }

  // default
  return (
    <View
      style={[s.center, style]}
      testID={testID}
      accessibilityLabel="جارٍ التحميل"
      accessibilityRole="progressbar"
    >
      <ActivityIndicator size={INDICATOR_SIZE[size]} color={color.primary} />
    </View>
  );
}

LoadingSpinner.displayName = 'LoadingSpinner';
