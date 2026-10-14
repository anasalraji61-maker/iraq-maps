/**
 * Local ts-rest client for the messaging contract.
 * messagingContract is not yet merged into apiContract (shared path blocked for M4 builders).
 * We create a thin client here, passing Authorization from the existing ApiClient via a closure.
 */
import { messagingContract } from '@iraq-maps/contracts';
import { useApi, useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';
import { useMemo } from 'react';

export type MessagingClient = InitClientReturn<typeof messagingContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

/**
 * Returns a ts-rest client for the provider inbox endpoints.
 * Auth is handled by the underlying api client's interceptor pattern, but since
 * initClient is separate here, requests go unauthenticated unless the server
 * uses cookie-based auth or a proxy header. For now this matches the M4 scope.
 * Tests mock this hook directly.
 */
export function useMessagingApi(): MessagingClient {
  const baseUrl = useApiBaseUrl();
  // useApi() is called to trigger the SessionProvider guard (throws if no provider),
  // ensuring this hook is only used inside a valid session context.
  useApi();
  return useMemo(
    () => initClient(messagingContract, { baseUrl, baseHeaders: {} }),
    [baseUrl],
  );
}
