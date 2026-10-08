import type { Locale } from '@iraq-maps/contracts';
import { getLocale, onLocaleChange } from '@iraq-maps/i18n';
import { useSyncExternalStore } from 'react';

/** The current locale. Callers re-render on every setLocale(), so the text they get from t() updates at once. */
export const useLocale = (): Locale => useSyncExternalStore(onLocaleChange, getLocale);
