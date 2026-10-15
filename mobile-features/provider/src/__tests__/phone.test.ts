import { describe, expect, it } from '@jest/globals';
import { normalizeIraqiPhone, isolateLtr } from '../phone';

describe('normalizeIraqiPhone', () => {
  it('accepts 07xxxxxxxxx format', () => {
    expect(normalizeIraqiPhone('07901234567')).toBe('+9647901234567');
  });

  it('accepts +9647xxxxxxxxx format', () => {
    expect(normalizeIraqiPhone('+9647901234567')).toBe('+9647901234567');
  });

  it('accepts 009647xxxxxxxxx format', () => {
    expect(normalizeIraqiPhone('009647901234567')).toBe('+9647901234567');
  });

  it('strips spaces, hyphens and parentheses', () => {
    expect(normalizeIraqiPhone('0790 123 4567')).toBe('+9647901234567');
    expect(normalizeIraqiPhone('+964-79-012-34567')).toBe('+9647901234567');
    expect(normalizeIraqiPhone('(0790) 123-4567')).toBe('+9647901234567');
  });

  it('converts Arabic-Indic digits', () => {
    expect(normalizeIraqiPhone('٠٧٩٠١٢٣٤٥٦٧')).toBe('+9647901234567');
  });

  it('returns null for invalid formats', () => {
    expect(normalizeIraqiPhone('12345')).toBeNull();
    expect(normalizeIraqiPhone('+12125551234')).toBeNull();
    expect(normalizeIraqiPhone('')).toBeNull();
  });
});

describe('isolateLtr', () => {
  it('wraps string with LRI and PDI isolate chars', () => {
    const result = isolateLtr('+9647901234567');
    expect(result.codePointAt(0)).toBe(0x2066); // LRI
    expect(result.endsWith('⁩')).toBe(true); // PDI
    expect(result).toContain('+9647901234567');
  });
});
