/**
 * Unit tests for crypto helpers: mac, encrypt/decrypt, randomCode.
 */
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, mac, randomCode } from './crypto';

describe('mac', () => {
  it('produces a 64-char hex string', () => {
    const result = mac('key', 'data');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same key+data', () => {
    expect(mac('k', 'hello')).toBe(mac('k', 'hello'));
  });

  it('differs for different keys', () => {
    expect(mac('key1', 'data')).not.toBe(mac('key2', 'data'));
  });

  it('differs for different data', () => {
    expect(mac('key', 'data1')).not.toBe(mac('key', 'data2'));
  });

  it('handles empty strings', () => {
    const result = mac('', '');
    expect(result).toHaveLength(64);
  });
});

describe('encrypt / decrypt', () => {
  const key = Buffer.alloc(32, 0x42); // 32-byte key

  it('round-trips a plain string', () => {
    const plain = 'Hello, بغداد!';
    const ciphertext = encrypt(key, plain);
    expect(decrypt(key, ciphertext)).toBe(plain);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const plain = 'same input';
    expect(encrypt(key, plain)).not.toBe(encrypt(key, plain));
  });

  it('decrypted output matches original for empty string', () => {
    expect(decrypt(key, encrypt(key, ''))).toBe('');
  });

  it('throws on tampered ciphertext', () => {
    const ct = encrypt(key, 'secret');
    const raw = Buffer.from(ct, 'base64');
    // Layout: 12 bytes IV | 16 bytes auth tag | ciphertext.
    // Flip a byte in the auth tag (offset 12) so GCM verification fails on decipher.final().
    raw[12]! ^= 0xff;
    expect(() => decrypt(key, raw.toString('base64'))).toThrow();
  });

  it('throws on wrong key', () => {
    const otherKey = Buffer.alloc(32, 0x11);
    const ct = encrypt(key, 'secret');
    expect(() => decrypt(otherKey, ct)).toThrow();
  });
});

describe('randomCode', () => {
  it('returns a 6-digit string', () => {
    const code = randomCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('is zero-padded', () => {
    // Run many times to increase probability of a leading-zero code, but mostly
    // just verify the format holds for all outputs.
    for (let i = 0; i < 20; i++) {
      expect(randomCode()).toHaveLength(6);
    }
  });
});
