import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';
import { PortTokens } from '@iraq-maps/contracts';

// Real LLM adapter loaded from env
async function resolveLlmClient() {
  if (process.env['ANTHROPIC_API_KEY']) {
    const { AnthropicLlmClient } = await import('@iraq-maps/adapter-llm-anthropic');
    return new AnthropicLlmClient({ model: process.env['ASSISTANT_MODEL'] ?? 'claude-haiku-4-5' });
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
