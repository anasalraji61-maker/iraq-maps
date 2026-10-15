import { eventsContract, challengesContract, marketplaceContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient } from '@ts-rest/core';

export function useEventsClient() {
  const baseUrl = useApiBaseUrl();
  return initClient(eventsContract, { baseUrl, baseHeaders: {} });
}

export function useChallengesClient() {
  const baseUrl = useApiBaseUrl();
  return initClient(challengesContract, { baseUrl, baseHeaders: {} });
}

export function useMarketplaceClient() {
  const baseUrl = useApiBaseUrl();
  return initClient(marketplaceContract, { baseUrl, baseHeaders: {} });
}
