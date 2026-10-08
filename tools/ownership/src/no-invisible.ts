#!/usr/bin/env node
// Usage: no-invisible. Fails when a tracked or added code file contains an invisible format character (Unicode Cf:
// bidi marks and isolates, zero-width joiners, U+0600...), which a file-writing tool can leave where an escape belonged.
// A BOM at the very start is allowed. Locale catalogs (they carry LRI/PDI/RLM on purpose) and Markdown are exempt.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';

const isChecked = picomatch('**/*.{ts,tsx,js,cjs,mjs,py,sql,yml,yaml,json,java,sh}', { dot: true });
const isExempt = picomatch(['**/i18n/*.json', '**/locales/*.json'], { dot: true });

export const checkedPath = (path: string) => isChecked(path) && !isExempt(path);

/** `line:col U+XXXX` for every Cf character, except a BOM at offset 0. Never echoes the surrounding text. */
export function invisibleChars(text: string): string[] {
  return [...text.matchAll(/\p{Cf}/gu)]
    .filter((m) => !(m.index === 0 && m[0].codePointAt(0) === 0xfeff))
    .map((m) => {
      const before = text.slice(0, m.index).split('\n');
      return `${before.length}:${before.at(-1)!.length + 1} U+${m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(checkedPath);
  const hits = files.flatMap((f) => {
    try {
      return invisibleChars(readFileSync(f, 'utf8')).map((at) => `${f}:${at}`);
    } catch {
      return []; // deleted in the working tree
    }
  });
  for (const hit of hits) console.error(`invisible: ${hit}`);
  console.log(`invisible: ${hits.length ? 'FAILED' : 'ok'} (${files.length} code files)`);
  process.exit(hits.length ? 1 : 0);
}
