/**
 * M177: Unit tests for HoursEditor serialisation helpers.
 */
import { describe, expect, it } from '@jest/globals';
import { slotsToOsm, osmToSlots, defaultSlots } from '../components/HoursEditor';

describe('slotsToOsm', () => {
  it('serialises all-same-time consecutive days to a range', () => {
    const slots = defaultSlots(); // Sa-Th open 09:00-22:00, Fr closed
    expect(slotsToOsm(slots)).toBe('Sa-Th 09:00-22:00');
  });

  it('returns empty string when no days are open', () => {
    const slots = defaultSlots();
    for (let d = 0; d < 7; d++) { (slots as Record<number, { open: boolean; from: string; to: string }>)[d]!.open = false; }
    expect(slotsToOsm(slots)).toBe('');
  });

  it('comma-joins non-consecutive days with same hours', () => {
    const slots = defaultSlots();
    for (let d = 0; d < 7; d++) { (slots as Record<number, { open: boolean; from: string; to: string }>)[d]!.open = false; }
    // Sa=0 and Mo=2 open with same hours
    (slots as Record<number, { open: boolean; from: string; to: string }>)[0]! = { open: true, from: '10:00', to: '18:00' };
    (slots as Record<number, { open: boolean; from: string; to: string }>)[2]! = { open: true, from: '10:00', to: '18:00' };
    expect(slotsToOsm(slots)).toBe('Sa,Mo 10:00-18:00');
  });
});

describe('osmToSlots round-trip', () => {
  it('parses a range rule back to open days', () => {
    const raw = 'Sa-Th 09:00-22:00';
    const slots = osmToSlots(raw);
    for (let d = 0; d <= 5; d++) {
      expect((slots as Record<number, { open: boolean; from: string; to: string }>)[d]!.open).toBe(true);
      expect((slots as Record<number, { open: boolean; from: string; to: string }>)[d]!.from).toBe('09:00');
      expect((slots as Record<number, { open: boolean; from: string; to: string }>)[d]!.to).toBe('22:00');
    }
    expect((slots as Record<number, { open: boolean; from: string; to: string }>)[6]!.open).toBe(false);
  });

  it('handles empty string gracefully', () => {
    const slots = osmToSlots('');
    for (let d = 0; d < 7; d++) {
      expect((slots as Record<number, { open: boolean; from: string; to: string }>)[d]!.open).toBe(false);
    }
  });

  it('round-trips through slotsToOsm → osmToSlots', () => {
    const original = defaultSlots();
    const osm = slotsToOsm(original);
    const parsed = osmToSlots(osm);
    expect(slotsToOsm(parsed)).toBe(osm);
  });
});
