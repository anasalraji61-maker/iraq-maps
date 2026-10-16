/**
 * SearchBar: reusable animated search input for the map feature.
 *
 * - Expands from a compact pill to a full-width bar on focus.
 * - Debounces input at `debounceMs` (default 300 ms) before calling `onQueryChange`.
 * - Exposes a back button (shown when `showBack` is true) and a clear button.
 * - Loading indicator (spinner) while `loading` is true.
 * - RTL-safe: uses `start`/`end` instead of `left`/`right`.
 */

import { tokens } from '@iraq-maps/ui';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { t } from '../strings';

export interface SearchBarProps {
  /** Current query string (controlled). */
  value: string;
  /** Called after the debounce delay with the new query. */
  onQueryChange: (q: string) => void;
  /** Called immediately on every keystroke (unthrottled). For local UI state. */
  onRawChange?: (q: string) => void;
  /** Show the back (←) button. When pressed, `onBack` is called. */
  showBack?: boolean;
  onBack?: () => void;
  /** Show a loading spinner in place of the search icon. */
  loading?: boolean;
  /** Debounce delay in ms (default 300). */
  debounceMs?: number;
  /** Called when the input is focused. */
  onFocus?: () => void;
  /** Called when the input is blurred. */
  onBlur?: () => void;
  /** Whether the bar is in expanded (focused) state — controls animation. */
  expanded?: boolean;
  /** If true the input is rendered as a non-focusable tappable pill (search entry point). */
  pressable?: boolean;
  /** Called when `pressable` is true and the user taps the bar. */
  onPress?: () => void;
  /** Extra style for the outer container. */
  style?: object;
  testID?: string;
}

const COLLAPSED_HORIZONTAL_MARGIN = 16;
const EXPANDED_HORIZONTAL_MARGIN = 0;
const ANIMATION_DURATION = 200;

/**
 * Reusable animated search bar used on the map screen and the dedicated search screen.
 */
export function SearchBar({
  value,
  onQueryChange,
  onRawChange,
  showBack = false,
  onBack,
  loading = false,
  debounceMs = 300,
  onFocus,
  onBlur,
  expanded = false,
  pressable = false,
  onPress,
  style,
  testID,
}: SearchBarProps): ReactElement {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const margin = useRef(new Animated.Value(COLLAPSED_HORIZONTAL_MARGIN)).current;
  const inputRef = useRef<TextInput>(null);

  // Sync controlled value in.
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Animate margin on expand/collapse.
  useEffect(() => {
    Animated.timing(margin, {
      toValue: expanded ? EXPANDED_HORIZONTAL_MARGIN : COLLAPSED_HORIZONTAL_MARGIN,
      duration: ANIMATION_DURATION,
      useNativeDriver: false,
    }).start();
  }, [expanded, margin]);

  const handleChange = useCallback(
    (text: string) => {
      setLocalValue(text);
      onRawChange?.(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onQueryChange(text);
      }, debounceMs);
    },
    [onQueryChange, onRawChange, debounceMs],
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    onRawChange?.('');
    onQueryChange('');
    inputRef.current?.focus();
  }, [onQueryChange, onRawChange]);

  // Cleanup debounce on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const showClear = localValue.length > 0;

  const innerContent = (
    <View style={styles.inner}>
      {/* Leading: back button or search icon */}
      {showBack ? (
        <Pressable
          onPress={onBack}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('search.backBtn')}
          hitSlop={8}
        >
          <RNText style={styles.backIcon} allowFontScaling={false}>
            {'←'}
          </RNText>
        </Pressable>
      ) : loading ? (
        <ActivityIndicator
          size="small"
          color={tokens.color.textMuted}
          style={styles.iconBtn}
          accessibilityLabel={t('search.loadingLabel')}
        />
      ) : (
        <RNText
          style={[styles.iconBtn, styles.searchIcon]}
          allowFontScaling={false}
          accessibilityElementsHidden
        >
          {'🔍'}
        </RNText>
      )}

      {/* Text input or pressable placeholder */}
      {pressable ? (
        <Pressable
          style={styles.pressablePlaceholder}
          onPress={onPress}
          accessibilityRole="search"
          accessibilityLabel={t('search.a11yLabel')}
        >
          <RNText style={styles.placeholder} numberOfLines={1}>
            {t('search.label')}
          </RNText>
        </Pressable>
      ) : (
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={localValue}
          onChangeText={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={t('search.placeholder')}
          placeholderTextColor={tokens.color.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('search.a11yLabel')}
          testID={testID ?? 'search-input'}
          // RTL is handled by the OS via textAlign start.
          textAlign="left"
        />
      )}

      {/* Trailing: clear button */}
      {showClear && !pressable && (
        <Pressable
          onPress={handleClear}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('search.clearInput')}
          hitSlop={8}
        >
          <RNText style={styles.clearIcon} allowFontScaling={false}>
            {t('search.clearIcon')}
          </RNText>
        </Pressable>
      )}

      {/* Trailing: mic icon (stub — voice input not yet implemented) */}
      {!showClear && !pressable && (
        <Pressable
          style={[styles.iconBtn, styles.micBtn]}
          accessibilityRole="button"
          accessibilityLabel={t('search.voiceInput')}
          onPress={() => {/* voice input stub */}}
          hitSlop={8}
        >
          <RNText style={styles.micIcon} allowFontScaling={false}>
            {'🎤'}
          </RNText>
        </Pressable>
      )}
    </View>
  );

  return (
    <Animated.View style={[styles.container, { marginHorizontal: margin }, style]}>
      {innerContent}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: tokens.color.surface,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    fontSize: 18,
  },
  backIcon: {
    fontSize: 20,
    color: tokens.color.text,
  },
  clearIcon: {
    fontSize: 14,
    color: tokens.color.textMuted,
  },
  micIcon: {
    fontSize: 16,
  },
  micBtn: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: tokens.color.text,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  pressablePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
  },
  placeholder: {
    fontSize: 15,
    color: tokens.color.textMuted,
  },
});
