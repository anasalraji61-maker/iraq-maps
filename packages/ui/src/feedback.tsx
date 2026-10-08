import type { ReactElement } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import { a11y } from './a11y';
import { Button, Icon } from './controls';
import { tones, typography } from './theme';
import { tokens } from './tokens';
import type { BannerProps, EmptyStateProps } from './types';

const { color, space, radius } = tokens;
// The icon repeats the meaning of the color so the kind does not depend on color alone.
const BANNERS = {
  info: { tint: color.primary, icon: 'info', announce: a11y.polite },
  success: { tint: color.success, icon: 'check_circle', announce: a11y.polite },
  error: { tint: color.danger, icon: 'error', announce: a11y.alert },
} as const;

/** Errors are alerts announced assertively; info and success are announced politely. */
export function Banner({ kind, message, testID }: BannerProps): ReactElement {
  const { tint, icon, announce } = BANNERS[kind];
  return (
    <View accessible {...announce} style={[styles.banner, { borderStartColor: tint }]} testID={testID}>
      <Icon name={icon} color={tint} />
      <RNText style={[typography.body, styles.message, { color: tones.default }]}>{message}</RNText>
    </View>
  );
}

/** The one placeholder for screens and tabs whose features are not delivered yet. */
export function EmptyState({ title, body, action, testID }: EmptyStateProps): ReactElement {
  return (
    <View style={styles.empty} testID={testID}>
      <RNText {...a11y.header} style={[typography.title, styles.centered, { color: tones.default }]}>
        {title}
      </RNText>
      {body ? <RNText style={[typography.body, styles.centered, { color: tones.muted }]}>{body}</RNText> : null}
      {action ? <Button label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    padding: space.m,
    borderRadius: radius.m,
    borderStartWidth: 4,
    backgroundColor: color.surface,
  },
  message: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.l },
  centered: { textAlign: 'center' },
});
