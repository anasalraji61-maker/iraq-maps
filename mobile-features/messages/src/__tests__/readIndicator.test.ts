/**
 * Tests for the read-indicator helpers in InquiriesListScreen.
 * We test the logic in isolation by duplicating the pure helpers
 * (topStatus and STATUS_RANK) since they're not exported.
 */
import { describe, expect, it } from '@jest/globals';
import type { MessageStatus } from '@iraq-maps/contracts';

// Mirror of the STATUS_RANK constant in InquiriesListScreen.tsx
const STATUS_RANK: Record<MessageStatus, number> = {
  read: 6,
  delivered: 5,
  replied: 4,
  sent: 3,
  handed_off: 2,
  queued: 1,
  failed: 0,
};

type TargetLike = { status: MessageStatus };

function topStatus(targets: TargetLike[]): MessageStatus | null {
  if (targets.length === 0) return null;
  return targets.reduce<MessageStatus>((best, tgt) => {
    return (STATUS_RANK[tgt.status] ?? 0) > (STATUS_RANK[best] ?? 0) ? tgt.status : best;
  }, targets[0]!.status);
}

describe('topStatus', () => {
  it('returns null for empty targets', () => {
    expect(topStatus([])).toBeNull();
  });

  it('returns the single target status', () => {
    expect(topStatus([{ status: 'sent' }])).toBe('sent');
  });

  it('returns "read" when one of many targets is read', () => {
    expect(topStatus([{ status: 'queued' }, { status: 'read' }, { status: 'sent' }])).toBe('read');
  });

  it('returns "delivered" over "sent"', () => {
    expect(topStatus([{ status: 'sent' }, { status: 'delivered' }])).toBe('delivered');
  });

  it('returns "delivered" over "replied" (delivery status takes priority)', () => {
    expect(topStatus([{ status: 'delivered' }, { status: 'replied' }])).toBe('delivered');
  });
});

describe('STATUS_RANK ordering', () => {
  it('read > delivered > replied > sent > handed_off > queued > failed', () => {
    const ordered: MessageStatus[] = ['read', 'delivered', 'replied', 'sent', 'handed_off', 'queued', 'failed'];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(STATUS_RANK[ordered[i]!]).toBeGreaterThan(STATUS_RANK[ordered[i + 1]!]!);
    }
  });
});
