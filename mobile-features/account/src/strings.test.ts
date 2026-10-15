/**
 * Unit tests for account strings helpers: t() and isKnownError().
 */
import { describe, expect, it } from '@jest/globals';
import { t, isKnownError } from './strings';

describe('t (account namespace)', () => {
  it('returns a non-empty string for phone.title', () => {
    const result = t('phone.title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for otp.title', () => {
    const result = t('otp.title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('interpolates params into the string', () => {
    const result = t('otp.resendIn', { time: '30' });
    expect(result).toContain('30');
  });

  it('returns a non-empty string for phone.submit', () => {
    expect(t('phone.submit').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for otp.submit', () => {
    expect(t('otp.submit').length).toBeGreaterThan(0);
  });
});

describe('isKnownError', () => {
  it('returns true for a known error code', () => {
    expect(isKnownError('otp_invalid')).toBe(true);
  });

  it('returns true for otp_expired', () => {
    expect(isKnownError('otp_expired')).toBe(true);
  });

  it('returns false for an unknown error code', () => {
    expect(isKnownError('totally_unknown_error')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isKnownError('')).toBe(false);
  });

  it('returns true for otp_rate_limited', () => {
    expect(isKnownError('otp_rate_limited')).toBe(true);
  });
});
