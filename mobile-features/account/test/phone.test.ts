import { describe, expect, it } from '@jest/globals';
import { normalizeIraqiPhone } from '../src/phone';

describe('normalizeIraqiPhone', () => {
  it.each([
    '07701234567',
    '+9647701234567',
    '009647701234567',
    '0770 123 4567',
    '0770-123-4567',
    '٠٧٧٠١٢٣٤٥٦٧',
    '۰۷۷۰۱۲۳۴۵۶۷',
    '‏+964 770 123 4567‎',
  ])('normalizes %j to +9647701234567', (input) => {
    expect(normalizeIraqiPhone(input)).toBe('+9647701234567');
  });

  it.each(['', '0770123456', '077012345678', '06701234567', '+9646701234567', '+17701234567', '0770abc4567'])('rejects %j', (input) => {
    expect(normalizeIraqiPhone(input)).toBeNull();
  });
});
