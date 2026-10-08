import { createClient, type ApiClient } from '@iraq-maps/api-client';
import { Me, TokenPair } from '@iraq-maps/contracts';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: Me };

export interface Session {
  state: SessionState;
  signIn(tokens: TokenPair, user: Me): Promise<void>;
  updateUser(user: Me): void;
  signOut(): Promise<void>;
}

/** expo-secure-store keys (see README). Renaming one signs every user out on upgrade. */
const storageKeys = { tokens: 'iraq-maps.session.tokens', user: 'iraq-maps.session.user' } as const;

export const SessionContext = createContext<Session | null>(null);
export const ApiContext = createContext<ApiClient | null>(null);

const read = async <T,>(key: string, schema: { parse(value: unknown): T }) =>
  schema.parse(JSON.parse((await SecureStore.getItemAsync(key)) ?? 'null'));
const write = (key: string, value: TokenPair | Me) => SecureStore.setItemAsync(key, JSON.stringify(value));

/** Session logic outside React: the tokens live in this closure, the API client reads them on every request. */
function createSession(setState: (state: SessionState) => void, baseUrl: () => string) {
  let tokens: TokenPair | null = null;

  const clear = async () => {
    tokens = null;
    setState({ status: 'signedOut' });
    await Promise.all(Object.values(storageKeys).map((key) => SecureStore.deleteItemAsync(key)));
  };

  const api = createClient({
    baseUrl,
    getTokens: () => tokens,
    onTokens: async (next) => {
      if (!next) return clear();
      if (!tokens) return; // signed out while the refresh was in flight
      tokens = next;
      await write(storageKeys.tokens, next);
    },
  });

  const updateUser = (user: Me) => {
    if (!tokens) return;
    setState({ status: 'signedIn', user });
    // The cached profile is only a startup hint; /v1/me is re-read on the next launch if this write fails.
    write(storageKeys.user, user).catch(() => undefined);
  };

  return {
    api,
    updateUser,
    async signIn(next: TokenPair, user: Me) {
      await Promise.all([write(storageKeys.tokens, next), write(storageKeys.user, user)]);
      tokens = next;
      setState({ status: 'signedIn', user });
    },
    async signOut() {
      const refreshToken = tokens?.refreshToken;
      await clear();
      // Best effort: the local session is already gone, so a slow or failed network call never blocks sign-out.
      if (refreshToken) api.auth.logout({ body: { refreshToken } }).catch(() => undefined);
    },
    async restore() {
      try {
        const [restored, user] = await Promise.all([read(storageKeys.tokens, TokenPair), read(storageKeys.user, Me)]);
        tokens = restored;
        setState({ status: 'signedIn', user });
      } catch {
        return clear(); // nothing stored, or corrupt / unreadable data
      }
      const res = await api.me.get();
      if (res.status === 200) updateUser(res.body);
    },
  };
}

/** Restores the session from expo-secure-store and provides it plus the API client. */
export function SessionProvider({ children, apiBaseUrl }: { children: ReactNode; apiBaseUrl: () => string }): ReactElement {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const baseUrl = useRef(apiBaseUrl);
  baseUrl.current = apiBaseUrl;
  const [{ api, restore, signIn, updateUser, signOut }] = useState(() => createSession(setState, () => baseUrl.current()));

  // Offline first: a failed background /v1/me keeps the cached session.
  useEffect(() => void restore().catch(() => undefined), [restore]);

  const session = useMemo(() => ({ state, signIn, updateUser, signOut }), [state, signIn, updateUser, signOut]);
  return (
    <ApiContext.Provider value={api}>
      <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
    </ApiContext.Provider>
  );
}

const outside = (hook: string): never => {
  throw new Error(`${hook}() must be used inside <SessionProvider> (or renderWithProviders in tests)`);
};

export const useSession = (): Session => useContext(SessionContext) ?? outside('useSession');
export const useApi = (): ApiClient => useContext(ApiContext) ?? outside('useApi');
