import type { ApiContract, TokenPair } from '@iraq-maps/contracts';
import type { InitClientReturn } from '@ts-rest/core';

export type ApiClient = InitClientReturn<ApiContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export interface CreateClientOptions {
  /** Read on every request so the developer server-URL setting applies without a restart. */
  baseUrl: () => string;
  getTokens(): TokenPair | null;
  /** Called after a successful refresh (new pair) or a failed one (null => signed out). */
  onTokens(tokens: TokenPair | null): void | Promise<void>;
  fetch?: typeof fetch;
}

/** ts-rest client that injects the bearer token and, on 401, refreshes once (single-flight) and retries. */
export function createClient(_opts: CreateClientOptions): ApiClient {
  throw new Error('not implemented');
}
