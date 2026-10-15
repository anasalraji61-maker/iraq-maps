/**
 * useTheme — returns semantic color tokens that respond to the system color scheme.
 * Wraps React Native's useColorScheme so callers don't import it directly.
 *
 * Returns dark colors when the device is in dark mode, light colors otherwise.
 *
 * @example
 * const colors = useTheme();
 * <View style={{ backgroundColor: colors.background }}>
 *   <Text style={{ color: colors.text }}>...</Text>
 * </View>
 */
import { useColorScheme } from 'react-native';

export interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
}

const light: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F3F5F7',
  primary: '#0A6B4B',
  text: '#1B1F24',
  textSecondary: '#545B64',
  border: '#C4C9CF',
  error: '#B3261E',
  success: '#145C38',
};

const dark: ThemeColors = {
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#2ECC71',
  text: '#EAECEF',
  textSecondary: '#A0A8B0',
  border: '#333940',
  error: '#EF9A9A',
  success: '#A5D6A7',
};

/**
 * Returns semantic color tokens for the active color scheme.
 * Use inside any component — no provider required.
 */
export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export { light as lightColors, dark as darkColors };
