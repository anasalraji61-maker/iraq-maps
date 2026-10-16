/* eslint-disable no-restricted-syntax */
/**
 * EnhancedEmptyState — illustrated empty/error/no-internet state screens.
 *
 * Variants:
 * - no_results   : search returned nothing
 * - no_internet  : device is offline
 * - error        : something went wrong
 * - no_location  : location permission denied / unavailable
 * - no_places    : no providers registered yet
 * - empty_chat   : no messages
 * - coming_soon  : feature not yet available
 *
 * Each has:
 * - Emoji illustration
 * - Bold title
 * - Descriptive body
 * - Optional primary action button
 * - Optional secondary action link
 *
 * All text is Arabic (RTL).
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { fonts, tokens } from '../tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmptyStateVariant =
  | 'no_results'
  | 'no_internet'
  | 'error'
  | 'no_location'
  | 'no_places'
  | 'empty_chat'
  | 'coming_soon'
  | 'custom';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EnhancedEmptyStateProps {
  variant?: EmptyStateVariant;
  /** Override the illustration emoji. */
  illustration?: string;
  /** Override the title. */
  title?: string;
  /** Override the body text. */
  body?: string;
  /** Primary CTA. */
  action?: EmptyStateAction;
  /** Secondary link action. */
  secondaryAction?: EmptyStateAction;
  /** Compact mode (smaller spacing). */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// ── Variant presets ───────────────────────────────────────────────────────────

interface Preset {
  illustration: string;
  title: string;
  body: string;
}

const PRESETS: Record<Exclude<EmptyStateVariant, 'custom'>, Preset> = {
  no_results: {
    illustration: '🔍',
    title: 'لا توجد نتائج',
    body: 'لم نعثر على ما تبحث عنه. جرّب كلمات مختلفة أو تحقق من الإملاء.',
  },
  no_internet: {
    illustration: '📶',
    title: 'لا يوجد اتصال بالإنترنت',
    body: 'تحقق من اتصالك بالشبكة وحاول مرة أخرى.',
  },
  error: {
    illustration: '⚠️',
    title: 'حدث خطأ',
    body: 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.',
  },
  no_location: {
    illustration: '📍',
    title: 'الموقع غير متاح',
    body: 'يتطلب التطبيق إذن الوصول إلى موقعك لعرض الأماكن القريبة.',
  },
  no_places: {
    illustration: '🏪',
    title: 'لا توجد أماكن مسجّلة هنا',
    body: 'لم يُسجَّل أي مزود خدمة في هذه المنطقة بعد. كن أول من يُضيف مكانه!',
  },
  empty_chat: {
    illustration: '💬',
    title: 'لا توجد رسائل بعد',
    body: 'ابدأ محادثة مع هذا المكان وسيصلك الرد قريباً.',
  },
  coming_soon: {
    illustration: '🚀',
    title: 'قريباً',
    body: 'هذه الميزة قيد التطوير. ترقّبها في التحديثات القادمة.',
  },
};

// ── Styles ────────────────────────────────────────────────────────────────────

const { color, space, radius, font } = tokens;

const s = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
  },
  rootCompact: {
    paddingVertical: space.l,
  },
  illustrationWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.l,
  },
  illustrationWrapCompact: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: space.m,
  },
  illustration: {
    fontSize: 48,
  },
  illustrationCompact: {
    fontSize: 32,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: font.size.subtitle,
    color: color.text,
    textAlign: 'center',
    marginBottom: space.s,
  },
  titleCompact: {
    fontSize: font.size.body,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: font.size.body,
    color: color.textMuted,
    textAlign: 'center',
    lineHeight: font.size.body * 1.6,
    marginBottom: space.l,
  },
  bodyCompact: {
    fontSize: font.size.caption,
    marginBottom: space.m,
  },
  primaryBtn: {
    backgroundColor: color.primary,
    borderRadius: radius.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.s,
    alignSelf: 'stretch',
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: font.size.body,
    color: color.onPrimary,
  },
  secondaryBtn: {
    paddingVertical: space.s,
    paddingHorizontal: space.m,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: fonts.regular,
    fontSize: font.size.body,
    color: color.primary,
    textDecorationLine: 'underline',
  },
});

// ── Component ─────────────────────────────────────────────────────────────────

export function EnhancedEmptyState({
  variant = 'no_results',
  illustration,
  title,
  body,
  action,
  secondaryAction,
  compact = false,
  style,
  testID,
}: EnhancedEmptyStateProps) {
  const preset = variant !== 'custom' ? PRESETS[variant] : null;

  const resolvedIllustration = illustration ?? preset?.illustration ?? '📭';
  const resolvedTitle = title ?? preset?.title ?? '';
  const resolvedBody = body ?? preset?.body ?? '';

  return (
    <View
      style={[s.root, compact && s.rootCompact, style]}
      testID={testID}
      accessibilityRole="none"
    >
      <View style={[s.illustrationWrap, compact && s.illustrationWrapCompact]}>
        <Text style={[s.illustration, compact && s.illustrationCompact]} accessibilityElementsHidden>
          {resolvedIllustration}
        </Text>
      </View>

      {resolvedTitle ? (
        <Text style={[s.title, compact && s.titleCompact]}>{resolvedTitle}</Text>
      ) : null}

      {resolvedBody ? (
        <Text style={[s.body, compact && s.bodyCompact]}>{resolvedBody}</Text>
      ) : null}

      {action && (
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={s.primaryBtnText}>{action.label}</Text>
        </TouchableOpacity>
      )}

      {secondaryAction && (
        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={secondaryAction.onPress}
          accessibilityRole="button"
          accessibilityLabel={secondaryAction.label}
        >
          <Text style={s.secondaryBtnText}>{secondaryAction.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

EnhancedEmptyState.displayName = 'EnhancedEmptyState';
