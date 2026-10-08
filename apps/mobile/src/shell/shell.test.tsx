import { testIDs } from '@iraq-maps/contracts';
import { getLocale, setLocale, t } from '@iraq-maps/i18n';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { reloadAppAsync } from 'expo';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { memorySecureStore } from '@iraq-maps/mobile-kit/testing';
import * as SecureStore from 'expo-secure-store';
import { I18nManager } from 'react-native';
import { apiBaseUrl } from './config';
import { DevSettingsScreen, PendingScreen, RootLayout, TabsLayout } from './index';

jest.mock('expo-secure-store', () => jest.requireActual<typeof import('@iraq-maps/mobile-kit/testing')>('@iraq-maps/mobile-kit/testing').memorySecureStore);
jest.mock('expo', () => ({ ...jest.requireActual<object>('expo'), reloadAppAsync: jest.fn(async () => {}) }));
// app.config `extra.appEnv`, as prebuild writes it into the APK; every other Constants field stays real.
let mockAppEnv: string | undefined;
jest.mock('expo-constants', () => {
  const actual = jest.requireActual<typeof import('expo-constants')>('expo-constants');
  const get = (target: object, key: string | symbol) => (key === 'expoConfig' ? { ...actual.default.expoConfig, extra: { appEnv: mockAppEnv } } : Reflect.get(target, key));
  return { ...actual, __esModule: true, default: new Proxy(actual.default, { get }) };
});

// The same files as apps/mobile/app (each route file re-exports one of these).
const app = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': PendingScreen,
  '(tabs)/discover': PendingScreen,
  '(tabs)/messages': PendingScreen,
  '(tabs)/activity': PendingScreen,
  '(tabs)/account': PendingScreen,
  'dev-settings': DevSettingsScreen,
};
const tabs = ['map', 'discover', 'messages', 'activity', 'account'] as const;

/** Renders the app and waits until the restore finished and `readyTestID` is on screen. */
async function launch(initialUrl = '/', readyTestID: string = testIDs.tabs.map) {
  await renderRouter(app, { initialUrl });
  await screen.findByTestId(readyTestID);
}
async function relaunch(...args: Parameters<typeof launch>) {
  await screen.unmount();
  await launch(...args);
}

const forceRTL = jest.spyOn(I18nManager, 'forceRTL');
const allowRTL = jest.spyOn(I18nManager, 'allowRTL');

beforeEach(() => {
  mockAppEnv = 'development';
  setLocale('ar');
});
afterEach(() => {
  memorySecureStore.clear();
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('tabs', () => {
  it('five tabs with labels from the i18n common namespace, following the locale', async () => {
    await launch();
    for (const locale of ['ar', 'ckb', 'en'] as const) {
      await act(async () => setLocale(locale));
      for (const tab of tabs) expect(screen.getByTestId(testIDs.tabs[tab])).toHaveTextContent(t(`common:tabs.${tab}`));
    }
    expect(t('common:tabs.map')).not.toBe('common:tabs.map');
  });

  it('undelivered tabs show the shared coming-soon empty state', async () => {
    await launch('/discover');
    expect(screen.getByText(t('common:comingSoon.title'))).toBeOnTheScreen();
  });

  it('a language switch without reload re-renders the open screen in place', async () => {
    await launch('/dev-settings', testIDs.dev.serverUrlInput);
    await act(async () => setLocale('ckb'));
    expect(screen.getByTestId(testIDs.dev.serverUrlInput)).toBeOnTheScreen();
    expect(screen.getByText(t('shell:devSettings.title'))).toBeOnTheScreen();
  });
});

describe('locale and direction', () => {
  it('starts in Arabic: RTL forced, with one reload when the platform was LTR', async () => {
    await launch();
    expect(getLocale()).toBe('ar');
    expect(allowRTL).toHaveBeenLastCalledWith(true);
    expect(forceRTL).toHaveBeenLastCalledWith(true);
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('en turns RTL off; ckb and ar turn it on; a direction flip reloads', async () => {
    await launch();
    jest.clearAllMocks();
    await act(async () => setLocale('en'));
    await waitFor(() => expect(forceRTL).toHaveBeenLastCalledWith(false));
    expect(allowRTL).toHaveBeenLastCalledWith(false);
    expect(reloadAppAsync).not.toHaveBeenCalled(); // the test platform is already LTR

    await act(async () => setLocale('ckb'));
    await waitFor(() => expect(forceRTL).toHaveBeenLastCalledWith(true));
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);

    await act(async () => setLocale('ar'));
    await waitFor(() => expect(reloadAppAsync).toHaveBeenCalledTimes(2));
    expect(forceRTL).toHaveBeenLastCalledWith(true);
  });

  it('never reloads twice in a row for the same locale (no reload loop if forceRTL does not stick)', async () => {
    await launch();
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
    await relaunch();
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('the chosen language is saved', async () => {
    await launch();
    await act(async () => setLocale('en'));
    await waitFor(() => expect(forceRTL).toHaveBeenLastCalledWith(false));
    expect(await SecureStore.getItemAsync('app.locale')).toBe('en');
  });

  it('a launch restores the saved language and its direction', async () => {
    await SecureStore.setItemAsync('app.locale', 'ckb');
    await launch();
    expect(getLocale()).toBe('ckb');
    expect(forceRTL).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId(testIDs.tabs.account)).toHaveTextContent(t('common:tabs.account'));
  });
});

describe('developer settings', () => {
  it.each(['development', 'e2e'])('%s build: reachable from the account tab, and the saved URL becomes the API base URL', async (appEnv) => {
    mockAppEnv = appEnv;
    await launch('/account');
    expect(screen.getByLabelText(t('shell:devSettings.open'))).toBeOnTheScreen();
    await relaunch('/dev-settings', testIDs.dev.serverUrlInput);

    await fireEvent.changeText(screen.getByTestId(testIDs.dev.serverUrlInput), 'ftp://nope');
    await fireEvent.press(screen.getByTestId(testIDs.dev.serverUrlSave));
    expect(screen.getByText(t('shell:devSettings.invalidUrl'))).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId(testIDs.dev.serverUrlInput), ' http://192.168.1.20:3000/ ');
    await fireEvent.press(screen.getByTestId(testIDs.dev.serverUrlSave));
    expect(apiBaseUrl()).toBe('http://192.168.1.20:3000');
    expect(await SecureStore.getItemAsync('dev.serverUrl')).toBe('http://192.168.1.20:3000');
  });

  it.each<[string, string | undefined]>([
    ['production', 'production'],
    ['missing', undefined],
    ['unknown', 'staging'],
  ])('fails closed for a %s app env: no entry, no screen, and a stored override is ignored', async (_label, appEnv) => {
      await SecureStore.setItemAsync('dev.serverUrl', 'http://192.168.1.20:3000');
      mockAppEnv = appEnv;
      await launch('/account');
      expect(screen.queryByLabelText(t('shell:devSettings.open'))).toBeNull();
      await act(async () => router.push('/dev-settings'));
      expect(screen.queryByTestId(testIDs.dev.serverUrlInput)).toBeNull();
      expect(screen.getByTestId(testIDs.tabs.account)).toBeOnTheScreen();
      expect(apiBaseUrl()).not.toBe('http://192.168.1.20:3000');
  });
});
