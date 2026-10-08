// Writes <out>/<Glyphs.fontstack>/<start>-<end>.pbf for every 256-codepoint range of the BMP, built with fontnik from the
// registered Noto Sans Arabic font (ADR-0008). The fontstack and the required ranges come from the contracts' JSON export
// (schemas/glyphs.json). The PBFs are a Modified Version of the font under OFL 1.1, so the licence goes with them as
// <out>/<fontstack>/OFL.txt.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { argv } from 'node:process';
import { URL } from 'node:url';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const fontnik = require('fontnik');
const { fontstack, requiredRanges } = JSON.parse(readFileSync(new URL('../../../packages/contracts/schemas/glyphs.json', import.meta.url), 'utf8'));
const font = readFileSync(require.resolve('@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf'));
const [face] = await promisify(fontnik.load)(font);
if (`${face.family_name} ${face.style_name}` !== fontstack) throw new Error(`the font is "${face.family_name} ${face.style_name}", not the Glyphs.fontstack "${fontstack}"`);
const dir = join(argv[2], fontstack);
mkdirSync(dir, { recursive: true });
copyFileSync(require.resolve('@expo-google-fonts/noto-sans-arabic/LICENSE_FONT'), join(dir, 'OFL.txt'));
const written = new Set();
for (let start = 0; start < 65536; start += 256) {
  const range = `${start}-${start + 255}`;
  writeFileSync(join(dir, `${range}.pbf`), await promisify(fontnik.range)({ font, start, end: start + 255 }));
  written.add(range);
}
const missing = requiredRanges.filter((r) => !written.has(r));
if (missing.length) throw new Error(`Glyphs.requiredRanges not on 256-codepoint boundaries: ${missing.join(', ')}`);
