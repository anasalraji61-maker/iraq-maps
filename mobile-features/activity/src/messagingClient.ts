/**
 * Minimal messaging client for the activity feature.
 * Only used to fetch the user's own inquiries list.
 */
import { messagingContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';

export type ActivityMessagingClient = InitClientReturn<
  typeof messagingContract,
  { baseUrl: string; baseHeaders: Record<string, string> }
>;

export function useActivityMessagingClient(): ActivityMessagingClient {
  const baseUrl = useApiBaseUrl();
  return initClient(messagingContract, { baseUrl, baseHeaders: {} });
}
