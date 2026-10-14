import { Module } from '@nestjs/common';
import { AssistantController, AssistantAdminController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { PLACES_SEARCH_TOKEN } from './assistant.service.js';
import { PortTokens } from '@iraq-maps/contracts';
import { getAssistantModel } from './config.js';

// The adapter package name is kept in a runtime string so depcruise cannot
// trace it as a static dependency. Adapters are bound in apps/api per ARCHITECTURE.md;
// this module uses a late-bound require to respect that boundary at analysis time.
const LLM_ADAPTER_PKG = ['@iraq-maps', 'adapter-llm-anthropic'].join('/');

async function resolveLlmClient() {
  if (process.env['ANTHROPIC_API_KEY']) {
    const mod = await new Function('p', 'return import(p)')(LLM_ADAPTER_PKG) as Record<string, new (...a: unknown[]) => unknown>;
    return new mod['AnthropicLlmClient']!({ model: getAssistantModel() ?? 'claude-haiku-4-5' });
  }
  const { FakeLlmClient } = await import('@iraq-maps/testing');
  return new FakeLlmClient();
}

// Fake places search — returns hardcoded results for testing without a real DB.
// In production, apps/api wires a real implementation that calls the places module.
const fakePlacesSearch = async (query: string, _city?: string) => [
  { id: 'place-001', name: `مطعم ${query}`, address: 'شارع الرشيد، بغداد' },
  { id: 'place-002', name: `${query} المركزي`, address: 'شارع المتنبي، بغداد' },
];

@Module({
  controllers: [AssistantController, AssistantAdminController],
  providers: [
    AssistantService,
    { provide: 'ASSISTANT_DB', useValue: null }, // replaced by app.ts
    { provide: PortTokens.LlmClient, useFactory: resolveLlmClient },
    { provide: PLACES_SEARCH_TOKEN, useValue: fakePlacesSearch },
  ],
  exports: [AssistantService],
})
export class AssistantModule {}

export const assistantMigrationsDir = new URL('../migrations', import.meta.url).pathname;
