import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient } from '@iraq-maps/contracts';

export class AnthropicLlmClient implements LlmClient {
  private client: Anthropic;
  private model: string;

  constructor(opts: { model: string }) {
    // API key from env — never in code
    this.client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    this.model = opts.model;
  }

  async chat(params: Parameters<LlmClient['chat']>[0]) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 1024,
      system: params.systemPrompt,
      messages: params.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return {
      content: textBlock?.type === 'text' ? textBlock.text : '',
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' as const :
                  response.stop_reason === 'max_tokens' ? 'max_tokens' as const : 'end_turn' as const,
    };
  }
}
