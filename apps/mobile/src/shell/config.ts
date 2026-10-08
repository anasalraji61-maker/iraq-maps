import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const nonProduction = new Set<unknown>(['development', 'e2e', 'test']);
/** Read at runtime from app.config `extra.appEnv` (set at prebuild, like the cleartext flag). Fails closed: a missing
 * or unknown value counts as production, so developer settings and the server-URL override stay off. */
export const isProduction = () => !nonProduction.has(Constants.expoConfig?.extra?.appEnv);
// EXPO_PUBLIC_* values are inlined into the APK: public addresses only, never secrets.
/** The build's API address; the Android emulator reaches the host's `pnpm dev:api` at 10.0.2.2. */
export const defaultApiUrl = () => process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';

const SERVER_URL_KEY = 'dev.serverUrl';
let serverUrlOverride: string | null = null;

/** Read on every request (see api-client), so a new developer setting applies without a restart. */
export const apiBaseUrl = () => (!isProduction() && serverUrlOverride) || defaultApiUrl();

export async function loadServerUrl(): Promise<void> {
  serverUrlOverride = isProduction() ? null : await SecureStore.getItemAsync(SERVER_URL_KEY);
}

/** An empty value goes back to the build's address. */
export async function saveServerUrl(url: string): Promise<void> {
  serverUrlOverride = url || null;
  await (url ? SecureStore.setItemAsync(SERVER_URL_KEY, url) : SecureStore.deleteItemAsync(SERVER_URL_KEY));
}
