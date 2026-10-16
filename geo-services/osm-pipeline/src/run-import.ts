#!/usr/bin/env node
/**
 * OSM places import runner.
 *
 * Usage:
 *   node run-import.js --city baghdad --input /abs/iraq-latest.osm.json [--dry-run]
 *   node run-import.js --city all     --input /abs/iraq-latest.osm.json
 *   node run-import.js --city erbil,mosul --input ... --dry-run
 *
 * Flags:
 *   --city <name|all>   City id (matching geo-services/pipeline/cities/<id>.yaml)
 *                       or "all" for baghdad|erbil|basra|mosul, or comma-separated list.
 *   --input <path>      Path to the Overpass JSON file (or NDJSON if --ndjson).
 *   --output <dir>      Directory for output NDJSON (default: current directory).
 *   --dry-run           Parse and validate only; do not write output files.
 *   --ndjson            Input is already NDJSON (one element per line) rather than
 *                       a full Overpass JSON response.
 *   --limit <n>         Stop after n records (for quick sampling).
 *   --checkpoint        Write/resume a checkpoint file so a crashed run can be resumed.
 *   --all-categories    Skip the city's category allowlist; emit every recognized category.
 *   --no-areas          Skip area records (suburbs / admin boundaries).
 *   --no-streets        Skip street records.
 *
 * ODbL attribution (always shown):
 *   Map data © OpenStreetMap contributors
 *
 * @module run-import
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';

import {
  parseOsmJson,
  parseOsmNdjson,
  writeOsmNdjson,
  type OsmPlaceRecord,
  type ImportOptions,
} from './import-places.js';
import {
  buildAllowedSet,
} from './tag-mapper.js';
import {
  newImportStats,
  formatStats,
  IRAQ_BBOX,
  type ImportStats,
  type BBox,
} from './validators.js';

// ---------------------------------------------------------------------------
// Known cities
// ---------------------------------------------------------------------------

interface CityConfig {
  id: string;
  names: { ar: string; ckb?: string; en: string };
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  categories: string[];
}

const KNOWN_CITIES: Record<string, CityConfig> = {
  baghdad: {
    id: 'baghdad',
    names: { ar: 'بغداد', ckb: 'بەغدا', en: 'Baghdad' },
    bbox: [44.22, 33.20, 44.55, 33.45],
    categories: [
      'food', 'cafe', 'lodging', 'shopping', 'tourism', 'health',
      'finance', 'fuel', 'office', 'worship', 'education', 'government',
      'transport', 'entertainment',
    ],
  },
  erbil: {
    id: 'erbil',
    names: { ar: 'أربيل', ckb: 'ھەولێر', en: 'Erbil' },
    bbox: [43.95, 36.10, 44.10, 36.24],
    categories: [
      'food', 'cafe', 'lodging', 'shopping', 'tourism', 'health',
      'finance', 'fuel', 'office', 'worship', 'education', 'government',
      'transport', 'entertainment',
    ],
  },
  basra: {
    id: 'basra',
    names: { ar: 'البصرة', en: 'Basra' },
    bbox: [47.72, 30.47, 47.90, 30.61],
    categories: [
      'food', 'cafe', 'lodging', 'shopping', 'tourism', 'health',
      'finance', 'fuel', 'office', 'worship', 'education', 'government',
      'transport', 'entertainment',
    ],
  },
  mosul: {
    id: 'mosul',
    names: { ar: 'الموصل', en: 'Mosul' },
    bbox: [43.08, 36.29, 43.22, 36.40],
    categories: [
      'food', 'cafe', 'lodging', 'shopping', 'tourism', 'health',
      'finance', 'fuel', 'office', 'worship', 'education', 'government',
      'transport', 'entertainment',
    ],
  },
};

const ALL_CITIES = Object.keys(KNOWN_CITIES);

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------

interface Checkpoint {
  version: 1;
  cityId: string;
  inputPath: string;
  processedCount: number;
  outputPath: string;
  completedAt?: string;
}

function checkpointPath(outputDir: string, cityId: string): string {
  return join(outputDir, `.osm-import-checkpoint-${cityId}.json`);
}

async function loadCheckpoint(path: string): Promise<Checkpoint | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Checkpoint;
  } catch {
    return null;
  }
}

async function saveCheckpoint(path: string, cp: Checkpoint): Promise<void> {
  await writeFile(path, JSON.stringify(cp, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

class ProgressBar {
  private total: number;
  private current = 0;
  private label: string;
  private width = 40;

  constructor(total: number, label: string) {
    this.total = total;
    this.label = label;
  }

  update(n: number): void {
    this.current = Math.min(n, this.total);
    this.render();
  }

  increment(): void {
    this.update(this.current + 1);
  }

  private render(): void {
    const pct = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(pct * this.width);
    const bar = '█'.repeat(filled) + '░'.repeat(this.width - filled);
    const pctStr = (pct * 100).toFixed(1).padStart(5);
    process.stderr.write(`\r${this.label} [${bar}] ${pctStr}% (${this.current}/${this.total})`);
  }

  done(): void {
    this.update(this.total);
    process.stderr.write('\n');
  }
}

// ---------------------------------------------------------------------------
// Per-city import
// ---------------------------------------------------------------------------

async function importCity(
  cityConfig: CityConfig,
  inputPath: string,
  outputDir: string,
  opts: {
    dryRun: boolean;
    ndjson: boolean;
    limit?: number;
    useCheckpoint: boolean;
    allCategories: boolean;
    includeAreas: boolean;
    includeStreets: boolean;
    observedAt: string;
  },
): Promise<{ city: string; stats: ImportStats; outputPath: string | null }> {
  const cpPath = checkpointPath(outputDir, cityConfig.id);
  const outputPath = join(outputDir, `${cityConfig.id}-places.ndjson`);

  // Resume from checkpoint?
  if (opts.useCheckpoint) {
    const cp = await loadCheckpoint(cpPath);
    if (cp?.completedAt) {
      console.log(`  [${cityConfig.id}] Already completed (checkpoint: ${cp.completedAt}). Skipping.`);
      const stats = newImportStats();
      return { city: cityConfig.id, stats, outputPath: cp.outputPath };
    }
  }

  const cityBBox: BBox = { coords: cityConfig.bbox };
  const allowedCategories = opts.allCategories
    ? null
    : buildAllowedSet(cityConfig.categories);

  const importOpts: ImportOptions = {
    observedAt: opts.observedAt,
    cityBBox,
    allowedCategories,
    includeAreas: opts.includeAreas,
    includeStreets: opts.includeStreets,
    limit: opts.limit,
  };

  const stats = newImportStats();
  let records: OsmPlaceRecord[];

  console.log(`  Parsing ${opts.ndjson ? 'NDJSON' : 'JSON'} for ${cityConfig.names.en ?? cityConfig.id}…`);

  if (opts.ndjson) {
    records = await parseOsmNdjson(inputPath, importOpts, stats);
  } else {
    const raw = JSON.parse(await readFile(inputPath, 'utf8')) as { elements: unknown[] };
    // Validate it looks like an Overpass response
    if (!Array.isArray(raw.elements)) {
      throw new Error(`Input file does not look like an Overpass JSON response: missing .elements array`);
    }
    records = parseOsmJson(raw as { elements: never[] }, importOpts, stats);
  }

  const bar = new ProgressBar(stats.totalProcessed || records.length, `  Writing ${cityConfig.id}`);

  if (!opts.dryRun) {
    await mkdir(outputDir, { recursive: true });
    await writeOsmNdjson(records, outputPath);
    bar.done();

    if (opts.useCheckpoint) {
      await saveCheckpoint(cpPath, {
        version: 1,
        cityId: cityConfig.id,
        inputPath,
        processedCount: stats.totalProcessed,
        outputPath,
        completedAt: new Date().toISOString(),
      });
    }

    return { city: cityConfig.id, stats, outputPath };
  }

  bar.done();
  return { city: cityConfig.id, stats, outputPath: null };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      city:            { type: 'string',  default: 'all' },
      input:           { type: 'string' },
      output:          { type: 'string',  default: '.' },
      'dry-run':       { type: 'boolean', default: false },
      ndjson:          { type: 'boolean', default: false },
      limit:           { type: 'string' },
      checkpoint:      { type: 'boolean', default: false },
      'all-categories':{ type: 'boolean', default: false },
      'no-areas':      { type: 'boolean', default: false },
      'no-streets':    { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (!values.input) {
    console.error('Error: --input <path> is required');
    process.exit(2);
  }

  const inputPath = resolve(values.input);
  try {
    await access(inputPath);
  } catch {
    console.error(`Error: input file not found: ${inputPath}`);
    process.exit(2);
  }

  const outputDir = resolve(values.output ?? '.');
  const dryRun = values['dry-run'] ?? false;

  // Resolve city list
  const cityArg = values.city ?? 'all';
  let cityIds: string[];
  if (cityArg === 'all') {
    cityIds = ALL_CITIES;
  } else {
    cityIds = cityArg.split(',').map((c) => c.trim()).filter(Boolean);
    for (const id of cityIds) {
      if (!KNOWN_CITIES[id]) {
        console.error(`Error: unknown city "${id}". Known cities: ${ALL_CITIES.join(', ')}`);
        process.exit(2);
      }
    }
  }

  const observedAt = new Date().toISOString();

  console.log('OSM Places Import Pipeline');
  console.log('Attribution: Map data © OpenStreetMap contributors (ODbL 1.0)');
  console.log('');
  console.log(`Input:        ${inputPath}`);
  console.log(`Output dir:   ${outputDir}`);
  console.log(`Cities:       ${cityIds.join(', ')}`);
  console.log(`Dry run:      ${dryRun}`);
  console.log(`Checkpoint:   ${values.checkpoint}`);
  console.log(`Observed at:  ${observedAt}`);
  console.log('');

  const results: Array<{
    city: string;
    stats: ImportStats;
    outputPath: string | null;
  }> = [];

  for (const cityId of cityIds) {
    const cityConfig = KNOWN_CITIES[cityId];
    console.log(`City: ${cityConfig.names.en ?? cityId} (${cityId})`);
    console.log(`  BBox: lon ${cityConfig.bbox[0]}–${cityConfig.bbox[2]}, lat ${cityConfig.bbox[1]}–${cityConfig.bbox[3]}`);

    try {
      const result = await importCity(cityConfig, inputPath, outputDir, {
        dryRun,
        ndjson: values.ndjson ?? false,
        limit: values.limit ? parseInt(values.limit, 10) : undefined,
        useCheckpoint: values.checkpoint ?? false,
        allCategories: values['all-categories'] ?? false,
        includeAreas: !(values['no-areas'] ?? false),
        includeStreets: !(values['no-streets'] ?? false),
        observedAt,
      });
      results.push(result);

      console.log(`  Output: ${result.outputPath ?? '(dry run)'}`);
      console.log(formatStats(result.stats));
      console.log('');
    } catch (err) {
      console.error(`  ERROR processing ${cityId}:`, err instanceof Error ? err.message : err);
      console.log('');
    }
  }

  // Summary table
  console.log('=== Summary ===');
  let totalProcessed = 0, totalImported = 0, totalSkipped = 0, totalErrors = 0;
  for (const r of results) {
    const s = r.stats;
    console.log(`  ${r.city.padEnd(12)} processed=${s.totalProcessed} imported=${s.imported} skipped=${s.skipped} errors=${s.errors}`);
    totalProcessed += s.totalProcessed;
    totalImported += s.imported;
    totalSkipped += s.skipped;
    totalErrors += s.errors;
  }
  console.log('  ' + '-'.repeat(60));
  console.log(`  ${'TOTAL'.padEnd(12)} processed=${totalProcessed} imported=${totalImported} skipped=${totalSkipped} errors=${totalErrors}`);
  console.log('');
  console.log('Attribution: Map data © OpenStreetMap contributors (ODbL 1.0)');

  if (totalErrors > 0) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Run when called directly
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
