/**
 * Unit tests for provider/phone: normalizeIraqiPhone and isolateLtr.
 * These are identical in shape to account/phone but provider uses a different
 * bidi-strip regex with extra Unicode control code points.
 */
import { describe, expect, it } from '@jest/globals';
import { normalizeIraqiPhone, isolateLtr } from './phone';

describe('normalizeIraqiPhone', () => {
  it('normalizes 07xx number to +964 prefix', () => {
    expect(normalizeIraqiPhone('07801234567')).toBe('+9647801234567');
  });

  it('normalizes +964 prefixed number', () => {
    expect(normalizeIraqiPhone('+9647801234567')).toBe('+9647801234567');
  });

  it('normalizes 00964 prefixed number', () => {
    expect(normalizeIraqiPhone('009647801234567')).toBe('+9647801234567');
  });

  it('strips spaces', () => {
    expect(normalizeIraqiPhone('0780 123 4567')).toBe('+9647801234567');
  });

  it('strips hyphens', () => {
    expect(normalizeIraqiPhone('0780-123-4567')).toBe('+9647801234567');
  });

  it('returns null for non-Iraqi numbers', () => {
    expect(normalizeIraqiPhone('+12025551234')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeIraqiPhone('')).toBeNull();
  });

  it('returns null for too-short number', () => {
    expect(normalizeIraqiPhone('0780123')).toBeNull();
  });

  it('strips LRI and PDI bidi isolate characters', () => {
    // LRI (U+2066) + number + PDI (U+2069)
    expect(normalizeIraqiPhone('⁦07801234567⁩')).toBe('+9647801234567');
  });

  it('strips FSI (U+2068) control character', () => {
    expect(normalizeIraqiPhone('⁨07801234567')).toBe('+9647801234567');
  });
});

describe('isolateLtr', () => {
  it('wraps string with LRI (U+2066) and PDI (U+2069)', () => {
    const result = isolateLtr('+9647801234567');
    expect(result.codePointAt(0)).toBe(0x2066);
    expect(result.codePointAt(result.length - 1)).toBe(0x2069);
  });

  it('preserves the inner content', () => {
    const phone = '+9647801234567';
    const result = isolateLtr(phone);
    expect(result).toContain(phone);
  });

  it('total length is inner + 2', () => {
    const s = 'abc';
    expect(isolateLtr(s).length).toBe(s.length + 2);
  });
});
