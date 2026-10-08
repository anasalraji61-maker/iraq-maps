import { NotoSansArabic_400Regular } from '@expo-google-fonts/noto-sans-arabic/400Regular';
import { NotoSansArabic_700Bold } from '@expo-google-fonts/noto-sans-arabic/700Bold';
import { useFonts } from 'expo-font';
import { tokens } from './tokens';

/**
 * Loads Noto Sans Arabic (regular and bold only). The shell's root layout renders nothing until it returns true.
 * A load error also returns true so the app falls back to the system font instead of hanging on a blank screen.
 */
export function useUiFonts(): boolean {
  const [loaded, error] = useFonts({
    [tokens.font.family]: NotoSansArabic_400Regular,
    [tokens.font.familyBold]: NotoSansArabic_700Bold,
  });
  return loaded || error !== null;
}
