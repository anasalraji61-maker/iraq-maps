import { Locale } from '@iraq-maps/contracts';
import { isRtl, onLocaleChange, setLocale } from '@iraq-maps/i18n';
import { reloadAppAsync } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { I18nManager } from 'react-native';

const keys = { locale: 'iraq-maps.shell.locale', reloadedFor: 'iraq-maps.shell.directionReload' } as const;

/**
 * React Native reads the layout direction when the app starts, so a change is forced natively and the app reloads.
 * `reloadedFor` is the direction the previous reload asked for: an app that still starts the other way does not reload
 * again, so a platform that ignores forceRTL cannot trap it in a reload loop. Resolves true when a reload is under way.
 */
async function syncDirection(locale: Locale, reloadedFor: string | null): Promise<boolean> {
  const rtl = isRtl(locale);
  const direction = rtl ? 'rtl' : 'ltr';
  if (I18nManager.isRTL === rtl) {
    if (reloadedFor) await SecureStore.deleteItemAsync(keys.reloadedFor);
    return false;
  }
  if (reloadedFor === direction) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  await SecureStore.setItemAsync(keys.reloadedFor, direction);
  await reloadAppAsync('layout direction changed');
  return true;
}

const read = (key: string) => SecureStore.getItemAsync(key).catch(() => null);

/**
 * Restores the saved locale (Arabic by default, never the device locale) and its layout direction, then persists and
 * applies every later setLocale(). Resolves to the unsubscribe function, or null while a direction reload is under way.
 */
export async function startLocale(): Promise<(() => void) | null> {
  const [saved, reloadedFor] = await Promise.all([read(keys.locale), read(keys.reloadedFor)]);
  const locale = Locale.safeParse(saved).data ?? 'ar';
  setLocale(locale);
  // A storage or reload failure keeps the current direction rather than risking a reload loop.
  if (await syncDirection(locale, reloadedFor).catch(() => false)) return null;
  return onLocaleChange((next) => {
    SecureStore.setItemAsync(keys.locale, next)
      .then(() => syncDirection(next, null))
      .catch(() => undefined);
  });
}
