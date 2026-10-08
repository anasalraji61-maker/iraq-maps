// pnpm --filter @iraq-maps/bench search --api <url> --city <id> --input <places.ndjson> [--count 200] [--budget-ms 800]
// CliContracts.benchSearch (packages/contracts): prints the JSON report, appends the Markdown table to
// $GITHUB_STEP_SUMMARY when set, and exits 1 when p95 is not under the budget or any query failed.
import { appendFileSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { CityId, PlaceImportRecord } from '@iraq-maps/contracts';
import { z } from 'zod';
import { markdown, passed, queries, run } from './bench.ts';

const options = { api: { type: 'string' }, city: { type: 'string' }, input: { type: 'string' }, count: { type: 'string' }, 'budget-ms': { type: 'string' } } as const;
const args = z
  .object({
    api: z.string().url(),
    city: CityId,
    input: z.string().min(1),
    count: z.coerce.number().int().min(1).default(200),
    'budget-ms': z.coerce.number().positive().default(800),
  })
  .parse(parseArgs({ options }).values);

const records = readFileSync(args.input, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => PlaceImportRecord.parse(JSON.parse(line)));
if (!records.length) throw new Error(`no records in ${args.input}`);

const report = await run(args.api, args.city, queries(records, args.count));
console.log(JSON.stringify(report));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(report, args['budget-ms']));
process.exitCode = passed(report, args['budget-ms']) ? 0 : 1;
