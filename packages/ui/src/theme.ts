import { StyleSheet } from 'react-native';
import { tokens } from './tokens';

const { family, familyBold, size } = tokens.font;
// Noto Sans Arabic has tall ascenders and descenders; 1.5x line height keeps marks from clipping.
const font = (fontSize: number, fontFamily: string) => ({ fontFamily, fontSize, lineHeight: Math.round(fontSize * 1.5) });

export const typography = StyleSheet.create({
  title: font(size.title, familyBold),
  subtitle: font(size.subtitle, familyBold),
  body: font(size.body, family),
  caption: font(size.caption, family),
  label: font(size.body, familyBold),
});

export const tones = { default: tokens.color.text, muted: tokens.color.textMuted, danger: tokens.color.danger };

export const pressedStyle = { opacity: 0.7 };
