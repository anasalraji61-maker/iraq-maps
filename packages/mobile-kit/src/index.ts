import type { ApiClient } from '@iraq-maps/api-client';
import type { Me, TokenPair } from '@iraq-maps/contracts';
import type { ReactElement, ReactNode } from 'react';
import type { RouteName, RouteParams } from './routes';

export { routes, type RouteName, type RouteParams } from './routes';

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: Me };

export interface Session {
  state: SessionState;
  signIn(tokens: TokenPair, user: Me): Promise<void>;
  updateUser(user: Me): void;
  signOut(): Promise<void>;
}

/** Restores the session from expo-secure-store and provides it plus the API client. */
export function SessionProvider(_props: { children: ReactNode; apiBaseUrl: () => string }): ReactElement {
  throw new Error('not implemented');
}

export function useSession(): Session {
  throw new Error('not implemented');
}

export function useApi(): ApiClient {
  throw new Error('not implemented');
}

/** Builds a concrete path, e.g. href('place', { placeId: 'p1' }) => '/place/p1'. */
export function href<N extends RouteName>(_name: N, _params?: RouteParams<N>): string {
  throw new Error('not implemented');
}

/** apps/mobile/src/shell/available-routes.ts feeds this; actions to undelivered screens stay hidden. */
export function AvailableRoutesProvider(_props: { routes: readonly RouteName[]; children: ReactNode }): ReactElement {
  throw new Error('not implemented');
}

export function useRouteAvailable(_name: RouteName): boolean {
  throw new Error('not implemented');
}
