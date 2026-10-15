import { describe, it, expect, beforeEach } from 'vitest';
import { WordFilter } from './word-filter.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('WordFilter', () => {
  let tmpDir: string;
  let wordsPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `word-filter-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    wordsPath = join(tmpDir, 'blocked-words.txt');
    writeFileSync(wordsPath, '# test words\nspam\nscam\n');
  });

  it('returns null for clean text', () => {
    const filter = new WordFilter(wordsPath);
    expect(filter.check('Hello world this is a great post')).toBeNull();
  });

  it('detects blocked words case-insensitively', () => {
    const filter = new WordFilter(wordsPath);
    expect(filter.check('This is a SPAM message')).toBe('spam');
  });

  it('detects blocked word in mixed context', () => {
    const filter = new WordFilter(wordsPath);
    expect(filter.check('buy now scam offer')).toBe('scam');
  });

  it('returns null when config file is missing', () => {
    const filter = new WordFilter('/nonexistent/path/blocked-words.txt');
    expect(filter.check('anything goes here')).toBeNull();
  });
});
