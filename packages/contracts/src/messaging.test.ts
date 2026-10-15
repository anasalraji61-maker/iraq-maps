/**
 * Unit tests for messaging contract schemas: MessageStatus, Inquiry, ComposeParams.
 */
import { describe, expect, it } from 'vitest';
import { MessageStatus, MessagingChannelKind, Inquiry, ComposeParams, DeliveryTarget } from './messaging';

const VALID_TARGET = {
  placeId: 'n12345',
  channel: 'in_app',
  status: 'queued',
};

const VALID_INQUIRY = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: '00000000-0000-0000-0000-000000000002',
  text: 'هل المطعم مفتوح؟',
  targets: [VALID_TARGET],
  createdAt: '2026-10-15T12:00:00.000Z',
};

describe('MessageStatus', () => {
  it('accepts queued', () => expect(MessageStatus.parse('queued')).toBe('queued'));
  it('accepts delivered', () => expect(MessageStatus.parse('delivered')).toBe('delivered'));
  it('accepts read', () => expect(MessageStatus.parse('read')).toBe('read'));
  it('accepts failed', () => expect(MessageStatus.parse('failed')).toBe('failed'));
  it('rejects unknown status', () => expect(() => MessageStatus.parse('pending')).toThrow());
});

describe('MessagingChannelKind', () => {
  it('accepts in_app', () => expect(MessagingChannelKind.parse('in_app')).toBe('in_app'));
  it('accepts whatsapp', () => expect(MessagingChannelKind.parse('whatsapp')).toBe('whatsapp'));
  it('rejects sms', () => expect(() => MessagingChannelKind.parse('sms')).toThrow());
});

describe('DeliveryTarget', () => {
  it('parses a valid delivery target', () => {
    const t = DeliveryTarget.parse(VALID_TARGET);
    expect(t.channel).toBe('in_app');
  });

  it('accepts optional handoffLink', () => {
    const t = DeliveryTarget.parse({ ...VALID_TARGET, handoffLink: { type: 'wa_me', url: 'https://wa.me/9647701234567', copyText: 'تواصل معنا' } });
    expect(t.handoffLink).toBeDefined();
  });

  it('rejects invalid channel', () => {
    expect(() => DeliveryTarget.parse({ ...VALID_TARGET, channel: 'email' })).toThrow();
  });
});

describe('Inquiry', () => {
  it('parses a valid inquiry', () => {
    const i = Inquiry.parse(VALID_INQUIRY);
    expect(i.targets).toHaveLength(1);
    expect(i.readAt).toBeUndefined();
  });

  it('accepts null readAt', () => {
    const i = Inquiry.parse({ ...VALID_INQUIRY, readAt: null });
    expect(i.readAt).toBeNull();
  });

  it('accepts a readAt datetime string', () => {
    const i = Inquiry.parse({ ...VALID_INQUIRY, readAt: '2026-10-15T12:05:00.000Z' });
    expect(i.readAt).toBe('2026-10-15T12:05:00.000Z');
  });

  it('rejects text over 500 chars', () => {
    expect(() => Inquiry.parse({ ...VALID_INQUIRY, text: 'x'.repeat(501) })).toThrow();
  });

  it('rejects invalid userId', () => {
    expect(() => Inquiry.parse({ ...VALID_INQUIRY, userId: 'not-uuid' })).toThrow();
  });
});

describe('ComposeParams', () => {
  it('parses an empty object (all optional)', () => {
    const p = ComposeParams.parse({});
    expect(p.text).toBeUndefined();
    expect(p.placeIds).toBeUndefined();
  });

  it('accepts text and placeIds', () => {
    const p = ComposeParams.parse({ text: 'هل أنتم مفتوحون؟', placeIds: ['n1', 'n2'] });
    expect(p.placeIds).toHaveLength(2);
  });

  it('rejects more than 5 placeIds', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(() => ComposeParams.parse({ placeIds: ids })).toThrow();
  });
});
