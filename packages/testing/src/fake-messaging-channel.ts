// M4 fake: records sends and allows triggering fake status/reply callbacks.
import type { ChannelAdapter, InboundMessage, MessagingChannelKind } from '@iraq-maps/contracts';

export class FakeMessagingChannel implements ChannelAdapter {
  readonly channelType: MessagingChannelKind = 'in_app';
  readonly sends: Array<{ to: string; text: string; templateParams?: Record<string, string> }> = [];

  async send(params: { to: string; text: string; templateParams?: Record<string, string> }): Promise<{ externalId: string }> {
    this.sends.push(params);
    return { externalId: crypto.randomUUID() };
  }

  async parseInbound(_rawBody: unknown, _headers: Record<string, string>): Promise<InboundMessage | null> {
    return null;
  }

  reset(): void {
    this.sends.length = 0;
  }
}
