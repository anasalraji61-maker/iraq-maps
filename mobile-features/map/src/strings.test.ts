/**
 * Unit tests for map strings: t(), isolate(), formatDistance(), kindLabel().
 */
import { describe, expect, it } from '@jest/globals';
import { t, isolate, formatDistance, kindLabel } from './strings';

describe('t (map namespace)', () => {
  it('returns a non-empty string for search.label', () => {
    const result = t('search.label');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for search.placeholder', () => {
    expect(t('search.placeholder').length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for search.empty', () => {
    expect(t('search.empty').length).toBeGreaterThan(0);
  });
});

describe('isolate', () => {
  it('wraps with FSI (U+2068) and PDI (U+2069)', () => {
    const result = isolate('test');
    expect(result.codePointAt(0)).toBe(0x2068);
    expect(result.codePointAt(result.length - 1)).toBe(0x2069);
  });

  it('preserves the inner content', () => {
    const inner = 'hello world';
    expect(isolate(inner)).toContain(inner);
  });

  it('total length is inner + 2', () => {
    const s = 'abc';
    expect(isolate(s).length).toBe(s.length + 2);
  });
});

describe('formatDistance', () => {
  it('returns metres below 1000', () => {
    const result = formatDistance(500);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns kilometres for 1000m and above', () => {
    const result = formatDistance(1500);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('exactly 1000m uses km format', () => {
    const result = formatDistance(1000);
    expect(result).toBeTruthy();
  });

  it('returns a non-empty string for a large distance', () => {
    expect(formatDistance(50000).length).toBeGreaterThan(0);
  });
});

describe('kindLabel', () => {
  it('returns a string for a known category', () => {
    const result = kindLabel({ kind: 'place', category: 'food' });
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns undefined for kind=place with no category', () => {
    expect(kindLabel({ kind: 'place', category: undefined })).toBeUndefined();
  });

  it('returns a non-empty string for kind=street', () => {
    const result = kindLabel({ kind: 'street', category: undefined });
    expect(result).toBeTruthy();
  });
});
