/**
 * Unit tests for OTP helpers: ipBucket (pure), RESEND_AFTER_SEC constant.
 */
import { describe, expect, it } from 'vitest';
import { ipBucket, RESEND_AFTER_SEC } from './otp';

describe('RESEND_AFTER_SEC', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(RESEND_AFTER_SEC)).toBe(true);
    expect(RESEND_AFTER_SEC).toBeGreaterThan(0);
  });

  it('is at least 30 seconds (prevent spam)', () => {
    expect(RESEND_AFTER_SEC).toBeGreaterThanOrEqual(30);
  });
});

describe('ipBucket', () => {
  it('returns the same string for a plain IPv4 address', () => {
    const bucket = ipBucket('1.2.3.4');
    expect(bucket).toBe('1.2.3.4');
  });

  it('IPv4-mapped IPv6 normalises to IPv4', () => {
    const bucket = ipBucket('::ffff:1.2.3.4');
    expect(bucket).toBe('1.2.3.4');
  });

  it('returns /64 bucket for a full IPv6 address', () => {
    const bucket = ipBucket('2001:db8:85a3:0000:1234:5678:9abc:def0');
    expect(bucket).toBe('2001:db8:85a3:0::/64');
  });

  it('two IPv6 addresses in the same /64 map to the same bucket', () => {
    const a = ipBucket('2001:db8::1');
    const b = ipBucket('2001:db8::2');
    expect(a).toBe(b);
  });

  it('two IPv6 addresses in different /64s map to different buckets', () => {
    const a = ipBucket('2001:db8:1::1');
    const b = ipBucket('2001:db8:2::1');
    expect(a).not.toBe(b);
  });

  it('handles loopback ::1', () => {
    const bucket = ipBucket('::1');
    // ::1 is IPv4-mapped-like — processed as IPv6 /64
    expect(typeof bucket).toBe('string');
    expect(bucket.length).toBeGreaterThan(0);
  });

  it('handles IPv4 loopback 127.0.0.1', () => {
    expect(ipBucket('127.0.0.1')).toBe('127.0.0.1');
  });
});
