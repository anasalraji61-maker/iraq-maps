/**
 * Locale validation utilities.
 * Run standalone: `npx tsx packages/i18n/src/validate.ts`
 */

import type { Locale } from '@iraq-maps/contracts';
import ar from './locales/ar.json';
import ckb from './locales/ckb.json';
import en from './locales/en.json';

export interface ValidationResult {
  valid: boolean;
  /** Keys present in some locales but missing in others. */
  missing: Record<Locale, string[]>;
  /** Keys present in all locales but with different {param} placeholders. */
  paramMismatches: string[];
  summary: string;
}

type Messages = { [key: string]: string | Messages };
type LocaleMessages = Record<Locale, Messages>;

const LOCALES: Locale[] = ['ar', 'ckb', 'en'];

/** Collect all dot-separated leaf key paths. */
function leafPaths(obj: Messages, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) return leafPaths(value as Messages, path);
    return [path];
  });
}

/** Extract sorted {param} names from a translation string. */
function extractParams(value: string): string[] {
  const matches = value.match(/\{(\w+)\}/g) ?? [];
  return [...new Set(matches)].sort();
}

/** Get a value at a dot-separated path, returns undefined if missing. */
function getPath(obj: Messages, path: string): string | undefined {
  let node: string | Messages | undefined = obj;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Messages)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Validates that all locales share the same key set and the same {param} placeholders
 * for each key.
 */
export function validateLocales(resources: LocaleMessages = { ar, ckb, en }): ValidationResult {
  const pathsByLocale = LOCALES.reduce<Record<Locale, Set<string>>>(
    (acc, locale) => {
      acc[locale] = new Set(leafPaths(resources[locale] ?? {}));
      return acc;
    },
    { ar: new Set(), ckb: new Set(), en: new Set() },
  );

  const allPaths = new Set<string>([...pathsByLocale.ar, ...pathsByLocale.ckb, ...pathsByLocale.en]);

  const missing: Record<Locale, string[]> = { ar: [], ckb: [], en: [] };
  const paramMismatches: string[] = [];

  for (const path of allPaths) {
    // Collect which locales have this path
    for (const locale of LOCALES) {
      if (!pathsByLocale[locale].has(path)) {
        missing[locale].push(path);
      }
    }

    // Check param parity only when all locales have the key
    const presentInAll = LOCALES.every((locale) => pathsByLocale[locale].has(path));
    if (presentInAll) {
      const paramSets = LOCALES.map((locale) => {
        const value = getPath(resources[locale], path) ?? '';
        return extractParams(value).join(',');
      });
      if (new Set(paramSets).size > 1) {
        paramMismatches.push(
          `${path}: ${LOCALES.map((l, i) => `${l}=[${paramSets[i]}]`).join(' ')}`,
        );
      }
    }
  }

  const totalMissing = Object.values(missing).reduce((n, arr) => n + arr.length, 0);
  const valid = totalMissing === 0 && paramMismatches.length === 0;

  const lines: string[] = [
    valid ? '✓ All locales are in sync.' : '✗ Locale issues detected:',
    ...LOCALES.flatMap((locale) =>
      missing[locale].length
        ? [`  ${locale} missing ${missing[locale].length} key(s): ${missing[locale].slice(0, 5).join(', ')}${missing[locale].length > 5 ? '…' : ''}`]
        : [],
    ),
    ...(paramMismatches.length
      ? [`  Param mismatches (${paramMismatches.length}): ${paramMismatches.slice(0, 3).join('; ')}${paramMismatches.length > 3 ? '…' : ''}`]
      : []),
  ];

  return { valid, missing, paramMismatches, summary: lines.join('\n') };
}

/**
 * Returns all keys present in `source` locale but absent in `target`.
 * Useful for incremental migration.
 */
export function missingInLocale(
  source: Locale,
  target: Locale,
  resources: LocaleMessages = { ar, ckb, en },
): string[] {
  const sourcePaths = new Set(leafPaths(resources[source] ?? {}));
  const targetPaths = new Set(leafPaths(resources[target] ?? {}));
  return [...sourcePaths].filter((p) => !targetPaths.has(p));
}

/**
 * Find all keys present in `base` locale that are missing in `compare`.
 * This is an alias for `missingInLocale` with clearer naming.
 */
export function findMissingKeys(
  baseLocale: Locale,
  compareLocale: Locale,
  resources: LocaleMessages = { ar, ckb, en },
): string[] {
  return missingInLocale(baseLocale, compareLocale, resources);
}

