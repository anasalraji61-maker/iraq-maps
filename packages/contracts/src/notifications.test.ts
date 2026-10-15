/**
 * Unit tests for notifications contract schemas: DeviceId, PushToken,
 * NotificationPrefs, NotificationItem.
 */
import { describe, expect, it } from 'vitest';
import { DeviceId, PushToken, NotificationPrefs, NotificationItem } from './notifications';

const NOTIF_ID = '00000000-0000-0000-0000-000000000001';
const VALID_NOTIF = {
  id: NOTIF_ID,
  title: 'رسالة جديدة',
  body: 'لديك رسالة من المطعم',
  readAt: null,
  createdAt: '2026-10-15T12:00:00.000Z',
};

describe('DeviceId', () => {
  it('accepts a valid UUID', () => {
    const id = DeviceId.parse(NOTIF_ID);
    expect(typeof id).toBe('string');
  });

  it('rejects non-UUID', () => {
    expect(() => DeviceId.parse('device-abc')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => DeviceId.parse('')).toThrow();
  });
});

describe('PushToken', () => {
  it('accepts a non-empty string token', () => {
    const t = PushToken.parse('ExponentPushToken[abc123]');
    expect(typeof t).toBe('string');
  });

  it('rejects empty string', () => {
    expect(() => PushToken.parse('')).toThrow();
  });
});

describe('NotificationPrefs', () => {
  it('parses empty object with all defaults true', () => {
    const p = NotificationPrefs.parse({});
    expect(p.newInquiry).toBe(true);
    expect(p.replyReceived).toBe(true);
    expect(p.statusUpdate).toBe(true);
    expect(p.discoverLikes).toBe(true);
    expect(p.discoverComments).toBe(true);
    expect(p.messages).toBe(true);
  });

  it('accepts explicit false values', () => {
    const p = NotificationPrefs.parse({ discoverLikes: false, messages: false });
    expect(p.discoverLikes).toBe(false);
    expect(p.messages).toBe(false);
    expect(p.newInquiry).toBe(true);
  });

  it('accepts all fields true', () => {
    const p = NotificationPrefs.parse({
      newInquiry: true,
      replyReceived: true,
      statusUpdate: true,
      discoverLikes: true,
      discoverComments: true,
      messages: true,
    });
    expect(p.discoverComments).toBe(true);
  });

  it('rejects non-boolean value', () => {
    expect(() => NotificationPrefs.parse({ newInquiry: 'yes' })).toThrow();
  });
});

describe('NotificationItem', () => {
  it('parses a valid notification with null readAt', () => {
    const n = NotificationItem.parse(VALID_NOTIF);
    expect(n.title).toBe('رسالة جديدة');
    expect(n.readAt).toBeNull();
  });

  it('accepts a readAt datetime', () => {
    const n = NotificationItem.parse({ ...VALID_NOTIF, readAt: '2026-10-15T12:05:00.000Z' });
    expect(n.readAt).toBe('2026-10-15T12:05:00.000Z');
  });

  it('accepts optional data record', () => {
    const n = NotificationItem.parse({ ...VALID_NOTIF, data: { placeId: 'n12345', kind: 'inquiry' } });
    expect(n.data?.placeId).toBe('n12345');
  });

  it('rejects missing title', () => {
    const { title: _t, ...rest } = VALID_NOTIF;
    expect(() => NotificationItem.parse(rest)).toThrow();
  });

  it('rejects invalid createdAt', () => {
    expect(() => NotificationItem.parse({ ...VALID_NOTIF, createdAt: 'not-a-date' })).toThrow();
  });

  it('rejects non-UUID id', () => {
    expect(() => NotificationItem.parse({ ...VALID_NOTIF, id: 'notif-1' })).toThrow();
  });
});
