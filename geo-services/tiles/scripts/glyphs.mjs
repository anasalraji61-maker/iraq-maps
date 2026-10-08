// Writes <out>/<family> <style>/<start>-<end>.pbf for every 256-codepoint range of the BMP, built with fontnik from the
// registered Noto Sans Arabic font (ADR-0008). The fontstack name comes from the font, so it is "Noto Sans Arabic Regular".
// The PBFs are a Modified Version of the font under OFL 1.1, so the licence goes with them as <out>/<fontstack>/OFL.txt.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { argv } from 'node:process';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const fontnik = require('fontnik');
const font = readFileSync(require.resolve('@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf'));
const [face] = await promisify(fontnik.load)(font);
const dir = join(argv[2], `${face.family_name} ${face.style_name}`);
mkdirSync(dir, { recursive: true });
copyFileSync(require.resolve('@expo-google-fonts/noto-sans-arabic/LICENSE_FONT'), join(dir, 'OFL.txt'));
for (let start = 0; start < 65536; start += 256) {
  const end = start + 255;
  writeFileSync(join(dir, `${start}-${end}.pbf`), await promisify(fontnik.range)({ font, start, end }));
}
