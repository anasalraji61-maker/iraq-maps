import type { ApiClient } from '@iraq-maps/api-client';
import type { Locale } from '@iraq-maps/contracts';
import { setLocale } from '@iraq-maps/i18n';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ApiBaseUrlContext, ApiContext, SessionContext, type Session } from './context';
import { AvailableRoutesProvider, routes, type RouteName } from './routes';

export interface RenderOptions {
  session?: Partial<Session>;
  api?: Partial<ApiClient>;
  locale?: Locale;
  availableRoutes?: readonly RouteName[];
  apiBaseUrl?: string;
}

const allRoutes = Object.keys(routes) as RouteName[];

/** RNTL render wrapped in session, API, i18n and available-routes providers. Import from '@iraq-maps/mobile-kit/testing'.
 * Defaults: signed out, no-op session actions, locale 'ar', every route available, API base URL 'http://api.test'.
 * Unstubbed API calls fail loudly. */
export function renderWithProviders(ui: ReactElement, opts: RenderOptions = {}): ReturnType<typeof render> {
  setLocale(opts.locale ?? 'ar');
  const session: Session = { state: { status: 'signedOut' }, signIn: async () => {}, updateUser: () => {}, signOut: async () => {}, ...opts.session };
  return render(
    <SessionContext.Provider value={session}>
      <ApiContext.Provider value={(opts.api ?? {}) as ApiClient}>
        <ApiBaseUrlContext.Provider value={() => opts.apiBaseUrl ?? 'http://api.test'}>
          <AvailableRoutesProvider routes={opts.availableRoutes ?? allRoutes}>{ui}</AvailableRoutesProvider>
        </ApiBaseUrlContext.Provider>
      </ApiContext.Provider>
    </SessionContext.Provider>,
  );
}

const secureStore = new Map<string, string>();
/** In-memory expo-secure-store for Jest, shared by every test file of a run:
 * `jest.mock('expo-secure-store', () => jest.requireActual<typeof import('@iraq-maps/mobile-kit/testing')>('@iraq-maps/mobile-kit/testing').memorySecureStore)`
 * (this module never loads the real expo-secure-store, so the factory cannot recurse). Call `clear()` between tests. */
export const memorySecureStore = {
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void secureStore.set(key, value),
  deleteItemAsync: async (key: string) => void secureStore.delete(key),
  clear: () => secureStore.clear(),
};
