// pnpm --filter @iraq-maps/bench route --api <url> --city <id> [--count 200] [--budget-ms 1500]
// CliContracts.benchRoute: prints JSON {city,count,errors,p50Ms,p95Ms,maxMs}, appends Markdown to $GITHUB_STEP_SUMMARY,
// exits 1 when p95Ms >= budget or errors > 0.
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CityId } from '@iraq-maps/contracts';
import { z } from 'zod';
import { routeReport, runRoutes, samplePairs, type BBox } from './route-bench.ts';

const options = {
  api: { type: 'string' },
  city: { type: 'string' },
  count: { type: 'string' },
  'budget-ms': { type: 'string' },
} as const;

const args = z
  .object({
    api: z.string().url(),
    city: CityId,
    count: z.coerce.number().int().min(1).default(200),
    'budget-ms': z.coerce.number().positive().default(1500),
  })
  .parse(parseArgs({ options }).values);

/** Well-known bounding boxes (west, south, east, north) per city id. */
const CITY_BBOXES: Record<string, BBox> = {
  baghdad: { west: 44.22, south: 33.2, east: 44.55, north: 33.45 },
  basra: { west: 47.6, south: 30.4, east: 47.9, north: 30.65 },
  erbil: { west: 43.9, south: 36.1, east: 44.1, north: 36.25 },
};

const bbox = CITY_BBOXES[args.city];
if (!bbox) {
  console.error(`Unknown city: ${args.city}. Known cities: ${Object.keys(CITY_BBOXES).join(', ')}`);
  process.exitCode = 1;
  process.exit();
}

const pairs = samplePairs(args.count, bbox);
const { times, errors } = await runRoutes(args.api, pairs);
const rep = routeReport(times);
const budgetMs = args['budget-ms'];
const passed = errors === 0 && rep.p95Ms < budgetMs;

const result = { city: args.city, count: args.count, errors, ...rep };
console.log(JSON.stringify(result));

const md = [
  `### Route latency: ${args.city}`,
  '',
  '| routes | errors | p50 | p95 | max | p95 budget |',
  '|---|---|---|---|---|---|',
  `| ${args.count} | ${errors} | ${rep.p50Ms} ms | ${rep.p95Ms} ms | ${rep.maxMs} ms | under ${budgetMs} ms: ${passed ? 'pass' : 'FAIL'} |`,
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
process.exitCode = passed ? 0 : 1;
