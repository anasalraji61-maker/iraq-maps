import { describe, it, expect, vi } from 'vitest';
import { AnthropicLlmClient } from './index.js';

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'hello' }],
  stop_reason: 'end_turn',
});

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: unknown) {}
  }
  return { default: MockAnthropic };
});

describe('AnthropicLlmClient', () => {
  it('returns text content from the API response', async () => {
    const client = new AnthropicLlmClient({ model: 'claude-3-haiku-20240307' });
    const result = await client.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result.content).toBe('hello');
    expect(result.stopReason).toBe('end_turn');
  });
});
