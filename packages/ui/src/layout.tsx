import type { ReactElement, ReactNode } from 'react';
import { Modal, Pressable, Text as RNText, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { a11y } from './a11y';
import { pressedStyle, tones, typography } from './theme';
import { tokens } from './tokens';
import type { CardProps, ListItemProps, ScreenProps, SheetProps } from './types';

const { color, space, radius, minTouch } = tokens;
// Enum props kept out of JSX for the same reason as ./a11y.
const SCROLL = { keyboardShouldPersistTaps: 'handled' } as const;
const MODAL = { transparent: true, animationType: 'fade' } as const;
const BOTTOM_EDGE = ['bottom'] as const;

export function Screen({ children, scroll = false, testID }: ScreenProps): ReactElement {
  return (
    <SafeAreaView style={styles.screen} testID={testID}>
      {scroll ? (
        <ScrollView {...SCROLL} contentContainerStyle={[styles.content, styles.grow]}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.grow]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** A button when `onPress` is given, otherwise a plain container. */
function Tappable(props: { onPress?: () => void; style: StyleProp<ViewStyle>; testID?: string; children: ReactNode }): ReactElement {
  const { onPress, style, testID, children } = props;
  if (!onPress) return <View style={style} testID={testID}>{children}</View>;
  return (
    <Pressable {...a11y.button} onPress={onPress} testID={testID} style={({ pressed }) => [style, styles.touch, pressed && pressedStyle]}>
      {children}
    </Pressable>
  );
}

export function Card({ children, onPress, testID }: CardProps): ReactElement {
  return <Tappable onPress={onPress} style={styles.card} testID={testID}>{children}</Tappable>;
}

export function ListItem({ title, subtitle, onPress, trailing, testID }: ListItemProps): ReactElement {
  return (
    <Tappable onPress={onPress} style={[styles.row, styles.touch]} testID={testID}>
      <View style={styles.grow}>
        <RNText style={[typography.body, { color: tones.default }]}>{title}</RNText>
        {subtitle ? <RNText style={[typography.caption, { color: tones.muted }]}>{subtitle}</RNText> : null}
      </View>
      {trailing}
    </Tappable>
  );
}

/** Bottom sheet: Android back and a tap on the backdrop both call `onClose`. */
export function Sheet({ visible, onClose, children, closeLabel, testID }: SheetProps): ReactElement {
  return (
    <Modal {...MODAL} visible={visible} onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable
          {...a11y.button}
          accessible={closeLabel !== undefined}
          accessibilityLabel={closeLabel}
          onPress={onClose}
          style={[styles.grow, styles.touch]}
        />
        <SafeAreaView edges={BOTTOM_EDGE} style={styles.sheet} testID={testID}>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.m, gap: space.m },
  grow: { flexGrow: 1, flexShrink: 1 },
  touch: { minHeight: minTouch },
  card: { backgroundColor: color.surface, borderRadius: radius.l, padding: space.m, gap: space.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.s, paddingHorizontal: space.m, backgroundColor: color.surface },
  scrim: { flex: 1, backgroundColor: color.scrim },
  sheet: {
    backgroundColor: color.surface,
    borderTopStartRadius: radius.l,
    borderTopEndRadius: radius.l,
    padding: space.l,
    gap: space.m,
  },
});
