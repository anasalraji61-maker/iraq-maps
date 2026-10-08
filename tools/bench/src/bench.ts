import { SearchResult, type PlaceImportRecord } from '@iraq-maps/contracts';

interface Query {
  q: string;
  /** "lng,lat" */
  near?: string;
}

/** The spellings people type for the stored one: bare alef, ه for ة, ي for ى (what the search normalizer folds). */
const respell = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
/** Half the name, at least 3 characters: a query typed as you go. */
const prefix = (s: string) => s.slice(0, Math.max(3, Math.ceil(s.length / 2)));
const forms = [(s: string) => s, respell, prefix];

/**
 * `count` queries sampled evenly from the records (their Arabic name, else `name`), cycling through the full name, a
 * respelling and a prefix, every other one with `near` at the record. The same input always gives the same queries.
 */
export function queries(records: readonly PlaceImportRecord[], count: number): Query[] {
  return Array.from({ length: count }, (_, i) => {
    const r = records[Math.floor((i * records.length) / count)]!;
    const q = forms[i % forms.length]!(r.names.ar ?? r.names.name).slice(0, 100).trim();
    return i % 2 ? { q, near: r.location.map((n) => n.toFixed(5)).join(',') } : { q };
  });
}

interface Report {
  city: string;
  count: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

/** Nearest-rank percentile of ascending values. */
const percentile = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
const round = (ms: number) => Math.round(ms * 10) / 10;

/** `count` queries, of which `times` (ms) succeeded. */
export function report(city: string, count: number, times: readonly number[]): Report {
  const sorted = [...times].sort((a, b) => a - b);
  const [p50Ms, p95Ms, maxMs] = [50, 95, 100].map((p) => round(percentile(sorted, p))) as [number, number, number];
  return { city, count, errors: count - times.length, p50Ms, p95Ms, maxMs };
}

/** AC#8: p95 under the budget, and no failed query. */
export const passed = (r: Report, budgetMs: number) => r.errors === 0 && r.p95Ms < budgetMs;

export const markdown = (r: Report, budgetMs: number) =>
  [
    `### Search latency: ${r.city}`,
    '',
    '| queries | errors | p50 | p95 | max | p95 budget |',
    '|---|---|---|---|---|---|',
    `| ${r.count} | ${r.errors} | ${r.p50Ms} ms | ${r.p95Ms} ms | ${r.maxMs} ms | under ${budgetMs} ms: ${passed(r, budgetMs) ? 'pass' : 'FAIL'} |`,
    '',
  ].join('\n');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wall time of one GET /v1/search until its body is read, or null when it fails or its body breaks the contract.
 * A 429 is waited out (Retry-After, default 1 s) and retried up to 5 times; its time is not counted. */
async function timeSearch(url: URL): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = performance.now();
    const res = await fetch(url).catch(() => null);
    const body: unknown = await res?.json().catch(() => null);
    const ms = performance.now() - start;
    if (res?.status !== 429) return res?.status === 200 && SearchResult.safeParse(body).success ? ms : null;
    const wait = Number(res.headers.get('retry-after') ?? 1);
    await sleep(1000 * (Number.isFinite(wait) ? wait : 1));
  }
  return null;
}

/** Runs the queries one after another against the API (in the same job, so this is server time plus loopback). */
export async function run(api: string, city: string, list: readonly Query[]): Promise<Report> {
  const times: number[] = [];
  for (const { q, near } of list) {
    const url = new URL('/v1/search', api);
    url.search = new URLSearchParams({ q, city, ...(near && { near }) }).toString();
    const ms = await timeSearch(url);
    if (ms !== null) times.push(ms);
  }
  return report(city, list.length, times);
}
