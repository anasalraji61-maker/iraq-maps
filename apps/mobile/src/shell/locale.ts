import { Locale } from '@iraq-maps/contracts';
import { getLocale, isRtl, onLocaleChange, setLocale } from '@iraq-maps/i18n';
import { reloadAppAsync } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { I18nManager } from 'react-native';

const LOCALE_KEY = 'app.locale';
const RELOADED_FOR_KEY = 'app.directionReloadFor';

/** React Native applies a layout direction only after a restart, so a flip (ar/ckb <-> en) reloads the JS app. */
async function applyDirection(locale: Locale): Promise<void> {
  const rtl = isRtl(locale);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  if (I18nManager.isRTL === rtl) return;
  // Reload at most once per requested locale: if the platform ignores forceRTL we must not loop forever.
  if ((await SecureStore.getItemAsync(RELOADED_FOR_KEY)) === locale) return;
  await SecureStore.setItemAsync(RELOADED_FOR_KEY, locale);
  await reloadAppAsync('layout direction changed');
}

/** Restores the saved locale (Arabic first) and its direction. */
export async function restoreLocale(): Promise<void> {
  const saved = Locale.safeParse(await SecureStore.getItemAsync(LOCALE_KEY));
  setLocale(saved.success ? saved.data : 'ar');
  await applyDirection(getLocale());
}

/** Persists every later change (e.g. from the account language screen) before applying its direction. */
export const persistLocaleChanges = () =>
  onLocaleChange((locale) => void SecureStore.setItemAsync(LOCALE_KEY, locale).then(() => applyDirection(locale)));

/** The current locale, re-rendering on change (a direction-keeping switch such as ar <-> ckb does not reload). */
export const useLocale = () => useSyncExternalStore(onLocaleChange, getLocale);
