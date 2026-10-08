import { describe, expect, it } from '@jest/globals';
import { openNow } from '../src/hours';

// 2026-10-08 is a Thursday; times are Baghdad local (UTC+3), so the result does not depend on the machine's zone.
const at = (day: number, time: string) => new Date(`2026-10-${String(day).padStart(2, '0')}T${time}:00+03:00`);
const THU = 8;
const FRI = 9;

describe('openNow', () => {
  it.each<[string, number, string, boolean]>([
    ['24/7', THU, '03:00', true],
    ['Mo-Su 08:00-22:00', THU, '10:00', true],
    ['Mo-Su 08:00-22:00', THU, '07:59', false],
    ['Mo-Su 08:00-22:00', THU, '22:00', false],
    ['08:00-22:00', FRI, '21:59', true],
    ['Sa-Th 09:00-17:00; Fr off', THU, '10:00', true],
    ['Sa-Th 09:00-17:00; Fr off', FRI, '10:00', false],
    ['Mo-Fr 08:00-12:00,16:00-20:00', THU, '13:00', false],
    ['Mo-Fr 08:00-12:00,16:00-20:00', THU, '17:00', true],
    ['Mo,We,Fr 09:00-17:00', THU, '10:00', false],
    ['Mo,We,Fr 09:00-17:00', FRI, '10:00', true],
    ['Mo-Su 09:00-23:00; Fr 14:00-23:00', FRI, '10:00', false],
    ['Mo-Su 09:00-23:00; Fr 14:00-23:00', FRI, '15:00', true],
    ['Mo-Su 00:00-24:00', THU, '23:59', true],
    // Past midnight: Wednesday's 18:00-02:00 still covers Thursday 01:00, and a Friday off does not end Thursday's night.
    ['18:00-02:00', THU, '01:00', true],
    ['18:00-02:00', THU, '02:00', false],
    ['18:00-02:00', THU, '19:00', true],
    ['Th 20:00-02:00; Fr off', FRI, '01:30', true],
    ['Th 20:00-02:00; Fr off', FRI, '20:30', false],
  ])('%s on day %i at %s is %s', (raw, day, time, open) => {
    expect(openNow(raw, at(day, time))).toBe(open);
  });

  it.each([
    '',
    'PH off',
    'Mo-Fr 08:00-17:00; PH off',
    'Mo-Fr 08:00-17:00, Sa 09:00-12:00',
    'Mo-Fr 08:00-17:00 "by appointment"',
    'Jan-Mar Mo-Fr 08:00-12:00',
    'sunrise-sunset',
    'Mo-Fr 8:00-17:00',
    'Mo-Fr 08:00+',
    'Mo-Fr 25:00-26:00',
    'Mo-Fr 24:00-02:00',
    'Mo-Fr 08:00-17:00 || "on call"',
  ])('cannot tell for %j', (raw) => {
    expect(openNow(raw, at(THU, '10:00'))).toBeNull();
  });
});
