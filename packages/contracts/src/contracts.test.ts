import { describe, expect, it } from 'vitest';
import { IraqiPhone, estimate, parseEvent } from './index';
import { z } from 'zod';

describe('contracts', () => {
  it('accepts only E.164 Iraqi mobiles', () => {
    expect(IraqiPhone.safeParse('+9647701234567').success).toBe(true);
    expect(IraqiPhone.safeParse('07701234567').success).toBe(false);
  });

  it('Estimate requires source, observedAt and confidence', () => {
    const s = estimate(z.number());
    expect(s.safeParse({ value: 1 }).success).toBe(false);
    expect(s.safeParse({ value: 1, source: 'provider', observedAt: '2026-01-01T00:00:00Z', confidence: 0.5 }).success).toBe(true);
  });

  it('parses versioned events and rejects unknown ones', () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const e = { id: '00000000-0000-4000-8000-000000000002', name: 'identity.user.deleted.v1', occurredAt: '2026-01-01T00:00:00Z', payload: { userId } };
    expect(parseEvent(e).payload).toEqual({ userId });
    expect(() => parseEvent({ ...e, name: 'x.y.z.v1' })).toThrow();
  });
});
