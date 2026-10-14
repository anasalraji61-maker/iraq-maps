import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChannelAdapter, InboundMessage, MessagingChannelKind } from '@iraq-maps/contracts';

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  templateName: string;
}

// WhatsApp Cloud API payload shapes (simplified)
interface WaMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  type: string;
}

interface WaStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

interface WaValue {
  messaging_product: string;
  messages?: WaMessage[];
  statuses?: WaStatus[];
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
}

interface WaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{ value: WaValue; field: string }>;
  }>;
}

export class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly channelType: MessagingChannelKind = 'whatsapp';

  constructor(private readonly config: WhatsAppConfig) {}

  async send(params: { to: string; text: string; templateParams?: Record<string, string> }): Promise<{ externalId: string }> {
    const url = `https://graph.facebook.com/v19.0/${this.config.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'template',
      template: {
        name: this.config.templateName,
        language: { code: 'ar' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: params.text }],
          },
        ],
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`WhatsApp send failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { messages: Array<{ id: string }> };
    const externalId = data.messages[0]?.id;
    if (!externalId) throw new Error('WhatsApp send: missing message id in response');
    return { externalId };
  }

  async parseInbound(rawBody: unknown, headers: Record<string, string>): Promise<InboundMessage | null> {
    // 1. Verify signature
    const sig = headers['x-hub-signature-256'] ?? headers['X-Hub-Signature-256'];
    if (!sig) return null;

    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    const expected = 'sha256=' + createHmac('sha256', this.config.appSecret).update(bodyStr).digest('hex');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    // 2. Parse payload
    const payload = (typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody) as WaWebhookPayload;
    if (payload.object !== 'whatsapp_business_account') return null;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const val = change.value;

        // Status updates: deliver as null (caller can inspect separately if needed)
        if (val.statuses?.length) {
          const st = val.statuses[0];
          if (!st) continue;
          return {
            externalId: st.id,
            from: st.recipient_id,
            text: `__status:${st.status}`,
            receivedAt: new Date(Number(st.timestamp) * 1000),
          };
        }

        // Text reply
        if (val.messages?.length) {
          const msg = val.messages[0];
          if (!msg || msg.type !== 'text' || !msg.text) continue;
          return {
            externalId: msg.id,
            from: msg.from,
            text: msg.text.body,
            receivedAt: new Date(Number(msg.timestamp) * 1000),
          };
        }
      }
    }

    return null;
  }

  verifyWebhook(query: { 'hub.mode': string; 'hub.verify_token': string; 'hub.challenge': string }): string | null {
    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === this.config.verifyToken) {
      return query['hub.challenge'];
    }
    return null;
  }
}

export function createWhatsAppAdapterFromEnv(): WhatsAppChannelAdapter | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) return null;
  return new WhatsAppChannelAdapter({
    phoneNumberId,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
    appSecret: process.env.WHATSAPP_APP_SECRET!,
    verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME ?? 'inquiry',
  });
}
