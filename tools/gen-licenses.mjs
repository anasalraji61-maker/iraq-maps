#!/usr/bin/env node
/**
 * Generates mobile-features/account/src/licenses.generated.json
 * from `pnpm licenses list --prod --json`.
 *
 * Run: node tools/gen-licenses.mjs
 *
 * The output is checked into the repo so the app can display it without
 * running pnpm at app startup. Re-run when dependencies change.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const raw = execSync(
  'pnpm licenses list --prod --json --filter "@iraq-maps/mobile..."',
  { cwd: root, encoding: 'utf8' },
);

/** @type {Record<string, Array<{name:string, versions:string[], homepage?:string}>>} */
const byLicense = JSON.parse(raw);

// Packages to always show individually (high-visibility OSS)
const NOTABLE = new Set([
  'react',
  'react-native',
  'expo',
  '@maplibre/maplibre-react-native',
  'maplibre-gl',
  '@sentry/react-native',
  'typescript',
  'zod',
  'drizzle-orm',
  'nestjs',
  '@nestjs/core',
]);

const entries = [];

for (const [license, packages] of Object.entries(byLicense)) {
  for (const pkg of packages) {
    // Always include notable packages or non-MIT licenses
    if (license !== 'MIT' || NOTABLE.has(pkg.name)) {
      entries.push({
        name: pkg.name,
        version: pkg.versions?.[0] ?? '',
        license,
        url: pkg.homepage ?? '',
      });
    }
  }
}

// Add a summary row for the MIT bulk
const mitCount = (byLicense['MIT'] ?? []).length;
entries.unshift({
  name: `MIT packages (${mitCount} total)`,
  version: '',
  license: 'MIT',
  url: 'https://opensource.org/license/mit',
  summary: true,
});

// Add OpenStreetMap data attribution (not a npm package)
entries.push({
  name: 'OpenStreetMap contributors',
  version: '',
  license: 'ODbL-1.0',
  url: 'https://www.openstreetmap.org/copyright',
});

entries.sort((a, b) => {
  // summary rows first, then alphabetical
  if (a.summary) return -1;
  if (b.summary) return 1;
  return a.name.localeCompare(b.name);
});

const outPath = resolve(root, 'mobile-features/account/src/licenses.generated.json');
writeFileSync(outPath, JSON.stringify(entries, null, 2) + '\n');

console.log(`Wrote ${entries.length} entries to ${outPath}`);
