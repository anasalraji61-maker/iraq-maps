import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WhatsAppChannelAdapter, createWhatsAppAdapterFromEnv } from './index.js';
import { FakeMessagingChannel } from '@iraq-maps/testing';

// Recorded payloads (realistic WhatsApp Cloud API format)
const STATUS_PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            statuses: [
              {
                id: 'wamid.xxx',
                status: 'delivered',
                timestamp: '1234567890',
                recipient_id: '9647001234567',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
});

const TEXT_PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            messages: [
              {
                from: '9647001234567',
                id: 'wamid.yyy',
                timestamp: '1234567890',
                text: { body: 'نعم متاح' },
                type: 'text',
              },
            ],
            contacts: [{ profile: { name: 'أحمد' }, wa_id: '9647001234567' }],
          },
          field: 'messages',
        },
      ],
    },
  ],
});

function makeAdapter(secret: string) {
  return new WhatsAppChannelAdapter({
    phoneNumberId: 'test-phone-id',
    accessToken: 'test-access-token',
    appSecret: secret,
    verifyToken: 'test-verify-token',
    templateName: 'inquiry',
  });
}

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('WhatsAppChannelAdapter', () => {
  let secret: string;
  let adapter: WhatsAppChannelAdapter;

  beforeEach(() => {
    secret = randomBytes(32).toString('hex');
    adapter = makeAdapter(secret);
  });

  describe('parseInbound — signature verification', () => {
    it('accepts a valid signature for status payload', async () => {
      const headers = { 'x-hub-signature-256': sign(secret, STATUS_PAYLOAD) };
      const result = await adapter.parseInbound(STATUS_PAYLOAD, headers);
      expect(result).not.toBeNull();
    });

    it('rejects a tampered payload (wrong body content)', async () => {
      const tamperedBody = STATUS_PAYLOAD + 'x';
      const headers = { 'x-hub-signature-256': sign(secret, STATUS_PAYLOAD) };
      const result = await adapter.parseInbound(tamperedBody, headers);
      expect(result).toBeNull();
    });

    it('rejects a wrong secret', async () => {
      const wrongSecret = randomBytes(32).toString('hex');
      const headers = { 'x-hub-signature-256': sign(wrongSecret, STATUS_PAYLOAD) };
      const result = await adapter.parseInbound(STATUS_PAYLOAD, headers);
      expect(result).toBeNull();
    });

    it('rejects missing signature header', async () => {
      const result = await adapter.parseInbound(STATUS_PAYLOAD, {});
      expect(result).toBeNull();
    });
  });

  describe('parseInbound — status update payload', () => {
    it('returns a status inbound message with __status: prefix', async () => {
      const headers = { 'x-hub-signature-256': sign(secret, STATUS_PAYLOAD) };
      const result = await adapter.parseInbound(STATUS_PAYLOAD, headers);
      expect(result).toMatchObject({
        externalId: 'wamid.xxx',
        from: '9647001234567',
        text: '__status:delivered',
      });
      expect(result!.receivedAt).toBeInstanceOf(Date);
    });
  });

  describe('parseInbound — text reply payload', () => {
    it('returns an inbound message with Arabic text', async () => {
      const headers = { 'x-hub-signature-256': sign(secret, TEXT_PAYLOAD) };
      const result = await adapter.parseInbound(TEXT_PAYLOAD, headers);
      expect(result).toMatchObject({
        externalId: 'wamid.yyy',
        from: '9647001234567',
        text: 'نعم متاح',
      });
      expect(result!.receivedAt).toBeInstanceOf(Date);
    });
  });

  describe('parseInbound — object as body (pre-parsed JSON)', () => {
    it('handles an already-parsed object body', async () => {
      const parsed = JSON.parse(TEXT_PAYLOAD) as unknown;
      // Sign the stringified form
      const strBody = JSON.stringify(parsed);
      const headers = { 'x-hub-signature-256': sign(secret, strBody) };
      const result = await adapter.parseInbound(parsed, headers);
      expect(result).toMatchObject({ text: 'نعم متاح' });
    });
  });

  describe('send()', () => {
    it('does NOT call fetch when no WHATSAPP_PHONE_NUMBER_ID env var (factory returns null)', () => {
      const saved = process.env.WHATSAPP_PHONE_NUMBER_ID;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      const result = createWhatsAppAdapterFromEnv();
      expect(result).toBeNull();
      if (saved !== undefined) process.env.WHATSAPP_PHONE_NUMBER_ID = saved;
    });

    it('calls fetch with Authorization header and returns externalId', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.sent-001' }] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = await adapter.send({ to: '9647001234567', text: 'مرحباً' });
      expect(result.externalId).toBe('wamid.sent-001');
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('test-phone-id');
      expect((opts.headers as Record<string, string>)['Authorization']).toContain('Bearer');
      vi.unstubAllGlobals();
    });

    it('throws when the API responds with an error status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad Request' }));
      await expect(adapter.send({ to: '9647001234567', text: 'test' })).rejects.toThrow('WhatsApp send failed');
      vi.unstubAllGlobals();
    });
  });

  describe('verifyWebhook()', () => {
    it('returns the challenge on valid mode and token', () => {
      const result = adapter.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test-verify-token',
        'hub.challenge': 'abc123',
      });
      expect(result).toBe('abc123');
    });

    it('returns null on invalid verify token', () => {
      const result = adapter.verifyWebhook({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'abc123',
      });
      expect(result).toBeNull();
    });

    it('returns null on wrong mode', () => {
      const result = adapter.verifyWebhook({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'test-verify-token',
        'hub.challenge': 'abc123',
      });
      expect(result).toBeNull();
    });
  });
});

// Conformance suite: FakeMessagingChannel passes the same basic contract
describe('FakeMessagingChannel conformance', () => {
  it('send() records the send and returns a UUID externalId', async () => {
    const fake = new FakeMessagingChannel();
    const result = await fake.send({ to: '9647001234567', text: 'hello' });
    expect(result.externalId).toBeTruthy();
    expect(fake.sends).toHaveLength(1);
    expect(fake.sends[0]).toMatchObject({ to: '9647001234567', text: 'hello' });
  });

  it('parseInbound() returns null', async () => {
    const fake = new FakeMessagingChannel();
    const result = await fake.parseInbound({}, {});
    expect(result).toBeNull();
  });

  it('channelType is in_app', () => {
    expect(new FakeMessagingChannel().channelType).toBe('in_app');
  });

  it('reset() clears the sends log', async () => {
    const fake = new FakeMessagingChannel();
    await fake.send({ to: '964700', text: 'a' });
    fake.reset();
    expect(fake.sends).toHaveLength(0);
  });
});
