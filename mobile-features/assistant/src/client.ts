/**
 * Typed accessor for the assistant slice of the API.
 *
 * The integrator must add `assistant: assistantContract` to `apiContract` in
 * packages/contracts/src/http.ts. Until then this cast keeps the feature compilable.
 */
import { assistantContract } from '@iraq-maps/contracts';
import { useApiBaseUrl } from '@iraq-maps/mobile-kit';
import { initClient, type InitClientReturn } from '@ts-rest/core';

export type AssistantClient = InitClientReturn<typeof assistantContract, { baseUrl: string; baseHeaders: Record<string, string> }>;

export function useAssistantClient(): AssistantClient {
  const baseUrl = useApiBaseUrl();
  return initClient(assistantContract, { baseUrl, baseHeaders: {} });
}
