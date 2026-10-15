/**
 * Unit tests for hours utilities: openNow, todayHours, closesAt, fmtMinutes.
 * All times are fixed relative to Iraq local time (UTC+3).
 */
import { describe, expect, it } from '@jest/globals';
import { openNow, todayHours, closesAt, fmtMinutes } from './hours';

// Iraq is UTC+3. A fixed reference: 2026-10-15 (Thursday) 12:00 Iraq time = 09:00 UTC.
// getUTCDay() for 2026-10-15 = 4 (Thursday). In our 0=Mo scheme that's index 3.
const THU_NOON = new Date('2026-10-15T09:00:00Z'); // Thursday 12:00 Iraq
const THU_23 = new Date('2026-10-15T20:00:00Z'); // Thursday 23:00 Iraq
const FRI_02 = new Date('2026-10-15T23:00:00Z'); // Friday 02:00 Iraq (cross-midnight)
// 2026-10-17 (Saturday) 10:00 Iraq = 07:00 UTC
const SAT_10_UTC = new Date('2026-10-17T07:00:00Z');

describe('fmtMinutes', () => {
  it('formats 0 as 00:00', () => expect(fmtMinutes(0)).toBe('00:00'));
  it('formats 60 as 01:00', () => expect(fmtMinutes(60)).toBe('01:00'));
  it('formats 90 as 01:30', () => expect(fmtMinutes(90)).toBe('01:30'));
  it('formats 1439 as 23:59', () => expect(fmtMinutes(1439)).toBe('23:59'));
  it('wraps 1440 to 00:00', () => expect(fmtMinutes(1440)).toBe('00:00'));
});

describe('openNow', () => {
  it('returns true for 24/7', () => {
    expect(openNow('24/7', THU_NOON)).toBe(true);
  });

  it('returns false for a day marked off', () => {
    // Only Thursday declared, marked off
    expect(openNow('Th off', THU_NOON)).toBe(false);
  });

  it('returns true when within a time span', () => {
    expect(openNow('09:00-22:00', THU_NOON)).toBe(true);
  });

  it('returns false before opening time', () => {
    // 07:00 Iraq (04:00 UTC) — before 09:00 opening
    const early = new Date('2026-10-15T04:00:00Z');
    expect(openNow('09:00-22:00', early)).toBe(false);
  });

  it('returns false after closing time', () => {
    // 23:00 Iraq
    expect(openNow('09:00-22:00', THU_23)).toBe(false);
  });

  it('returns true for cross-midnight span (02:00 still in span from previous day)', () => {
    // 22:00-03:00; at FRI 02:00 (span started Thursday)
    expect(openNow('22:00-03:00', FRI_02)).toBe(true);
  });

  it('returns null for unsupported format (PH)', () => {
    expect(openNow('Mo-Fr 09:00-17:00; PH off', THU_NOON)).toBeNull();
  });

  it('returns null for unknown format', () => {
    expect(openNow('not valid hours', THU_NOON)).toBeNull();
  });

  it('handles Sa-Th range wrapping past Sunday', () => {
    // Saturday is index 5; should be in Sa-Th range
    expect(openNow('Sa-Th 09:00-22:00', SAT_10_UTC)).toBe(true);
  });
});

describe('todayHours', () => {
  it('returns formatted span for today', () => {
    expect(todayHours('09:00-22:00', THU_NOON)).toBe('09:00–22:00');
  });

  it('returns multiple spans separated by comma-space', () => {
    expect(todayHours('09:00-13:00,16:00-22:00', THU_NOON)).toBe('09:00–13:00, 16:00–22:00');
  });

  it('returns null when place is closed today', () => {
    expect(todayHours('Th off', THU_NOON)).toBeNull();
  });

  it('returns null for unsupported format', () => {
    expect(todayHours('by appointment only', THU_NOON)).toBeNull();
  });

  it('handles 24/7', () => {
    expect(todayHours('24/7', THU_NOON)).toBe('00:00–00:00');
  });
});

describe('closesAt', () => {
  it('returns closing time when currently open', () => {
    expect(closesAt('09:00-22:00', THU_NOON)).toBe('22:00');
  });

  it('returns null when not currently open', () => {
    expect(closesAt('09:00-22:00', THU_23)).toBeNull();
  });

  it('returns null for unsupported format', () => {
    expect(closesAt('whenever we feel like it', THU_NOON)).toBeNull();
  });

  it('handles cross-midnight closing from previous day span', () => {
    // 22:00-03:00; at FRI 02:00 we are in the span, closes at 03:00
    expect(closesAt('22:00-03:00', FRI_02)).toBe('03:00');
  });

  it('returns closing time for second span (split hours)', () => {
    // 09:00-13:00,16:00-22:00 at 17:00 Iraq (14:00 UTC)
    const THU_17 = new Date('2026-10-15T14:00:00Z');
    expect(closesAt('09:00-13:00,16:00-22:00', THU_17)).toBe('22:00');
  });
});
