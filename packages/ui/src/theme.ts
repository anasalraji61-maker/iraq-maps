import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createElement } from 'react';
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

const STORAGE_KEY = '@iraq-maps/theme-mode';
export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode(mode: ThemeMode): void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: 'system',
  setMode: () => undefined,
});

/** Wrap the app root with this to enable theme switching. Falls back to system if not provided. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const resolvedDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const theme = resolvedDark ? darkTheme : lightTheme;

  return createElement(ThemeContext.Provider, { value: { theme, mode, setMode } }, children);
}

/** Returns the active theme and mode controls. Use inside ThemeProvider. */
export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Returns the active theme based on the system colour scheme. Falls back to light.
 * @deprecated Prefer useAppTheme() inside ThemeProvider for user-overridable dark mode. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}
