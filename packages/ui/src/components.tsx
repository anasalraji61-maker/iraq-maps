import type { AndroidSymbol } from 'expo-symbols';
import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactElement, type ReactNode } from 'react';
import type { PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';
import { AccessibilityInfo, ActivityIndicator, I18nManager, Modal, Pressable, Text as RNText, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bannerColors, fonts, tokens } from './tokens';
import type {
  BannerProps,
  ButtonProps,
  CardProps,
  EmptyStateProps,
  IconButtonProps,
  ListItemProps,
  ScreenProps,
  SheetProps,
  TextFieldProps,
  TextProps,
} from './types';

// RTL: only logical properties (start/end, row auto-flips); text alignment follows the text's own direction.
const { color, space, radius, font, minTouch } = tokens;

const text = StyleSheet.create({
  title: { fontFamily: fonts.bold, fontSize: font.size.title, color: color.text },
  subtitle: { fontFamily: fonts.bold, fontSize: font.size.subtitle, color: color.text },
  body: { fontFamily: fonts.regular, fontSize: font.size.body, color: color.text },
  caption: { fontFamily: fonts.regular, fontSize: font.size.caption, color: color.text },
});
const tones = { default: color.text, muted: color.textMuted, danger: color.danger } as const;
const buttonColors = {
  primary: { bg: color.primary, fg: color.onPrimary },
  secondary: { bg: color.bg, fg: color.primary },
  danger: { bg: color.danger, fg: color.onPrimary },
} as const;
/** The selected-row check mark (SF Symbol on iOS, Material Symbol elsewhere). */
const check = { ios: 'checkmark', android: 'check', web: 'check' } as const;
/** Material Symbols whose direction must follow the layout (back/forward). */
const MIRRORED = /^(arrow_(back|forward)|chevron_(left|right)|navigate_(before|next)|send)/;

const pressable =
  (...base: StyleProp<ViewStyle>[]) =>
  ({ pressed }: PressableStateCallbackType) => [...base, pressed && styles.pressed];

/**
 * Announces a message when it appears or changes. A live region on a node that mounts together with its text
 * is announced unreliably on Android, so status and error text is announced explicitly.
 */
function useAnnounce(message: string | undefined) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}

/** A Pressable with button (or, with `selected`, radio) semantics when `onPress` is set, a plain View otherwise. */
function Touchable({ onPress, selected, testID, style, children }: { onPress?(): void; selected?: boolean; testID?: string; style: StyleProp<ViewStyle>; children: ReactNode }) {
  const radio = selected !== undefined;
  return onPress ? (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={radio ? 'radio' : 'button'}
      accessibilityState={radio ? { checked: selected } : undefined}
      style={pressable(style)}
    >
      {children}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {children}
    </View>
  );
}

export function Screen({ children, scroll = false, testID }: ScreenProps): ReactElement {
  return (
    <SafeAreaView testID={testID} style={styles.screen}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Text({ children, variant = 'body', tone = 'default', testID }: TextProps): ReactElement {
  return (
    <RNText testID={testID} accessibilityRole={variant === 'title' ? 'header' : undefined} style={[text[variant], { color: tones[tone] }]}>
      {children}
    </RNText>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, testID }: ButtonProps): ReactElement {
  const { bg, fg } = buttonColors[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={pressable(styles.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? color.primary : bg }, disabled && styles.disabled)}
    >
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={[text.body, styles.buttonLabel, { color: fg }]}>{label}</RNText>}
    </Pressable>
  );
}

export function TextField({ label, error, direction, testID, ...input }: TextFieldProps): ReactElement {
  useAnnounce(error);
  return (
    <View style={styles.field}>
      <RNText aria-hidden style={text.caption}>
        {label}
      </RNText>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={error}
        {...input}
        placeholderTextColor={color.textMuted}
        style={[text.body, styles.input, error ? styles.inputError : null, direction ? styles.ltr : null]}
      />
      {error ? <RNText style={[text.caption, { color: color.danger }]}>{error}</RNText> : null}
    </View>
  );
}

export function ListItem({ title, subtitle, onPress, trailing, selected, testID }: ListItemProps): ReactElement {
  return (
    <Touchable onPress={onPress} selected={selected} testID={testID} style={[styles.row, selected && styles.selected]}>
      <View style={styles.fill}>
        <RNText style={text.body}>{title}</RNText>
        {subtitle ? <RNText style={[text.caption, { color: color.textMuted }]}>{subtitle}</RNText> : null}
      </View>
      {trailing}
      {selected ? (
        // Visual only: the state is already exposed as the radio's `checked`. Sits at the logical end, so it mirrors in RTL.
        <View aria-hidden testID={testID && `${testID}.selected`}>
          <SymbolView name={check} size={24} tintColor={color.primary} />
        </View>
      ) : null}
    </Touchable>
  );
}

export function Card({ children, onPress, testID }: CardProps): ReactElement {
  return (
    <Touchable onPress={onPress} testID={testID} style={styles.card}>
      {children}
    </Touchable>
  );
}

export function Sheet({ visible, onClose, children, testID }: SheetProps): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.fill} onPress={onClose} accessible={false} />
        <SafeAreaView edges={['bottom']} testID={testID} accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.sheet}>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function Banner({ kind, message, testID }: BannerProps): ReactElement {
  const { bg, fg } = bannerColors[kind];
  useAnnounce(message);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: bg, borderStartColor: fg }]}
    >
      <RNText style={[text.body, { color: fg }]}>{message}</RNText>
    </View>
  );
}

export function EmptyState({ title, body, action, testID }: EmptyStateProps): ReactElement {
  return (
    <View testID={testID} style={styles.empty}>
      <RNText accessibilityRole="header" style={[text.title, styles.center]}>
        {title}
      </RNText>
      {body ? <RNText style={[text.body, styles.center, { color: color.textMuted }]}>{body}</RNText> : null}
      {action ? <Button label={action.label} onPress={action.onPress} testID={testID && `${testID}.action`} /> : null}
    </View>
  );
}

export function IconButton({ icon, accessibilityLabel, onPress, testID }: IconButtonProps): ReactElement {
  const name = icon as AndroidSymbol;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={pressable(styles.icon, I18nManager.isRTL && MIRRORED.test(icon) && styles.mirrored)}
    >
      <SymbolView name={{ android: name, web: name }} size={24} tintColor={color.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.m, gap: space.m },
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  mirrored: { transform: [{ scaleX: -1 }] },
  // Yoga `direction` sets the native input's layoutDirection (Android); writingDirection covers iOS.
  ltr: { direction: 'ltr', writingDirection: 'ltr' },
  button: {
    minHeight: minTouch,
    paddingHorizontal: space.l,
    borderRadius: radius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontFamily: fonts.bold },
  field: { gap: space.xs },
  input: {
    minHeight: minTouch,
    paddingHorizontal: space.m,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.m,
    backgroundColor: color.bg,
  },
  inputError: { borderColor: color.danger, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: minTouch, paddingHorizontal: space.m, paddingVertical: space.s },
  // surface keeps text at >= 6:1 (AA); the primary border and check mark are >= 3:1 against it.
  selected: { backgroundColor: color.surface, borderStartWidth: 4, borderStartColor: color.primary },
  card: { padding: space.m, gap: space.s, borderRadius: radius.l, backgroundColor: color.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: { padding: space.m, gap: space.m, backgroundColor: color.bg, borderTopStartRadius: radius.l, borderTopEndRadius: radius.l },
  banner: { padding: space.m, borderRadius: radius.m, borderStartWidth: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  icon: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: minTouch / 2 },
});
