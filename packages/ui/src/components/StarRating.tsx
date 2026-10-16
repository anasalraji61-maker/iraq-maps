/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * StarRating — interactive and display-mode star ratings.
 *
 * - Filled / half / empty star rendering.
 * - Tap to rate (interactive mode) with animated fill.
 * - Three sizes: small / medium / large.
 * - Arabic quality labels (ممتاز / جيد / متوسط / ضعيف).
 * - Gold → red gradient tied to rating value.
 * - Accessibility: announces current rating.
 */
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Constants ────────────────────────────────────────────────────────────────

export type StarSize = 'small' | 'medium' | 'large';
export type StarRatingProps = {
  /** Current rating value (0–5, supports 0.5 steps). */
  value: number;
  /** Max stars. Default: 5. */
  max?: number;
  /** Enable tap-to-rate. Default: false. */
  interactive?: boolean;
  onRate?: (rating: number) => void;
  size?: StarSize;
  /** Show Arabic quality label next to stars. Default: true. */
  showLabel?: boolean;
  /** Show numeric value. Default: false. */
  showNumeric?: boolean;
  /** Number of ratings (shown in parens). */
  count?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  disabled?: boolean;
};

const SIZE_MAP: Record<StarSize, number> = { small: 16, medium: 24, large: 36 };
const GAP_MAP: Record<StarSize, number> = { small: 2, medium: 4, large: 6 };

// Arabic quality labels keyed to rating buckets
const LABELS: Array<{ min: number; label: string; color: string }> = [
  { min: 4.5, label: 'ممتاز',  color: '#F9A825' },
  { min: 3.5, label: 'جيد',    color: '#FBC02D' },
  { min: 2.5, label: 'متوسط',  color: '#FF8F00' },
  { min: 1.0, label: 'ضعيف',   color: '#E65100' },
  { min: 0,   label: 'غير مُقيَّم', color: tokens.color.textMuted },
];

function getLabel(value: number) {
  return LABELS.find((l) => value >= l.min) ?? LABELS[LABELS.length - 1]!;
}

/** Interpolate between gold (#F9A825) and red (#C62828) based on 0-5 rating. */
function ratingColor(value: number, max: number): string {
  const t = Math.max(0, Math.min(1, value / max));
  // gold at t=1, red at t=0
  const r = Math.round(249 + (198 - 249) * (1 - t));
  const g = Math.round(168 + (40  - 168) * (1 - t));
  const b = Math.round(37  + (40  - 37)  * (1 - t));
  return `rgb(${r},${g},${b})`;
}

// ── Single star ──────────────────────────────────────────────────────────────

type StarFill = 'full' | 'half' | 'empty';

function StarShape({ fill, size, color }: { fill: StarFill; size: number; color: string }) {
  const emptyColor = tokens.color.border;

  if (fill === 'full') {
    return (
      <Text style={{ fontSize: size, color, lineHeight: size * 1.2 }}>★</Text>
    );
  }
  if (fill === 'half') {
    // Half star: overlay empty star behind, clip filled star to left half
    return (
      <View style={{ width: size * 0.9, height: size * 1.2 }}>
        <Text style={{ fontSize: size, color: emptyColor, lineHeight: size * 1.2, position: 'absolute' }}>★</Text>
        <Text
          style={{
            fontSize: size, color, lineHeight: size * 1.2, position: 'absolute',
            overflow: 'hidden', width: size * 0.45,
          }}
        >
          ★
        </Text>
      </View>
    );
  }
  return (
    <Text style={{ fontSize: size, color: emptyColor, lineHeight: size * 1.2 }}>★</Text>
  );
}

// ── Animated interactive star ────────────────────────────────────────────────

function AnimatedStar({
  fill, size, color, onPress, index,
}: { fill: StarFill; size: number; color: string; onPress?: () => void; index: number }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    onPress?.();
  }, [onPress, scale]);

  return (
    <Pressable onPress={handlePress} accessibilityLabel={`${index + 1} نجوم`} accessibilityRole="button">
      <Animated.View style={{ transform: [{ scale }] }}>
        <StarShape fill={fill} size={size} color={color} />
      </Animated.View>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.regular,
    marginStart: tokens.space.s,
  },
  count: {
    fontFamily: fonts.regular,
    color: tokens.color.textMuted,
    marginStart: 4,
  },
  numeric: {
    fontFamily: fonts.bold,
    marginEnd: 4,
  },
});

// ── Component ────────────────────────────────────────────────────────────────

export function StarRating({
  value,
  max = 5,
  interactive = false,
  onRate,
  size = 'medium',
  showLabel = true,
  showNumeric = false,
  count,
  style,
  testID,
  disabled = false,
}: StarRatingProps) {
  const [_hovered, _setHovered] = useState<number | null>(null);
  const displayValue = _hovered ?? value;
  const starSize = SIZE_MAP[size];
  const gap = GAP_MAP[size];
  const col = ratingColor(displayValue, max);
  const { label, color: labelColor } = getLabel(displayValue);

  const labelFontSize = size === 'small' ? 12 : size === 'medium' ? 14 : 18;
  const numFontSize = size === 'small' ? 12 : size === 'medium' ? 16 : 22;

  function fillForIndex(i: number): StarFill {
    const diff = displayValue - i;
    if (diff >= 1) return 'full';
    if (diff >= 0.5) return 'half';
    return 'empty';
  }

  function handleRate(index: number) {
    if (disabled) return;
    const rating = index + 1;
    onRate?.(rating);
    AccessibilityInfo.announceForAccessibility(`تقييم ${rating} من ${max}`);
  }

  return (
    <View style={[s.row, style]} testID={testID} accessibilityRole={interactive ? 'adjustable' : 'none'}>
      {showNumeric && (
        <Text style={[s.numeric, { fontSize: numFontSize, color: col }]}>
          {displayValue.toFixed(1)}
        </Text>
      )}
      <View style={[s.row, { gap }]}>
        {Array.from({ length: max }, (_, i) =>
          interactive ? (
            <AnimatedStar
              key={i}
              index={i}
              fill={fillForIndex(i)}
              size={starSize}
              color={col}
              onPress={() => handleRate(i)}
            />
          ) : (
            <StarShape key={i} fill={fillForIndex(i)} size={starSize} color={col} />
          ),
        )}
      </View>
      {count !== undefined && (
        <Text style={[s.count, { fontSize: labelFontSize }]}>({count})</Text>
      )}
      {showLabel && (
        <Text style={[s.label, { fontSize: labelFontSize, color: labelColor }]}>{label}</Text>
      )}
    </View>
  );
}

StarRating.displayName = 'StarRating';
