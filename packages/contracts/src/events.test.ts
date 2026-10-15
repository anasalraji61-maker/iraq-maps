/**
 * Unit tests for parseEvent.
 */
import { describe, expect, it } from 'vitest';
import { parseEvent } from './events';

const BASE = {
  id: '00000000-0000-0000-0000-000000000001',
  occurredAt: '2026-10-15T12:00:00.000Z',
};

describe('parseEvent', () => {
  it('parses a valid identity.user.registered.v1 event', () => {
    const raw = {
      ...BASE,
      name: 'identity.user.registered.v1',
      payload: { userId: '00000000-0000-0000-0000-000000000002', locale: 'ar' },
    };
    const event = parseEvent(raw);
    expect(event.name).toBe('identity.user.registered.v1');
    expect(event.id).toBe(BASE.id);
  });

  it('parses a valid identity.user.deleted.v1 event', () => {
    const raw = {
      ...BASE,
      name: 'identity.user.deleted.v1',
      payload: { userId: '00000000-0000-0000-0000-000000000003' },
    };
    expect(parseEvent(raw).name).toBe('identity.user.deleted.v1');
  });

  it('parses a messaging.inquiry.received.v1 event', () => {
    const raw = {
      ...BASE,
      name: 'messaging.inquiry.received.v1',
      payload: { inquiryId: 'inq-1', userId: '00000000-0000-0000-0000-000000000004', placeIds: ['n1'] },
    };
    expect(parseEvent(raw).name).toBe('messaging.inquiry.received.v1');
  });

  it('parses a discover.post.liked.v1 event', () => {
    const raw = {
      ...BASE,
      name: 'discover.post.liked.v1',
      payload: {
        postId: '00000000-0000-0000-0000-000000000010',
        postAuthorId: '00000000-0000-0000-0000-000000000011',
        likedByUserId: '00000000-0000-0000-0000-000000000012',
      },
    };
    expect(parseEvent(raw).name).toBe('discover.post.liked.v1');
  });

  it('throws ZodError on invalid id (not a UUID)', () => {
    const raw = { ...BASE, id: 'not-a-uuid', name: 'identity.user.deleted.v1', payload: { userId: '00000000-0000-0000-0000-000000000003' } };
    expect(() => parseEvent(raw)).toThrow();
  });

  it('throws on unknown event name', () => {
    const raw = { ...BASE, name: 'unknown.event.v1', payload: {} };
    expect(() => parseEvent(raw)).toThrow('unknown event');
  });

  it('throws on invalid payload for a known event name', () => {
    const raw = {
      ...BASE,
      name: 'identity.user.registered.v1',
      payload: { userId: 'not-a-uuid', locale: 'xx' },
    };
    expect(() => parseEvent(raw)).toThrow();
  });

  it('throws when the top-level schema is violated (missing occurredAt)', () => {
    const raw = { id: BASE.id, name: 'identity.user.deleted.v1', payload: { userId: '00000000-0000-0000-0000-000000000003' } };
    expect(() => parseEvent(raw)).toThrow();
  });
});
