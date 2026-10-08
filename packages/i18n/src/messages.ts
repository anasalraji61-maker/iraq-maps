import { Locale } from '@iraq-maps/contracts';
import { formatNumber, getLocale } from './locale';

export type Messages = { [key: string]: string | Messages };

type Params = Record<string, string | number>;
type Plural = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

const PLURALS: readonly string[] = ['zero', 'one', 'two', 'few', 'many', 'other'] satisfies Plural[];
const namespaces = new Map<string, Record<Locale, Messages>>();

/** An object whose keys are all CLDR categories with string values is one plural message. */
const isPlural = (node: Messages): boolean => {
  const entries = Object.entries(node);
  return entries.length > 0 && entries.every(([key, value]) => PLURALS.includes(key) && typeof value === 'string');
};

/** CLDR cardinal rules for ar, ckb and en, inlined because Hermes has no Intl.PluralRules. */
function pluralOf(count: number, locale: Locale): Plural {
  const n = Math.abs(count);
  if (locale !== 'ar') return n === 1 ? 'one' : 'other';
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (!Number.isInteger(n)) return 'other';
  const mod = n % 100;
  return mod >= 3 && mod <= 10 ? 'few' : mod >= 11 ? 'many' : 'other';
}

/** Leaf key paths and their kind; a plural message counts as one leaf. */
function shapeOf(messages: Messages, report: (problem: string) => void, prefix = '', shape = new Map<string, 'text' | 'plural'>()) {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix + key;
    if (typeof value === 'string') shape.set(path, 'text');
    else if (isPlural(value)) {
      shape.set(path, 'plural');
      if (!('other' in value)) report(`plural "${path}" has no "other" form`);
    } else shapeOf(value, report, `${path}.`, shape);
  }
  return shape;
}

const list = (label: string, keys: string[]) => (keys.length ? [`${label} [${keys.join(', ')}]`] : []);

/** Each feature registers its own namespace with all three locales; key paths must match ar exactly. */
export function registerNamespace(ns: string, resources: Record<Locale, Messages>): void {
  const problems: string[] = [];
  const shapes = Locale.options.map(
    (locale) => [locale, shapeOf(resources[locale] ?? {}, (problem) => problems.push(`${locale} ${problem}`))] as const,
  );
  const reference = shapes[0]![1];
  for (const [locale, shape] of shapes.slice(1)) {
    problems.push(
      ...list(`${locale} missing`, [...reference.keys()].filter((key) => !shape.has(key))),
      ...list(`${locale} extra`, [...shape.keys()].filter((key) => !reference.has(key))),
      ...list(`${locale} plural/text mismatch`, [...shape].filter(([key, kind]) => reference.has(key) && reference.get(key) !== kind).map(([key]) => key)),
    );
  }
  if (problems.length) throw new Error(`i18n namespace "${ns}" is not in parity with ar: ${problems.join('; ')}`);
  namespaces.set(ns, resources);
}

const interpolate = (message: string, params: Params) =>
  message.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : typeof value === 'number' ? formatNumber(value) : value;
  });

/** `t('account:phone.title', { n: 3 })`; plural messages pick their form from `count`. Unknown keys return the key. */
export function t(key: `${string}:${string}`, params: Params = {}): string {
  const separator = key.indexOf(':');
  const locale = getLocale();
  let node: string | Messages | undefined = namespaces.get(key.slice(0, separator))?.[locale];
  for (const part of key.slice(separator + 1).split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node === 'object' && isPlural(node) && typeof params.count === 'number') {
    node = node[pluralOf(params.count, locale)] ?? node.other;
  }
  return typeof node === 'string' ? interpolate(node, params) : key;
}
