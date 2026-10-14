import { discoverContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';

export type DiscoverClient = InitClientReturn<typeof discoverContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export function useDiscoverClient(): DiscoverClient {
  const baseUrl = useApiBaseUrl();
  return initClient(discoverContract, { baseUrl, baseHeaders: {} });
}
