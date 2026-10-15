/**
 * Unit tests for normalizeIraqiPhone and isolateLtr.
 */
import { describe, expect, it } from '@jest/globals';
import { normalizeIraqiPhone, isolateLtr } from './phone';

describe('normalizeIraqiPhone', () => {
  it('normalizes 07xx number to +964 prefix', () => {
    expect(normalizeIraqiPhone('07801234567')).toBe('+96478 01234567'.replace(/\s/g, ''));
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

  it('returns null for a non-Iraqi number', () => {
    expect(normalizeIraqiPhone('+12025551234')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeIraqiPhone('')).toBeNull();
  });

  it('returns null for short number', () => {
    expect(normalizeIraqiPhone('0780123')).toBeNull();
  });

  it('returns null for landline starting with 06', () => {
    expect(normalizeIraqiPhone('06701234567')).toBeNull();
  });

  it('strips bidi control characters', () => {
    // LRO + number + PDF
    expect(normalizeIraqiPhone('‪07801234567‬')).toBe('+9647801234567');
  });
});

describe('isolateLtr', () => {
  it('wraps string with LRI and PDI', () => {
    const result = isolateLtr('+9647801234567');
    expect(result.startsWith('⁦')).toBe(true);
    expect(result.endsWith('⁩')).toBe(true);
  });

  it('preserves the inner content', () => {
    const phone = '+9647801234567';
    const result = isolateLtr(phone);
    expect(result).toContain(phone);
  });

  it('wraps empty string too', () => {
    const result = isolateLtr('');
    expect(result).toBe('⁦⁩');
  });
});
