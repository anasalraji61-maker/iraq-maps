import { NotoSansArabic_400Regular } from '@expo-google-fonts/noto-sans-arabic/400Regular';
import { NotoSansArabic_700Bold } from '@expo-google-fonts/noto-sans-arabic/700Bold';
import { useFonts } from 'expo-font';
import type { Tokens } from './types';

/** Android picks a custom font by family name, not by fontWeight, so bold is its own family. */
export const fonts = { regular: 'NotoSansArabic_400Regular', bold: 'NotoSansArabic_700Bold' } as const;

// Text colors are >= 4.5:1 on bg and surface, border >= 3:1 (WCAG AA); asserted in tokens.test.ts.
export const tokens: Tokens = {
  color: {
    bg: '#FFFFFF',
    surface: '#F3F5F7',
    text: '#1B1F24',
    textMuted: '#545B64',
    primary: '#0A6B4B',
    onPrimary: '#FFFFFF',
    danger: '#B3261E',
    border: '#7B838C',
  },
  space: { xs: 4, s: 8, m: 16, l: 24, xl: 32 },
  radius: { s: 4, m: 8, l: 16 },
  font: { family: fonts.regular, size: { caption: 13, body: 16, subtitle: 18, title: 22 } },
  minTouch: 48,
};

export const bannerColors = {
  info: { bg: '#E3F0FA', fg: '#0B4A75' },
  success: { bg: '#E2F3EA', fg: '#145C38' },
  error: { bg: '#FBE7E5', fg: '#8C1D18' },
} as const;

/**
 * Loads Noto Sans Arabic (regular + bold). The app root renders nothing until it returns true.
 * A load error also returns true, so the app falls back to the system font instead of hanging.
 */
export function useUiFonts(): boolean {
  const [loaded, error] = useFonts({ [fonts.regular]: NotoSansArabic_400Regular, [fonts.bold]: NotoSansArabic_700Bold });
  return loaded || error != null;
}
