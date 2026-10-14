import { useColorScheme } from 'react-native';

export type Theme = {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  success: string;
};

export const lightTheme: Theme = {
  background: '#F5F5F5',
  surface: '#FFFFFF',
  primary: '#1976D2',
  text: '#222222',
  textSecondary: '#666666',
  border: '#E0E0E0',
  error: '#C62828',
  success: '#388E3C',
};

export const darkTheme: Theme = {
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#64B5F6',
  text: '#FFFFFF',
  textSecondary: '#AAAAAA',
  border: '#333333',
  error: '#EF9A9A',
  success: '#A5D6A7',
};

/** Returns the active theme based on the system colour scheme. Falls back to light. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}
