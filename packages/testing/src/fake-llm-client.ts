import type { LlmClient } from '@iraq-maps/contracts';

export class FakeLlmClient implements LlmClient {
  calls: Array<Parameters<LlmClient['chat']>[0]> = [];
  nextReply = 'هذا رد تجريبي من المساعد الذكي.';
  nextToolCall?: { name: string; input: Record<string, unknown> };

  get callCount(): number { return this.calls.length; }
  get lastMessages(): Array<{ role: string; content: string }> | undefined {
    return this.calls.at(-1)?.messages;
  }
  get lastSystemPrompt(): string | undefined {
    return this.calls.at(-1)?.systemPrompt;
  }
  get lastTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> | undefined {
    return this.calls.at(-1)?.tools;
  }

  async chat(params: Parameters<LlmClient['chat']>[0]) {
    this.calls.push(params);
    if (this.nextToolCall) {
      const tc = this.nextToolCall;
      this.nextToolCall = undefined;
      return { content: '', toolCalls: [tc], stopReason: 'tool_use' as const };
    }
    return { content: this.nextReply, stopReason: 'end_turn' as const };
  }

  /** Alias for chat, used in some tests. */
  complete = this.chat.bind(this);

  reset() {
    this.calls = [];
    this.nextReply = 'هذا رد تجريبي من المساعد الذكي.';
    this.nextToolCall = undefined;
  }
}
