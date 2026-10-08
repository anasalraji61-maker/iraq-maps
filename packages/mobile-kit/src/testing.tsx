import type { ApiClient } from '@iraq-maps/api-client';
import type { Locale } from '@iraq-maps/contracts';
import { setLocale } from '@iraq-maps/i18n';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { AvailableRoutesProvider } from './available-routes';
import { routes, type RouteName } from './routes';
import { ApiContext, SessionContext, type Session } from './session';

export interface RenderOptions {
  session?: Partial<Session>;
  api?: Partial<ApiClient>;
  locale?: Locale;
  availableRoutes?: readonly RouteName[];
}

const allRoutes = Object.keys(routes) as RouteName[];
const noop = async () => {};

/**
 * RNTL render wrapped in session, API, i18n and available-routes providers. Import from '@iraq-maps/mobile-kit/testing'.
 * Defaults: signed out with no-op actions, an empty API (pass the endpoints the screen calls), Arabic, every route available.
 */
export function renderWithProviders(ui: ReactElement, opts: RenderOptions = {}): ReturnType<typeof render> {
  setLocale(opts.locale ?? 'ar');
  const session: Session = { state: { status: 'signedOut' }, signIn: noop, updateUser: () => {}, signOut: noop, ...opts.session };
  const Providers = ({ children }: { children: ReactNode }) => (
    <ApiContext.Provider value={(opts.api ?? {}) as ApiClient}>
      <SessionContext.Provider value={session}>
        <AvailableRoutesProvider routes={opts.availableRoutes ?? allRoutes}>{children}</AvailableRoutesProvider>
      </SessionContext.Provider>
    </ApiContext.Provider>
  );
  return render(ui, { wrapper: Providers });
}
