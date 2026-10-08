import { createClient, type ApiClient } from '@iraq-maps/api-client';
import { Me, TokenPair } from '@iraq-maps/contracts';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiContext, SessionContext, type Session, type SessionState } from './context';

const TOKENS_KEY = 'session.tokens';
const USER_KEY = 'session.user';

/** Stored values are untrusted input too: anything unreadable counts as absent. */
async function read<T>(key: string, schema: { parse(value: unknown): T }): Promise<T | null> {
  try {
    return schema.parse(JSON.parse((await SecureStore.getItemAsync(key)) ?? ''));
  } catch {
    return null;
  }
}

/** Restores the session from expo-secure-store and provides it plus the API client. */
export function SessionProvider({ children, apiBaseUrl }: { children: ReactNode; apiBaseUrl: () => string }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const tokens = useRef<TokenPair | null>(null);
  const baseUrl = useRef(apiBaseUrl);
  baseUrl.current = apiBaseUrl;

  const setTokens = useCallback(async (next: TokenPair | null) => {
    tokens.current = next;
    if (next) return SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(next));
    setState({ status: 'signedOut' });
    await Promise.all([SecureStore.deleteItemAsync(TOKENS_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
  }, []);

  const api = useMemo(() => createClient({ baseUrl: () => baseUrl.current(), getTokens: () => tokens.current, onTokens: setTokens }), [setTokens]);

  const updateUser = useCallback((user: Me) => {
    if (!tokens.current) return;
    setState({ status: 'signedIn', user });
    void SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  }, []);

  useEffect(() => {
    void (async () => {
      const [saved, user] = await Promise.all([read(TOKENS_KEY, TokenPair), read(USER_KEY, Me)]);
      if (!saved || !user) return setState({ status: 'signedOut' });
      // Signed in straight from the cached profile (works offline), then refreshed from the server.
      // An expired session ends here: the client's failed refresh calls setTokens(null).
      tokens.current = saved;
      setState({ status: 'signedIn', user });
      const res = await api.me.get().catch(() => null);
      if (res?.status === 200) updateUser(res.body);
    })();
  }, [api, updateUser]);

  const session = useMemo<Session>(
    () => ({
      state,
      updateUser,
      async signIn(pair, user) {
        await setTokens(pair);
        updateUser(user);
      },
      async signOut() {
        const refreshToken = tokens.current?.refreshToken;
        await setTokens(null);
        if (refreshToken) await api.auth.logout({ body: { refreshToken } }).catch(() => undefined);
      },
    }),
    [state, api, setTokens, updateUser],
  );

  return (
    <SessionContext.Provider value={session}>
      <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession() needs a <SessionProvider> (or renderWithProviders in tests)');
  return session;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi() needs a <SessionProvider> (or renderWithProviders in tests)');
  return api;
}
