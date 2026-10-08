import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const STORAGE_KEY = 'iraq-maps.shell.serverUrl';

// A pattern rather than z.string().url(): React Native's URL class accepts any string, so .url() would not validate on a phone.
export const ServerUrl = z
  .string()
  .trim()
  .regex(/^https?:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i);

// Expo inlines EXPO_PUBLIC_* into the bundle at build time: they are public, never secrets.
export const devToolsEnabled = (): boolean => process.env.EXPO_PUBLIC_APP_ENV !== 'production';
export const defaultApiUrl = (): string => process.env.EXPO_PUBLIC_API_URL || (devToolsEnabled() ? 'http://10.0.2.2:3000' : '');

let override: string | null = null;

/** Read by the API client on every request: developer override, then EXPO_PUBLIC_API_URL, then the emulator host. */
export const apiBaseUrl = (): string => override || defaultApiUrl();

/** Loads the saved override (never in production); the root layout awaits it before the first request. */
export async function loadServerUrl(): Promise<void> {
  const saved = devToolsEnabled() ? await SecureStore.getItemAsync(STORAGE_KEY).catch(() => null) : null;
  override = ServerUrl.safeParse(saved).data ?? null;
}

/** Persists a validated URL and applies it to the next request; null goes back to the default. */
export async function saveServerUrl(url: string | null): Promise<void> {
  await (url === null ? SecureStore.deleteItemAsync(STORAGE_KEY) : SecureStore.setItemAsync(STORAGE_KEY, url));
  override = url;
}
