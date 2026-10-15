import { describe, expect, it } from 'vitest';
import { sanitize, sanitizeContent, sanitizeDisplayName } from './sanitize';

describe('sanitize', () => {
  it('passes plain text through unchanged', () => {
    expect(sanitize('Hello world')).toBe('Hello world');
  });

  it('strips HTML tags', () => {
    expect(sanitize('<b>bold</b>')).toBe('bold');
    expect(sanitize('<script>alert(1)</script>')).toBe('');
    expect(sanitize('<img src=x onerror=alert(1)>')).toBe('');
  });

  it('strips script blocks with content', () => {
    expect(sanitize('<script>alert("xss")</script>text')).toBe('text');
    expect(sanitize('<style>body{color:red}</style>text')).toBe('text');
  });

  it('decodes HTML entities', () => {
    expect(sanitize('a &amp; b')).toBe('a & b');
    expect(sanitize('&lt;tag&gt;')).toBe('<tag>');
    expect(sanitize('&quot;quoted&quot;')).toBe('"quoted"');
  });

  it('handles nested tags', () => {
    expect(sanitize('<div><span>text</span></div>')).toBe('text');
  });

  it('trims whitespace', () => {
    expect(sanitize('  hello  ')).toBe('hello');
  });
});

describe('sanitizeDisplayName', () => {
  it('truncates to 100 chars', () => {
    expect(sanitizeDisplayName('a'.repeat(200))).toHaveLength(100);
  });

  it('strips HTML from display names', () => {
    expect(sanitizeDisplayName('<b>Alice</b>')).toBe('Alice');
  });
});

describe('sanitizeContent', () => {
  it('truncates to 2000 chars', () => {
    expect(sanitizeContent('x'.repeat(3000))).toHaveLength(2000);
  });
});
