import { tour3dContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';

export type Tour3DClient = InitClientReturn<typeof tour3dContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export function useTour3DClient(): Tour3DClient {
  const baseUrl = useApiBaseUrl();
  return initClient(tour3dContract, { baseUrl, baseHeaders: {} });
}
