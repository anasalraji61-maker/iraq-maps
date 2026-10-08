import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { useId, useState, type ReactElement } from 'react';
import { ActivityIndicator, I18nManager, Pressable, Text as RNText, StyleSheet, TextInput, View } from 'react-native';
import { a11y } from './a11y';
import { pressedStyle, tones, typography } from './theme';
import { tokens } from './tokens';
import type { ButtonProps, IconButtonProps, IconProps, TextFieldProps } from './types';

const { color, space, radius, minTouch } = tokens;
const MIRRORED_IN_RTL = new Set(['arrow_back', 'arrow_forward', 'chevron_left', 'chevron_right']);
const LTR_KEYBOARDS = new Set<TextFieldProps['keyboardType']>(['phone-pad', 'number-pad', 'numeric', 'decimal-pad', 'email-address', 'url']);
const BUTTONS = {
  primary: { backgroundColor: color.primary, borderColor: color.primary, color: color.onPrimary },
  secondary: { backgroundColor: color.surface, borderColor: color.border, color: color.primary },
  danger: { backgroundColor: color.danger, borderColor: color.danger, color: color.onPrimary },
};

export function Icon({ name, size = 24, color: tint = color.text, testID }: IconProps): ReactElement {
  const symbol = name as AndroidSymbol;
  return (
    <View {...a11y.hidden} style={I18nManager.isRTL && MIRRORED_IN_RTL.has(name) ? styles.mirrored : undefined} testID={testID}>
      <SymbolView name={{ android: symbol, web: symbol }} size={size} tintColor={tint} />
    </View>
  );
}

export function IconButton({ icon, accessibilityLabel, onPress, testID }: IconButtonProps): ReactElement {
  return (
    <Pressable
      {...a11y.button}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.iconButton, pressed && pressedStyle]}
    >
      <Icon name={icon} />
    </Pressable>
  );
}

/** Disabled and loading buttons ignore presses; loading keeps the label as the accessible name and reports busy. */
export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, testID }: ButtonProps): ReactElement {
  const { color: foreground, ...surface } = BUTTONS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      {...a11y.button}
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.button, surface, pressed && pressedStyle, disabled && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : <RNText style={[typography.label, { color: foreground }]}>{label}</RNText>}
    </Pressable>
  );
}

/** The visible label is the input's accessible name; the error is announced politely when it appears. */
export function TextField({ label, value, onChangeText, error, placeholder, keyboardType, autoFocus, maxLength, testID }: TextFieldProps): ReactElement {
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <RNText nativeID={labelId} style={[typography.caption, { color: tones.default }]}>
        {label}
      </RNText>
      <TextInput
        accessibilityLabelledBy={labelId}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        testID={testID}
        style={[
          typography.body,
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : undefined,
          LTR_KEYBOARDS.has(keyboardType) && styles.ltr,
        ]}
      />
      {error ? (
        <RNText {...a11y.polite} style={[typography.caption, { color: tones.danger }]}>
          {error}
        </RNText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mirrored: { transform: [{ scaleX: -1 }] },
  iconButton: { minWidth: minTouch, minHeight: minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: minTouch / 2 },
  button: { minHeight: minTouch, minWidth: minTouch, borderWidth: 1, borderRadius: radius.m, paddingHorizontal: space.m, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  field: { gap: space.xs },
  input: {
    minHeight: minTouch,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.m,
    paddingHorizontal: space.m,
    color: color.text,
    backgroundColor: color.surface,
  },
  inputFocused: { borderWidth: 2, borderColor: color.primary },
  inputError: { borderWidth: 2, borderColor: color.danger },
  // Digits, phone numbers, e-mail and URLs read left-to-right even inside RTL layouts.
  ltr: { direction: 'ltr' },
});
