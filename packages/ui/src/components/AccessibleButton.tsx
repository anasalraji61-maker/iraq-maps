/**
 * AccessibleButton — enhanced button with full accessibility support.
 *
 * Differences from the base <Button> in components.tsx:
 *  - Minimum touch target 44×44 pt (WCAG 2.5.5)
 *  - accessibilityRole="button" always set
 *  - accessibilityLabel auto-derived from children text when not provided
 *  - accessibilityHint prop for additional context
 *  - High-contrast mode: 2 pt border around the button
 *  - Haptic feedback on press (light impact)
 *  - Loading state: disables interactions and announces "Loading" to screen readers
 *  - Disabled state: fades and sets accessibilityState.disabled
 *  - Supports all three visual variants: primary, secondary, danger
 *  - RTL-safe layout (logical padding, no directional overrides)
 */
import * as Haptics from 'expo-haptics';
import React, { useCallback, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AccessibleButtonProps {
  /** Button label shown to the user. */
  children: ReactNode;
  /** Called when the button is pressed. */
  onPress?: () => void;
  /** Visual variant. @default 'primary' */
  variant?: ButtonVariant;
  /** Size preset. @default 'md' */
  size?: ButtonSize;
  /** Disables the button and prevents interaction. */
  disabled?: boolean;
  /** Shows a spinner and disables interaction while true. */
  loading?: boolean;
  /**
   * Screen-reader label. Auto-derived from `children` text when omitted.
   * Always set this when `children` contains only icons or images.
   */
  accessibilityLabel?: string;
  /**
   * Additional hint read after the label, e.g. "Opens the map screen".
   * Keep it short and start with a verb.
   */
  accessibilityHint?: string;
  /** testID for automated testing. */
  testID?: string;
  /** Additional style for the outer Pressable. */
  style?: StyleProp<ViewStyle>;
  /** Additional style for the label Text. */
  labelStyle?: StyleProp<TextStyle>;
  /**
   * When true, renders a 2 pt border regardless of theme, for high-contrast mode.
   * Pair with `useAccessibility().isHighContrast`.
   */
  highContrast?: boolean;
  /** Suppress haptic feedback on press. @default false */
  noHaptics?: boolean;
  /** Icon rendered to the left (start) of the label. */
  iconStart?: ReactNode;
  /** Icon rendered to the right (end) of the label. */
  iconEnd?: ReactNode;
  /** Fills available width. */
  fullWidth?: boolean;
  /**
   * Accessibility label shown to screen readers while loading.
   * Callers should pass a translated string; defaults to a generic placeholder.
   * @default 'Loading'
   */
  loadingLabel?: string;
}

// ---------------------------------------------------------------------------
// Style tokens (duplicated from ui/tokens to avoid circular deps)
// ---------------------------------------------------------------------------

const MIN_TOUCH = 44; // WCAG 2.5.5

const COLOR = {
  primary: '#1A6B3C',
  primaryFg: '#FFFFFF',
  secondary: '#F5F5F5',
  secondaryFg: '#1A6B3C',
  danger: '#D32F2F',
  dangerFg: '#FFFFFF',
  border: '#BDBDBD',
  disabled: '#BDBDBD',
  disabledFg: '#757575',
  highContrastBorder: '#000000',
} as const;

const RADIUS = 10;
const FONT_BOLD = Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'sans-serif' });

// ---------------------------------------------------------------------------
// Per-size layout constants
// ---------------------------------------------------------------------------

const SIZE_STYLES: Record<ButtonSize, { paddingH: number; paddingV: number; fontSize: number; minHeight: number }> = {
  sm: { paddingH: 12, paddingV: 6, fontSize: 14, minHeight: MIN_TOUCH },
  md: { paddingH: 20, paddingV: 12, fontSize: 16, minHeight: MIN_TOUCH },
  lg: { paddingH: 28, paddingV: 16, fontSize: 18, minHeight: MIN_TOUCH },
};

// ---------------------------------------------------------------------------
// Variant palette
// ---------------------------------------------------------------------------

const VARIANT_COLORS: Record<ButtonVariant, { bg: string; fg: string; borderColor: string }> = {
  primary: { bg: COLOR.primary, fg: COLOR.primaryFg, borderColor: COLOR.primary },
  secondary: { bg: COLOR.secondary, fg: COLOR.secondaryFg, borderColor: COLOR.border },
  danger: { bg: COLOR.danger, fg: COLOR.dangerFg, borderColor: COLOR.danger },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts visible text from ReactNode for auto-labelling. */
function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    const { children } = node.props as { children?: ReactNode };
    return children ? extractText(children) : '';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccessibleButton({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  labelStyle,
  highContrast = false,
  noHaptics = false,
  iconStart,
  iconEnd,
  fullWidth = false,
  loadingLabel = 'Loading',
}: AccessibleButtonProps) {
  const sizeStyle = SIZE_STYLES[size];
  const palette = VARIANT_COLORS[variant];
  const isInteractive = !disabled && !loading;

  // Auto-derive accessibility label from text content when not explicitly provided.
  const resolvedLabel = accessibilityLabel ?? extractText(children);

  const handlePress = useCallback(() => {
    if (!isInteractive) return;
    if (!noHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    onPress?.();
  }, [isInteractive, noHaptics, onPress]);

  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => {
      return [
        styles.base,
        {
          backgroundColor: disabled || loading ? COLOR.disabled : palette.bg,
          borderColor: highContrast
            ? COLOR.highContrastBorder
            : disabled || loading
              ? COLOR.disabled
              : palette.borderColor,
          borderWidth: variant === 'secondary' || highContrast ? (highContrast ? 2 : 1) : 0,
          borderRadius: RADIUS,
          paddingHorizontal: sizeStyle.paddingH,
          paddingVertical: sizeStyle.paddingV,
          minHeight: sizeStyle.minHeight,
          opacity: pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ];
    },
    [disabled, loading, palette, highContrast, variant, sizeStyle, fullWidth, style],
  );

  const textColor = disabled || loading ? COLOR.disabledFg : palette.fg;

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      style={pressableStyle}
    >
      {loading ? (
        <ActivityIndicator
          color={textColor}
          size={size === 'sm' ? 'small' : 'small'}
          accessibilityLabel={loadingLabel}
        />
      ) : (
        <>
          {iconStart != null && <>{iconStart}</>}
          {typeof children === 'string' || typeof children === 'number' ? (
            <Text
              style={[
                styles.label,
                {
                  color: textColor,
                  fontSize: sizeStyle.fontSize,
                  fontFamily: FONT_BOLD,
                },
                labelStyle,
              ]}
              numberOfLines={1}
              allowFontScaling
            >
              {children}
            </Text>
          ) : (
            children
          )}
          {iconEnd != null && <>{iconEnd}</>}
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Ensure touch target is never smaller than 44×44 pt even if content is tiny.
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
  },
  label: {
    textAlign: 'center',
    includeFontPadding: false,
  },
});

export default AccessibleButton;
