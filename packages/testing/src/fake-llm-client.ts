import type { LlmClient } from '@iraq-maps/contracts';

export class FakeLlmClient implements LlmClient {
  calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  nextReply = 'هذا رد تجريبي من المساعد الذكي.';
  nextToolCall?: { name: string; input: Record<string, unknown> };

  async chat(params: Parameters<LlmClient['chat']>[0]) {
    this.calls.push({ messages: params.messages });
    if (this.nextToolCall) {
      const tc = this.nextToolCall;
      this.nextToolCall = undefined;
      return { content: '', toolCalls: [tc], stopReason: 'tool_use' as const };
    }
    return { content: this.nextReply, stopReason: 'end_turn' as const };
  }

  reset() {
    this.calls = [];
    this.nextReply = 'هذا رد تجريبي من المساعد الذكي.';
    this.nextToolCall = undefined;
  }
}
