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
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('validate.ts')) {
  const result = validateLocales();
  console.log(result.summary);
  if (!result.valid) {
    console.log('\nFull missing-key list:');
    for (const [locale, keys] of Object.entries(result.missing)) {
      if (keys.length) console.log(`  ${locale} (${keys.length}):\n    ${keys.join('\n    ')}`);
    }
    if (result.paramMismatches.length) {
      console.log('\nParam mismatches:\n  ' + result.paramMismatches.join('\n  '));
    }
    process.exit(1);
  }
}
