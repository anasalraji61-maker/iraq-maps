import type { ApiClient } from '@iraq-maps/api-client';
import type { Me, TokenPair } from '@iraq-maps/contracts';
import { createContext } from 'react';

export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: Me };

export interface Session {
  state: SessionState;
  signIn(tokens: TokenPair, user: Me): Promise<void>;
  updateUser(user: Me): void;
  signOut(): Promise<void>;
}

// Shared by SessionProvider and renderWithProviders (testing), which must not load expo-secure-store.
export const SessionContext = createContext<Session | null>(null);
export const ApiContext = createContext<ApiClient | null>(null);
