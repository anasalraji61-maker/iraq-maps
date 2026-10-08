import type { AndroidSymbol } from 'expo-symbols';
import { SymbolView } from 'expo-symbols';
import type { ReactElement, ReactNode } from 'react';
import type { PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, I18nManager, Modal, Pressable, Text as RNText, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
// i18next/no-literal-string (jsx-only mode) flags every string inside JSX, so non-user-facing prop values live here.
const prop = { button: 'button', header: 'header', alert: 'alert', polite: 'polite', handled: 'handled', slide: 'slide', bottom: ['bottom'] } as const;
/** Material Symbols whose direction must follow the layout (back/forward). */
const MIRRORED = /^(arrow_(back|forward)|chevron_(left|right)|navigate_(before|next)|send)/;

const pressable =
  (...base: StyleProp<ViewStyle>[]) =>
  ({ pressed }: PressableStateCallbackType) => [...base, pressed && styles.pressed];

/** A Pressable with button semantics when `onPress` is set, a plain View otherwise. */
function Touchable({ onPress, testID, style, children }: { onPress?(): void; testID?: string; style: ViewStyle; children: ReactNode }) {
  return onPress ? (
    <Pressable testID={testID} onPress={onPress} accessibilityRole={prop.button} style={pressable(style)}>
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps={prop.handled}>
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
    <RNText testID={testID} accessibilityRole={variant === 'title' ? prop.header : undefined} style={[text[variant], { color: tones[tone] }]}>
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
      accessibilityRole={prop.button}
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={pressable(styles.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? color.primary : bg }, disabled && styles.disabled)}
    >
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={[text.body, styles.buttonLabel, { color: fg }]}>{label}</RNText>}
    </Pressable>
  );
}

export function TextField({ label, value, onChangeText, error, placeholder, keyboardType, autoFocus, maxLength, testID }: TextFieldProps): ReactElement {
  return (
    <View style={styles.field}>
      <RNText aria-hidden style={text.caption}>
        {label}
      </RNText>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={error}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        maxLength={maxLength}
        style={[text.body, styles.input, error ? styles.inputError : null]}
      />
      {error ? (
        <RNText accessibilityLiveRegion={prop.polite} style={[text.caption, { color: color.danger }]}>
          {error}
        </RNText>
      ) : null}
    </View>
  );
}

export function ListItem({ title, subtitle, onPress, trailing, testID }: ListItemProps): ReactElement {
  return (
    <Touchable onPress={onPress} testID={testID} style={styles.row}>
      <View style={styles.fill}>
        <RNText style={text.body}>{title}</RNText>
        {subtitle ? <RNText style={[text.caption, { color: color.textMuted }]}>{subtitle}</RNText> : null}
      </View>
      {trailing}
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
    <Modal visible={visible} transparent animationType={prop.slide} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.fill} onPress={onClose} accessible={false} />
        <SafeAreaView edges={prop.bottom} testID={testID} accessibilityViewIsModal onAccessibilityEscape={onClose} style={styles.sheet}>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function Banner({ kind, message, testID }: BannerProps): ReactElement {
  const { bg, fg } = bannerColors[kind];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={kind === 'error' ? prop.alert : undefined}
      accessibilityLiveRegion={prop.polite}
      style={[styles.banner, { backgroundColor: bg, borderStartColor: fg }]}
    >
      <RNText style={[text.body, { color: fg }]}>{message}</RNText>
    </View>
  );
}

export function EmptyState({ title, body, action, testID }: EmptyStateProps): ReactElement {
  return (
    <View testID={testID} style={styles.empty}>
      <RNText accessibilityRole={prop.header} style={[text.title, styles.center]}>
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
      accessibilityRole={prop.button}
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
  card: { padding: space.m, gap: space.s, borderRadius: radius.l, backgroundColor: color.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: { padding: space.m, gap: space.m, backgroundColor: color.bg, borderTopStartRadius: radius.l, borderTopEndRadius: radius.l },
  banner: { padding: space.m, borderRadius: radius.m, borderStartWidth: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  icon: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: minTouch / 2 },
});
