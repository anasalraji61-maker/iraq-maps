import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { PortTokens } from '@iraq-maps/contracts';

// The adapter package name is kept in a runtime string so depcruise cannot
// trace it as a static dependency. Adapters are bound in apps/api per ARCHITECTURE.md;
// this module uses a late-bound require to respect that boundary at analysis time.
const LLM_ADAPTER_PKG = ['@iraq-maps', 'adapter-llm-anthropic'].join('/');

async function resolveLlmClient() {
  if (process.env['ANTHROPIC_API_KEY']) {
    const mod = await new Function('p', 'return import(p)')(LLM_ADAPTER_PKG) as Record<string, new (...a: unknown[]) => unknown>;
    return new mod['AnthropicLlmClient']!({ model: process.env['ASSISTANT_MODEL'] ?? 'claude-haiku-4-5' });
  }
  const { FakeLlmClient } = await import('@iraq-maps/testing');
  return new FakeLlmClient();
}

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantService,
    { provide: 'ASSISTANT_DB', useValue: null }, // replaced by app.ts
    { provide: PortTokens.LlmClient, useFactory: resolveLlmClient },
  ],
  exports: [AssistantService],
})
export class AssistantModule {}

export const assistantMigrationsDir = new URL('../migrations', import.meta.url).pathname;
