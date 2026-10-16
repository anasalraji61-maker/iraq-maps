/**
 * ArabicText — RTL-aware text wrapper for Iraq Maps.
 *
 * - Selects Noto Sans Arabic for Arabic script, system font for pure Latin/numeric.
 * - Optional Arabic-Indic numeral conversion (٠١٢٣...).
 * - Detects bidi direction automatically; caller can override.
 * - Preserves mixed bidirectional text (BIDI isolate wrapping).
 */
import { useMemo } from 'react';
import { I18nManager, StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Unicode helpers ──────────────────────────────────────────────────────────

/** Returns true if the string contains at least one Arabic/Arabic-Extended codepoint. */
export function containsArabic(str: string): boolean {
  // Unicode ranges: Arabic, Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms A+B
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷾ﹰ-ﻼ]/.test(str);
}

/** Returns true if the string contains at least one Hebrew codepoint. */
export function containsHebrew(str: string): boolean {
  return /[֐-׿]/.test(str);
}

/** Detect the dominant text direction of a string. */
export function detectDirection(text: string): 'rtl' | 'ltr' {
  if (containsArabic(text) || containsHebrew(text)) return 'rtl';
  return 'ltr';
}

/** Convert ASCII digits 0-9 to Arabic-Indic numerals ٠-٩. */
export function toArabicIndic(str: string): string {
  return str.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x0660 - 0x0030));
}

/** Convert Arabic-Indic numerals ٠-٩ back to ASCII digits 0-9. */
export function fromArabicIndic(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 0x0030));
}

// ── Context-aware numeral rendering ─────────────────────────────────────────

/**
 * Decides whether to render a number in Arabic-Indic form.
 * Rule: use Arabic-Indic when the surrounding context is Arabic unless the
 * caller explicitly sets arabicNumerals = false.
 */
