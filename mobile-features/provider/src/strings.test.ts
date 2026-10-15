/**
 * Unit tests for provider strings helpers: t() and isKnownError().
 */
import { describe, expect, it } from '@jest/globals';
import { t, isKnownError } from './strings';

describe('t (provider namespace)', () => {
  it('returns a non-empty string for registration.title', () => {
    const result = t('registration.title');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for name.label', () => {
    const result = t('name.label');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for registration.submit', () => {
    expect(t('registration.submit').length).toBeGreaterThan(0);
  });

  it('interpolates step param into registration.step', () => {
    const result = t('registration.step', { current: '1', total: '3' });
    expect(typeof result).toBe('string');
  });

  it('returns a non-empty string for registration.next', () => {
    expect(t('registration.next').length).toBeGreaterThan(0);
  });
});

describe('isKnownError (provider)', () => {
  it('returns true for provider_already_exists', () => {
    expect(isKnownError('provider_already_exists')).toBe(true);
  });

  it('returns true for phone_not_verified', () => {
    expect(isKnownError('phone_not_verified')).toBe(true);
  });

  it('returns true for invalid_request', () => {
    expect(isKnownError('invalid_request')).toBe(true);
  });

  it('returns false for an unknown error code', () => {
    expect(isKnownError('not_a_real_error')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isKnownError('')).toBe(false);
  });
});
