import { describe, expect, it } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import { bannerColors, tokens, useUiFonts } from './tokens';

/** WCAG 2.x contrast ratio of two #RRGGBB colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('tokens', () => {
  const { color } = tokens;

  it('meets WCAG AA for text (4.5:1) and for borders (3:1)', () => {
    for (const background of [color.bg, color.surface]) {
      for (const fg of [color.text, color.textMuted, color.primary, color.danger]) expect(contrast(fg, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color.border, background)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(color.onPrimary, color.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.onPrimary, color.danger)).toBeGreaterThanOrEqual(4.5);
    for (const { fg, bg } of Object.values(bannerColors)) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses a 48dp minimum touch target and Noto Sans Arabic', () => {
    expect(tokens.minTouch).toBe(48);
    expect(tokens.font.family).toBe('NotoSansArabic_400Regular');
  });

  it('loads the fonts', async () => {
    const { result } = await renderHook(() => useUiFonts());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
