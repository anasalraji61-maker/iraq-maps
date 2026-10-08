import { describe, expect, it } from '@jest/globals';
import { tokens, type Tokens } from './index';

type Color = keyof Tokens['color'];

// WCAG 2.x relative luminance and contrast ratio.
const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('tokens', () => {
  const { color } = tokens;

  it('computes contrast with the WCAG formula', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it.each<[Color, Color]>([
    ['text', 'bg'],
    ['text', 'surface'],
    ['textMuted', 'bg'],
    ['textMuted', 'surface'],
    ['onPrimary', 'primary'],
    ['onPrimary', 'danger'],
    ['danger', 'bg'],
    ['danger', 'surface'],
    ['primary', 'surface'],
  ])('%s on %s meets AA for text (4.5:1)', (fg, bg) => {
    expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each<[Color, Color]>([
    ['border', 'bg'],
    ['border', 'surface'],
    ['success', 'surface'],
  ])('%s against %s meets AA for UI components (3:1)', (fg, bg) => {
    expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(3);
  });

  it('uses 48dp touch targets and separate regular and bold Noto Sans Arabic families', () => {
    expect(tokens.minTouch).toBe(48);
    expect(tokens.font).toMatchObject({ family: 'NotoSansArabic_400Regular', familyBold: 'NotoSansArabic_700Bold' });
  });
});
