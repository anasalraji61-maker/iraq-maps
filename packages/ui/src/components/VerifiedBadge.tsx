/* eslint-disable no-restricted-syntax, i18next/no-literal-string */
/**
 * VerifiedBadge — provider/place verification indicator.
 *
 * - Blue checkmark icon.
 * - Sizes: small / medium / large.
 * - Tooltip showing full verification message (Pressable on mobile).
 * - Accessible: announces the verification status.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export type VerifiedBadgeSize = 'small' | 'medium' | 'large';

export interface VerifiedBadgeProps {
  size?: VerifiedBadgeSize;
  /** Show text label next to the badge. Default: false. */
  showLabel?: boolean;
  /** Custom tooltip/label text. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOLTIP_TEXT = 'تم التحقق من هوية هذا المكان';

const SIZE_CONFIG: Record<VerifiedBadgeSize, { circle: number; check: number; fontSize: number }> = {
  small:  { circle: 16, check: 10, fontSize: 11 },
  medium: { circle: 22, check: 14, fontSize: 13 },
  large:  { circle: 32, check: 20, fontSize: 16 },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const BLUE = '#1976D2';

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
  },
  circle: {
    backgroundColor: BLUE,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontFamily: fonts.bold,
    lineHeight: undefined,
  },
  label: {
    fontFamily: fonts.regular,
    color: BLUE,
  },
  // Modal tooltip
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    backgroundColor: '#1B1F24',
    borderRadius: tokens.radius.m,
    paddingHorizontal: tokens.space.m,
    paddingVertical: tokens.space.s,
    maxWidth: 260,
    marginHorizontal: tokens.space.l,
  },
  tooltipText: {
    color: '#FFFFFF',
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  tooltipClose: {
    marginTop: tokens.space.s,
    alignSelf: 'center',
    padding: tokens.space.s,
  },
  tooltipCloseText: {
    color: '#90CAF9',
    fontFamily: fonts.regular,
    fontSize: 13,
  },
});

// ── Component ─────────────────────────────────────────────────────────────────

export function VerifiedBadge({
  size = 'medium',
  showLabel = false,
  label = TOOLTIP_TEXT,
  style,
  testID,
}: VerifiedBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const cfg = SIZE_CONFIG[size];

  return (
    <>
      <Pressable
        style={[s.row, style]}
        onPress={() => setTooltipVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
      >
        <View style={[s.circle, { width: cfg.circle, height: cfg.circle }]}>
          <Text style={[s.checkText, { fontSize: cfg.check }]}>✓</Text>
        </View>
        {showLabel && (
          <Text style={[s.label, { fontSize: cfg.fontSize }]}>موثّق</Text>
        )}
      </Pressable>

      <Modal
        visible={tooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltipVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setTooltipVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={s.tooltip}>
              <Text style={s.tooltipText}>{label}</Text>
              <Pressable style={s.tooltipClose} onPress={() => setTooltipVisible(false)}>
                <Text style={s.tooltipCloseText}>إغلاق</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

VerifiedBadge.displayName = 'VerifiedBadge';