/**
 * Find keys present in `compare` locale but absent in `base`.
 * These are "extra" keys that the base doesn't have — possibly added to
 * the wrong locale or not yet back-ported to the base.
 */
export function findExtraKeys(
  baseLocale: Locale,
  compareLocale: Locale,
  resources: LocaleMessages = { ar, ckb, en },
): string[] {
  const basePaths = new Set(leafPaths(resources[baseLocale] ?? {}));
  const comparePaths = new Set(leafPaths(resources[compareLocale] ?? {}));
  return [...comparePaths].filter((p) => !basePaths.has(p));
}

export interface AllLocalesReport {
  /** Per-locale list of keys missing (relative to the union of all keys). */
  missing: Record<Locale, string[]>;
  /** Keys present in some locales but not all. */
  inconsistentKeys: string[];
  /** Param mismatches across any two locales. */
  paramMismatches: string[];
  /** Whether all locales are fully consistent. */
  valid: boolean;
  /** Human-readable summary. */
  summary: string;
}

/**
 * Run a full cross-locale validation: check that ar, ckb and en all share
 * the same key set with matching {param} placeholders.
 *
 * This wraps `validateLocales` and returns an enriched report.
 */
export function validateAllLocales(
  resources: LocaleMessages = { ar, ckb, en },
): AllLocalesReport {
  const result = validateLocales(resources);

  const allPaths = new Set<string>([
    ...leafPaths(resources.ar ?? {}),
    ...leafPaths(resources.ckb ?? {}),
    ...leafPaths(resources.en ?? {}),
  ]);

  const inconsistentKeys: string[] = [];
  for (const path of allPaths) {
    const presentCount = LOCALES.filter((l) => {
      const paths = new Set(leafPaths(resources[l] ?? {}));
      return paths.has(path);
    }).length;
    if (presentCount < LOCALES.length) {
      inconsistentKeys.push(path);
    }
  }

  return {
    missing: result.missing,
    inconsistentKeys,
    paramMismatches: result.paramMismatches,
    valid: result.valid,
    summary: result.summary,
  };
}

/**
 * Produces a flat report of every key in every locale with its value.
 * Useful for translator handoffs.
 */
export function exportFlatTable(
  resources: LocaleMessages = { ar, ckb, en },
): Array<{ path: string; ar: string; ckb: string; en: string }> {
  const allPaths = new Set([
    ...leafPaths(resources.ar ?? {}),
    ...leafPaths(resources.ckb ?? {}),
    ...leafPaths(resources.en ?? {}),
  ]);

  return [...allPaths].sort().map((path) => ({
    path,
    ar: getPath(resources.ar, path) ?? '',
    ckb: getPath(resources.ckb, path) ?? '',
    en: getPath(resources.en, path) ?? '',
  }));
}

// --- CLI entry point ---
// Run with: npx tsx packages/i18n/src/validate.ts
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('validate.ts')) {
  const report = validateAllLocales();
  console.log('\n=== Iraq Maps Locale Validation Report ===\n');
  console.log(report.summary);

  if (!report.valid) {
    console.log('\n--- Missing keys (per locale) ---');
    for (const [locale, keys] of Object.entries(report.missing)) {
      if (keys.length) {
        console.log(`\n  ${locale} is missing ${keys.length} key(s):`);
        for (const k of keys) console.log(`    - ${k}`);
      }
    }

    if (report.inconsistentKeys.length) {
      console.log(`\n--- Inconsistent keys (${report.inconsistentKeys.length} total) ---`);
      for (const k of report.inconsistentKeys) console.log(`  - ${k}`);
    }

    if (report.paramMismatches.length) {
      console.log('\n--- Param mismatches ---');
      for (const m of report.paramMismatches) console.log(`  ${m}`);
    }

    console.log('\n--- Quick diff commands ---');
    const pairs: [Locale, Locale][] = [['ar', 'ckb'], ['ar', 'en'], ['ckb', 'en']];
    for (const [base, compare] of pairs) {
      const missing = findMissingKeys(base, compare);
      const extra = findExtraKeys(base, compare);
      if (missing.length || extra.length) {
        console.log(`\n  ${compare} vs ${base}:`);
        if (missing.length) console.log(`    missing ${missing.length} key(s) from ${base}: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`);
        if (extra.length) console.log(`    extra ${extra.length} key(s) not in ${base}: ${extra.slice(0, 3).join(', ')}${extra.length > 3 ? '…' : ''}`);
      }
    }

    process.exit(1);
  } else {
    console.log('\nAll 3 locales (ar, ckb, en) are in full sync. No action needed.\n');
  }
}
