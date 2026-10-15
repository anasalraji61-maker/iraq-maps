import { storiesContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';

export type StoriesClient = InitClientReturn<typeof storiesContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export function useStoriesClient(): StoriesClient {
  const baseUrl = useApiBaseUrl();
  return initClient(storiesContract, { baseUrl, baseHeaders: {} });
}
