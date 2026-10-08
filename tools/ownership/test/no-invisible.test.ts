import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { checkedPath, invisibleChars } from '../src/no-invisible.ts';

const cli = new URL('../src/no-invisible.ts', import.meta.url).pathname;
// Built from code points so this file itself stays free of raw invisible characters.
const [BOM, RLM, LRI, ARABIC_NUMBER_SIGN] = [0xfeff, 0x200f, 0x2066, 0x0600].map((c) => String.fromCodePoint(c));

it('reports Cf characters by position and code point, except a leading BOM', () => {
  expect(invisibleChars(`${BOM}const a = 1;\nconst b = '${RLM}x';\n`)).toEqual(['2:12 U+200F']);
  expect(invisibleChars(`x${BOM}`)).toEqual(['1:2 U+FEFF']);
  expect(invisibleChars('const label = "خرائط";\n')).toEqual([]);
});

it('checks code files, not locale catalogs or Markdown', () => {
  expect(['a.ts', 'b.tsx', 'c.py', 'd.sql', 'e.yml', 'f.json', 'g.java', 'h.sh', 'i.cjs'].every(checkedPath)).toBe(true);
  expect(['src/i18n/ar.json', 'packages/i18n/src/locales/ckb.json', 'docs/x.md', 'a.png'].some(checkedPath)).toBe(false);
});

it('CLI fails on a fixture repo with a raw bidi mark in code and passes the exempt files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'invisible-'));
  mkdirSync(join(dir, 'src/i18n'), { recursive: true });
  writeFileSync(join(dir, 'ok.ts'), `${BOM}export const ok = 1;\n`);
  writeFileSync(join(dir, 'src/i18n/ar.json'), `{ "phone": "${LRI}+964${RLM}" }\n`);
  writeFileSync(join(dir, 'README.md'), `${RLM}\n`);
  writeFileSync(join(dir, 'metrics.py'), `ARABIC = '${ARABIC_NUMBER_SIGN}'\n`);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const run = () => spawnSync(process.execPath, [cli], { cwd: dir, encoding: 'utf8' });

  const failed = run();
  expect(failed.status).toBe(1);
  expect(failed.stderr.trim().split('\n')).toEqual(['invisible: metrics.py:1:11 U+0600']);
  writeFileSync(join(dir, 'metrics.py'), "ARABIC = '\\u0600'\n");
  expect(run().status).toBe(0);
});
