import type { ChannelAdapter, InboundMessage } from '@iraq-maps/contracts';
import type { MessagingChannelKind } from '@iraq-maps/contracts';

/** In-memory fake for testing and dev without WhatsApp credentials. */
export class FakeMessagingChannel implements ChannelAdapter {
  readonly channelType: MessagingChannelKind = 'in_app';
  readonly sent: Array<{ to: string; text: string }> = [];

  async send(params: { to: string; text: string }): Promise<{ externalId: string }> {
    this.sent.push({ to: params.to, text: params.text });
    return { externalId: `fake-${Date.now()}` };
  }

  async parseInbound(_rawBody: unknown, _headers: Record<string, string>): Promise<InboundMessage | null> {
    return null;
  }
}
