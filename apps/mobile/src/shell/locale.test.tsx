import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { testIDs } from '@iraq-maps/contracts';
import { getLocale, setLocale } from '@iraq-maps/i18n';
import { reloadAppAsync } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { act, screen, waitFor } from '@testing-library/react-native';
import { I18nManager } from 'react-native';
import { renderApp, routesNow } from './test/app';

const LOCALE = 'iraq-maps.shell.locale';
const RELOADED_FOR = 'iraq-maps.shell.directionReload';

let forceRTL: ReturnType<typeof jest.spyOn>;
let allowRTL: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  forceRTL = jest.spyOn(I18nManager, 'forceRTL');
  allowRTL = jest.spyOn(I18nManager, 'allowRTL');
});

/** Starts the app with what a previous run saved and the native direction it left behind. */
async function launch(saved: Record<string, string>, nativeRtl: boolean) {
  for (const [key, value] of Object.entries(saved)) await SecureStore.setItemAsync(key, value);
  jest.replaceProperty(I18nManager, 'isRTL', nativeRtl);
  return renderApp('/', routesNow);
}

const mapTab = () => screen.findByTestId(testIDs.tabs.map);

describe('first launch', () => {
  it('starts in Arabic whatever the device language, forcing RTL with one reload and an empty screen meanwhile', async () => {
    await launch({}, false);
    await waitFor(() => expect(reloadAppAsync).toHaveBeenCalledTimes(1));
    expect(getLocale()).toBe('ar');
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(await SecureStore.getItemAsync(RELOADED_FOR)).toBe('rtl');
    expect(screen.queryByTestId(testIDs.tabs.map)).not.toBeOnTheScreen();
  });

  it('opens the Arabic tabs once the reload has made the layout RTL', async () => {
    await launch({ [RELOADED_FOR]: 'rtl' }, true);
    expect(await mapTab()).toHaveAccessibleName('الخريطة');
    expect(reloadAppAsync).not.toHaveBeenCalled();
    expect(await SecureStore.getItemAsync(RELOADED_FOR)).toBeNull();
  });

  it('never reloads twice for the same direction, so a platform that ignores forceRTL cannot loop', async () => {
    await launch({ [RELOADED_FOR]: 'rtl' }, false);
    expect(await mapTab()).toHaveAccessibleName('الخريطة');
    expect(reloadAppAsync).not.toHaveBeenCalled();
    expect(forceRTL).not.toHaveBeenCalled();
  });

  it('falls back to Arabic when the saved locale is unknown', async () => {
    await launch({ [LOCALE]: 'fr' }, true);
    expect(await mapTab()).toHaveAccessibleName('الخريطة');
  });
});

describe('switching language', () => {
  it('to English saves it, forces LTR and reloads', async () => {
    await launch({}, true);
    await mapTab();
    await act(async () => setLocale('en'));
    await waitFor(() => expect(reloadAppAsync).toHaveBeenCalledTimes(1));
    expect(allowRTL).toHaveBeenCalledWith(false);
    expect(forceRTL).toHaveBeenCalledWith(false);
    expect(await SecureStore.getItemAsync(LOCALE)).toBe('en');
  });

  it.each(['ckb', 'ar'] as const)('from English to %s forces RTL and reloads', async (locale) => {
    await launch({ [LOCALE]: 'en' }, false);
    expect(await mapTab()).toHaveAccessibleName('Map');
    await act(async () => setLocale(locale));
    await waitFor(() => expect(reloadAppAsync).toHaveBeenCalledTimes(1));
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
    expect(await SecureStore.getItemAsync(LOCALE)).toBe(locale);
  });

  it('between Arabic and Kurdish keeps the RTL layout without a reload', async () => {
    await launch({}, true);
    await mapTab();
    await act(async () => setLocale('ckb'));
    expect(await SecureStore.getItemAsync(LOCALE)).toBe('ckb');
    expect(await mapTab()).toHaveAccessibleName('نەخشە');
    expect(forceRTL).not.toHaveBeenCalled();
    expect(reloadAppAsync).not.toHaveBeenCalled();
  });

  it('is restored after a remount', async () => {
    await launch({}, true);
    await mapTab();
    await act(async () => setLocale('ckb'));
    expect(await SecureStore.getItemAsync(LOCALE)).toBe('ckb');
    await screen.unmount();
    setLocale('ar'); // a fresh JS context starts in Arabic; the unmounted shell no longer saves changes
    expect(await SecureStore.getItemAsync(LOCALE)).toBe('ckb');
    await renderApp('/', routesNow);
    expect(await mapTab()).toHaveAccessibleName('نەخشە');
    expect(getLocale()).toBe('ckb');
  });
});
