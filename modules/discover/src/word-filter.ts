/**
 * Content moderation: blocked-word filter.
 * Words are loaded from a config file path provided at construction time,
 * so nothing is hard-coded here and no secret lives in the repo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class WordFilter {
  private readonly blocked: Set<string>;

  constructor(configPath?: string) {
    const path = configPath ?? join(process.cwd(), 'config', 'blocked-words.txt');
    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch {
      // File not present → empty list (safe default for tests / fresh envs).
      raw = '';
    }
    this.blocked = new Set(
      raw
        .split(/\r?\n/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 0 && !w.startsWith('#')),
    );
  }

  /** Returns the first blocked word found in `text`, or null if clean. */
  check(text: string): string | null {
    const lower = text.toLowerCase();
    for (const word of this.blocked) {
      // whole-word boundary check using a simple regex
      const pattern = new RegExp(`(?<![\\w])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'u');
      if (pattern.test(lower)) return word;
    }
    return null;
  }
}
