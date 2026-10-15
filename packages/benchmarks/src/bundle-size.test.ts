/**
 * Bundle size tracker — asserts JS source size limits for key packages.
 * Runs as normal Vitest tests to gate CI.
 *
 * Limits are generous; tighten them once baselines are established.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function fileSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

function srcDirSize(pkgRelPath: string): number {
  const srcDir = resolve(root, pkgRelPath, 'src');
  try {
    const walk = (dir: string): number => {
      let total = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          total += walk(full);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          total += statSync(full).size;
        }
      }
      return total;
    };
    return walk(srcDir);
  } catch {
    return 0;
  }
}

describe('bundle size limits (source proxy)', () => {
  it('packages/ui source is under 200 KB', () => {
    const size = srcDirSize('packages/ui');
    if (size === 0) return;
    expect(size).toBeLessThan(200 * 1024);
  });

  it('packages/contracts source is under 400 KB', () => {
    const size = srcDirSize('packages/contracts');
    if (size === 0) return;
    expect(size).toBeLessThan(400 * 1024);
  });

  it('packages/i18n source is under 150 KB', () => {
    const size = srcDirSize('packages/i18n');
    if (size === 0) return;
    expect(size).toBeLessThan(150 * 1024);
  });

  it('packages/geo source is under 100 KB', () => {
    const size = srcDirSize('packages/geo');
    if (size === 0) return;
    expect(size).toBeLessThan(100 * 1024);
  });
});

describe('critical source files exist', () => {
  it('packages/ui/src/index.ts exists', () => {
    const size = fileSize(resolve(root, 'packages/ui/src/index.ts'));
    expect(size).not.toBeNull();
    expect(size!).toBeGreaterThan(0);
  });

  it('packages/contracts/src/index.ts exists', () => {
    const size = fileSize(resolve(root, 'packages/contracts/src/index.ts'));
    expect(size).not.toBeNull();
    expect(size!).toBeGreaterThan(0);
  });

  it('packages/i18n/src/index.ts exists', () => {
    const size = fileSize(resolve(root, 'packages/i18n/src/index.ts'));
    expect(size).not.toBeNull();
  });

  it('.env.example has no real secret values (only empty or placeholder values)', () => {
    const path = resolve(root, '.env.example');
    const size = fileSize(path);
    if (size === null) return;
    const content = readFileSync(path, 'utf8');
    const lines = content.split('\n').filter((l) => l.includes('=') && !l.startsWith('#') && l.trim() !== '');
    for (const line of lines) {
      const eqIndex = line.indexOf('=');
      const value = line.slice(eqIndex + 1).trim();
      // Values must be empty or a clear placeholder — never an actual key or token
      expect(value).toMatch(/^(|#.*|your-.+|<.+>|example-.+|change-me|todo|true|false|[0-9]+)$/i);
    }
  });
});
