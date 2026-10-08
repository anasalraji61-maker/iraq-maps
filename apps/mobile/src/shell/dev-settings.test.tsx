import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { testIDs } from '@iraq-maps/contracts';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { availableRoutes } from './available-routes';
import { apiBaseUrl, loadServerUrl } from './server-url';
import { nativeHeaderTitles, renderApp, storeSession } from './test/app';

const KEY = 'iraq-maps.shell.serverUrl';
const EMULATOR = 'http://10.0.2.2:3000';
const LAN = 'http://192.168.1.20:3000';

const clearEnv = () => {
  delete process.env.EXPO_PUBLIC_APP_ENV;
  delete process.env.EXPO_PUBLIC_API_URL;
};
beforeEach(async () => {
  clearEnv();
  await loadServerUrl(); // nothing saved: drops the previous test's override
});
afterEach(clearEnv);

async function saveOverride(url: string) {
  await SecureStore.setItemAsync(KEY, url);
  await loadServerUrl();
}

describe('API base URL', () => {
  it('is the Android emulator host by default outside production', () => {
    expect(apiBaseUrl()).toBe(EMULATOR);
  });

  it('prefers EXPO_PUBLIC_API_URL to the default, and a saved override to both', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    expect(apiBaseUrl()).toBe('https://api.example.test');
    await saveOverride(LAN);
    expect(apiBaseUrl()).toBe(LAN);
  });

  it('ignores a saved value that is not an http(s) URL', async () => {
    await saveOverride('ftp://192.168.1.20');
    expect(apiBaseUrl()).toBe(EMULATOR);
  });

  it('in production ignores the override and has no emulator fallback', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    await saveOverride(LAN);
    expect(apiBaseUrl()).toBe('');
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
    expect(apiBaseUrl()).toBe('https://api.example.test');
  });

  it('is applied from storage before the first request', async () => {
    await SecureStore.setItemAsync(KEY, LAN);
    const requested = await storeSession('سارا');
    await renderApp('/account');
    await waitFor(() => expect(requested).toEqual([`${LAN}/v1/me`]));
  });
});

describe('DevSettingsScreen', () => {
  const input = () => screen.findByTestId(testIDs.dev.serverUrlInput);

  async function enter(url: string) {
    const user = userEvent.setup();
    await user.clear(await input());
    await user.type(await input(), url);
    await user.press(screen.getByTestId(testIDs.dev.serverUrlSave));
  }

  it('opens from the account tab header, prefilled with the current URL', async () => {
    await storeSession('سارا');
    const pathname = await renderApp('/account');
    await userEvent.setup().press(await screen.findByRole('button', { name: 'فتح إعدادات المطوّر' }));
    expect(await input()).toHaveDisplayValue(EMULATOR);
    expect(nativeHeaderTitles()).toContain('إعدادات المطوّر');
    expect(pathname()).toBe('/dev-settings');
  });

  it('rejects an address without http:// or https:// and saves nothing', async () => {
    await renderApp('/dev-settings');
    await enter('192.168.1.20:3000');
    expect(screen.getByText('اكتب عنواناً يبدأ بـ http:// أو https:// مثل http://192.168.1.20:3000')).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync(KEY)).toBeNull();
    expect(apiBaseUrl()).toBe(EMULATOR);
  });

  it('saves a valid URL, applies it to the next request and confirms', async () => {
    await renderApp('/dev-settings');
    await enter(` ${LAN} `);
    expect(await screen.findByText(`تم الحفظ. الطلبات الجديدة تُرسَل إلى ${LAN}`)).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync(KEY)).toBe(LAN);
    expect(apiBaseUrl()).toBe(LAN);
    expect(await input()).toHaveDisplayValue(LAN);
  });

  it('resets to the default', async () => {
    await saveOverride(LAN);
    await renderApp('/dev-settings');
    expect(await input()).toHaveDisplayValue(LAN);
    await userEvent.setup().press(screen.getByRole('button', { name: 'استعادة العنوان الافتراضي' }));
    expect(await screen.findByText(`تم الحفظ. الطلبات الجديدة تُرسَل إلى ${EMULATOR}`)).toBeOnTheScreen();
    expect(await SecureStore.getItemAsync(KEY)).toBeNull();
    expect(apiBaseUrl()).toBe(EMULATOR);
  });

  it('reports a device storage failure and keeps the current URL', async () => {
    jest.spyOn(SecureStore, 'setItemAsync').mockRejectedValue(new Error('keystore unavailable'));
    await renderApp('/dev-settings');
    await enter(LAN);
    expect(await screen.findByText('تعذّر حفظ العنوان على هذا الجهاز. حاول مرة أخرى.')).toBeOnTheScreen();
    expect(apiBaseUrl()).toBe(EMULATOR);
  });
});

describe('in production (EXPO_PUBLIC_APP_ENV=production)', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
  });

  it('lists every M0 route except devSettings', () => {
    expect(availableRoutes()).toEqual(['map', 'discover', 'messages', 'activity', 'account', 'accountLanguage', 'authPhone', 'authOtp', 'authName']);
  });

  it('redirects the screen home', async () => {
    const pathname = await renderApp('/dev-settings');
    expect(await screen.findByTestId(testIDs.tabs.map)).toBeOnTheScreen();
    expect(screen.queryByTestId(testIDs.dev.serverUrlInput)).not.toBeOnTheScreen();
    expect(pathname()).toBe('/');
  });

  it('shows no developer settings button', async () => {
    await storeSession('سارا');
    await renderApp('/account');
    expect(await screen.findByText('account screen')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'فتح إعدادات المطوّر' })).not.toBeOnTheScreen();
  });
});

it('outside production, devSettings is available too', () => {
  process.env.EXPO_PUBLIC_APP_ENV = 'e2e';
  expect(availableRoutes()).toContain('devSettings');
});
