import type { ReactElement } from 'react';
import { Text as RNText } from 'react-native';
import { a11y } from './a11y';
import { tones, typography } from './theme';
import type { TextProps } from './types';

/** Aligns with the layout direction (start) in both RTL and LTR; titles are announced as headers. */
export function Text({ children, variant = 'body', tone = 'default', testID }: TextProps): ReactElement {
  const role = variant === 'title' ? a11y.header : undefined;
  return (
    <RNText {...role} style={[typography[variant], { color: tones[tone] }]} testID={testID}>
      {children}
    </RNText>
  );
}
