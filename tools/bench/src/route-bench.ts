import { RouteResult, type RouteRequest } from '@iraq-maps/contracts';

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** LCG seeded random in [0,1). Multiplier/increment from Numerical Recipes. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0x100000000;
  };
}

/** Generate `count` random [lng, lat] pairs inside `bbox` using a seeded LCG so the output is deterministic. */
export function samplePairs(
  count: number,
  bbox: BBox,
  seed = 42,
): Array<[origin: [number, number], destination: [number, number]]> {
  const rand = lcg(seed);
  const lng = () => bbox.west + rand() * (bbox.east - bbox.west);
  const lat = () => bbox.south + rand() * (bbox.north - bbox.south);
  return Array.from({ length: count }, () => [[lng(), lat()], [lng(), lat()]]);
}

export interface LatencyReport {
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
const round = (ms: number) => Math.round(ms * 10) / 10;

/** Compute p50/p95/max from a list of latency samples (ms). Input need not be sorted. */
export function routeReport(latencies: readonly number[]): LatencyReport {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    maxMs: round(percentile(sorted, 100)),
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST one route request, return elapsed ms or null on failure / contract mismatch. */
async function timeRoute(apiUrl: string, req: RouteRequest): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = performance.now();
    const res = await fetch(`${apiUrl}/v1/routes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    }).catch(() => null);
    const body: unknown = await res?.json().catch(() => null);
    const ms = performance.now() - start;
    if (res?.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 1);
      await sleep(1000 * (Number.isFinite(wait) ? wait : 1));
      continue;
    }
    return res?.status === 200 && RouteResult.safeParse(body).success ? ms : null;
  }
  return null;
}

/** Run `pairs` as concurrent POST /v1/routes batches of `batchSize`. Returns latency samples for successes. */
export async function runRoutes(
  apiUrl: string,
  pairs: Array<[origin: [number, number], destination: [number, number]]>,
  batchSize = 10,
): Promise<{ times: number[]; errors: number }> {
  const times: number[] = [];
  let errors = 0;
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(([origin, destination]) =>
        timeRoute(apiUrl, { origin, destination, waypoints: [], mode: 'car' }),
      ),
    );
    for (const ms of results) {
      if (ms === null) errors++;
      else times.push(ms);
    }
  }
  return { times, errors };
}
