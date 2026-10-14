/**
 * Typed accessor for the messaging slice of the API client.
 *
 * The integrator must add `messaging: messagingContract` to `apiContract` in
 * packages/contracts/src/http.ts (see docs/contract-requests/M4-builder-messages-app.md).
 * Until then this cast keeps the feature compilable.
 */
import { messagingContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';

export type MessagingClient = InitClientReturn<typeof messagingContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

/** Returns a messaging client that calls the API without auth (M4 MVP: server validates via cookie/session). */
export function useMessagingClient(): MessagingClient {
  const baseUrl = useApiBaseUrl();
  return initClient(messagingContract, { baseUrl, baseHeaders: {} });
}
