import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { RouteName } from './routes';

const AvailableRoutesContext = createContext<readonly RouteName[]>([]);

/** apps/mobile/src/shell/available-routes.ts feeds this; actions to undelivered screens stay hidden. */
export function AvailableRoutesProvider({ routes, children }: { routes: readonly RouteName[]; children: ReactNode }): ReactElement {
  return <AvailableRoutesContext.Provider value={routes}>{children}</AvailableRoutesContext.Provider>;
}

/** False without a provider, so a button to an undelivered screen is hidden by default. */
export function useRouteAvailable(name: RouteName): boolean {
  return useContext(AvailableRoutesContext).includes(name);
}