export function resolveNumerals(str: string, arabicNumerals?: boolean): string {
  if (arabicNumerals === false) return str;
  if (arabicNumerals === true) return toArabicIndic(str);
  // auto: use Arabic-Indic only when surrounded by Arabic text
  if (containsArabic(str)) return toArabicIndic(str);
  return str;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ArabicTextVariant = 'title' | 'subtitle' | 'body' | 'caption' | 'label';
export type ArabicTextTone = 'default' | 'muted' | 'danger' | 'success' | 'primary' | 'inverse';
export type ArabicTextWeight = 'regular' | 'bold';

export interface ArabicTextProps {
  children: string | number | (string | number)[];
  /** Typography scale. Default: 'body'. */
  variant?: ArabicTextVariant;
  tone?: ArabicTextTone;
  weight?: ArabicTextWeight;
  /**
   * Numeral rendering.
   *  - undefined / 'auto': Arabic-Indic when Arabic text is detected.
   *  - true: always Arabic-Indic.
   *  - false: always Western (ASCII).
   */
  arabicNumerals?: boolean;
  /**
   * Text direction override. When omitted, direction is detected from content.
   * Wrap with Unicode bidi isolates to prevent direction bleeding.
   */
  direction?: 'auto' | 'ltr' | 'rtl';
  /** Number of lines before truncation. */
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
  onPress?: () => void;
  /** Accessibility label override. */
  accessibilityLabel?: string;
  accessibilityRole?: import('react-native').TextProps['accessibilityRole'];
  /** Selectable text (long-press to copy). */
  selectable?: boolean;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const { color, font } = tokens;

const variantStyles: Record<ArabicTextVariant, TextStyle> = {
  title:    { fontSize: font.size.title,    lineHeight: font.size.title * 1.35 },
  subtitle: { fontSize: font.size.subtitle, lineHeight: font.size.subtitle * 1.4 },
  body:     { fontSize: font.size.body,     lineHeight: font.size.body * 1.5 },
  caption:  { fontSize: font.size.caption,  lineHeight: font.size.caption * 1.45 },
  label:    { fontSize: 14,                 lineHeight: 20 },
};

const toneColors: Record<ArabicTextTone, string> = {
  default: color.text,
  muted:   color.textMuted,
  danger:  color.danger,
  success: '#388E3C',
  primary: color.primary,
  inverse: '#FFFFFF',
};

const styles = StyleSheet.create({
  base: {
    // No explicit textAlign — let the platform honour the bidi direction.
  },
});

// ── Bidi isolate helpers ─────────────────────────────────────────────────────

/** Wrap a string in Unicode bidirectional isolate characters to prevent direction bleed. */
function bidiIsolate(str: string, dir: 'ltr' | 'rtl'): string {
  const FSI = dir === 'rtl' ? '⁧' : '⁦'; // RLI or LRI
  const PDI = '⁩';
  return `${FSI}${str}${PDI}`;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * RTL-aware text component that selects Noto Sans Arabic for Arabic content
 * and handles Arabic-Indic numeral conversion.
 */
export function ArabicText({
  children,
  variant = 'body',
  tone = 'default',
  weight = 'regular',
  arabicNumerals,
  direction = 'auto',
  numberOfLines,
  style,
  testID,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  selectable = false,
}: ArabicTextProps) {
  // Flatten children to a string for analysis
  const rawText = useMemo(() => {
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(String).join('');
    return String(children);
  }, [children]);

  // Resolve direction
  const resolvedDir = useMemo<'ltr' | 'rtl'>(() => {
    if (direction === 'ltr') return 'ltr';
    if (direction === 'rtl') return 'rtl';
    return detectDirection(rawText);
  }, [direction, rawText]);

  // Process numerals
  const processedText = useMemo(
    () => resolveNumerals(rawText, arabicNumerals),
    [rawText, arabicNumerals],
  );

  // Wrap in bidi isolate when direction is explicitly set or auto-detected as rtl
  // but the app layout is LTR (rare, but safe to do always).
  const displayText = useMemo(() => {
    if (direction === 'auto' && resolvedDir === 'ltr' && !I18nManager.isRTL) return processedText;
    return bidiIsolate(processedText, resolvedDir);
  }, [direction, resolvedDir, processedText]);

  // Font selection: Arabic → Noto Sans Arabic, Latin-only → let system choose.
  const fontFamily = containsArabic(rawText)
    ? weight === 'bold' ? fonts.bold : fonts.regular
    : undefined;

  const fontWeight: TextStyle['fontWeight'] = !containsArabic(rawText)
    ? weight === 'bold' ? '700' : '400'
    : undefined;

  const computedStyle: TextStyle = {
    ...variantStyles[variant],
    color: toneColors[tone],
    fontFamily,
    fontWeight,
    writingDirection: resolvedDir,
    textAlign: 'auto',
  };

  return (
    <Text
      style={[styles.base, computedStyle, style]}
      numberOfLines={numberOfLines}
      testID={testID}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? (onPress ? 'button' : 'text')}
      selectable={selectable}
      // Hint to the platform bidi algorithm (no-op on platforms that don't support it)
    >
      {displayText}
    </Text>
  );
}

ArabicText.displayName = 'ArabicText';

// ── Convenience wrappers ─────────────────────────────────────────────────────

export function ArabicTitle(props: Omit<ArabicTextProps, 'variant'>) {
  return <ArabicText {...props} variant="title" weight={props.weight ?? 'bold'} />;
}
ArabicTitle.displayName = 'ArabicTitle';

export function ArabicSubtitle(props: Omit<ArabicTextProps, 'variant'>) {
  return <ArabicText {...props} variant="subtitle" weight={props.weight ?? 'bold'} />;
}
ArabicSubtitle.displayName = 'ArabicSubtitle';

export function ArabicCaption(props: Omit<ArabicTextProps, 'variant'>) {
  return <ArabicText {...props} variant="caption" tone={props.tone ?? 'muted'} />;
}
ArabicCaption.displayName = 'ArabicCaption';

/** Numeric display that always honours arabicNumerals='auto'. */
export function ArabicNumber({
  value,
  unit,
  arabicNumerals,
  ...rest
}: Omit<ArabicTextProps, 'children'> & { value: number | string; unit?: string }) {
  const text = unit ? `${value} ${unit}` : String(value);
  return <ArabicText {...rest} arabicNumerals={arabicNumerals}>{text}</ArabicText>;
}
ArabicNumber.displayName = 'ArabicNumber';
