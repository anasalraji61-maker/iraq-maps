export interface Tokens {
  color: Record<'bg' | 'surface' | 'text' | 'textMuted' | 'primary' | 'onPrimary' | 'danger' | 'border' | 'success' | 'scrim', string>;
  space: Record<'xs' | 's' | 'm' | 'l' | 'xl', number>;
  radius: Record<'s' | 'm' | 'l', number>;
  /** Android does not switch font files by fontWeight, so bold text uses its own family. */
  font: { family: string; familyBold: string; size: Record<'caption' | 'body' | 'subtitle' | 'title', number> };
  minTouch: 48;
}

/** WCAG AA: text/textMuted on bg and surface, onPrimary on primary and danger, danger on bg >= 4.5:1; border and success >= 3:1. */
export const tokens: Tokens = {
  color: {
    bg: '#F6F7F9',
    surface: '#FFFFFF',
    text: '#14181F',
    textMuted: '#4F5866',
    primary: '#00695C',
    onPrimary: '#FFFFFF',
    danger: '#B3261E',
    border: '#79818E',
    success: '#1E7B34',
    scrim: 'rgba(20, 24, 31, 0.5)',
  },
  space: { xs: 4, s: 8, m: 16, l: 24, xl: 32 },
  radius: { s: 6, m: 12, l: 20 },
  font: {
    family: 'NotoSansArabic_400Regular',
    familyBold: 'NotoSansArabic_700Bold',
    size: { caption: 13, body: 16, subtitle: 18, title: 24 },
  },
  minTouch: 48,
};
