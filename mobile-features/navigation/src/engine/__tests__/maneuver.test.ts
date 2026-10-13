import { describe, expect, it, test } from '@jest/globals';
import { ManeuverType } from '@iraq-maps/contracts';
import { buildInstruction } from '../maneuver';

const TYPES = ManeuverType.options;
const LOCALES = ['ar', 'ckb', 'en'] as const;
const STREET = 'شارع الرشيد';
const DIST = 250;

describe('buildInstruction', () => {
  test.each(TYPES.flatMap((type) => LOCALES.map((locale) => [type, locale] as const)))(
    '%s × %s returns non-empty string',
    (type, locale) => {
      const result = buildInstruction(type, [STREET], DIST, locale);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    },
  );

  it('falls back gracefully when no street names given', () => {
    const result = buildInstruction('turn', [], 100, 'ar');
    expect(result.length).toBeGreaterThan(0);
  });
});
