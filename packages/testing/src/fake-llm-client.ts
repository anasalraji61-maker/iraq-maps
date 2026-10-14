import type { LlmClient } from '@iraq-maps/contracts';

export class FakeLlmClient implements LlmClient {
  calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  nextReply = 'هذا رد تجريبي من المساعد الذكي.';

  async chat(params: Parameters<LlmClient['chat']>[0]) {
    this.calls.push({ messages: params.messages });
    return { content: this.nextReply, stopReason: 'end_turn' as const };
  }

  reset() {
    this.calls = [];
    this.nextReply = 'هذا رد تجريبي من المساعد الذكي.';
  }
}
