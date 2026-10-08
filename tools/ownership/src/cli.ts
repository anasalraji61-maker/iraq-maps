#!/usr/bin/env node
// Usage: ownership-check (--milestone M0 | --map file.json) [--base <git-ref>] [--agent <name>]
// --milestone reads the owners front-matter of docs/milestones/<milestone>-*.md. Always checks that owner globs are
// disjoint. With --base, also checks `git diff --name-only <base>` (+ untracked files) stays inside the agent's globs
// (or inside some owner's globs without --agent), and that fixtures are <= 500KB.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { findLargeFixtures, findOutsideOwner, findOverlaps, milestoneOwners, type OwnershipMap } from './ownership.ts';

const { values: args } = parseArgs({ options: { milestone: { type: 'string' }, map: { type: 'string' }, base: { type: 'string' }, agent: { type: 'string' } } });
const source = args.map ?? `docs/milestones/${args.milestone ?? 'M0'}-*.md`;
const map: OwnershipMap = args.map ? JSON.parse(readFileSync(args.map, 'utf8')).owners : milestoneOwners(args.milestone ?? 'M0');
const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);

const errors = findOverlaps(map, git('ls-files', '--cached', '--others', '--exclude-standard'));
if (args.base) {
  const changed = [...new Set([...git('diff', '--name-only', args.base), ...git('ls-files', '--others', '--exclude-standard')])];
  errors.push(...findOutsideOwner(map, changed, args.agent).map((f) => `outside ${args.agent ?? 'every owner'}: ${f}`));
  errors.push(...findLargeFixtures(changed.filter(existsSync).map((path) => ({ path, bytes: statSync(path).size }))));
}
for (const e of errors) console.error(`ownership: ${e}`);
console.log(`ownership: ${errors.length ? 'FAILED' : 'ok'} (${Object.keys(map).length} owners, ${source})`);
process.exit(errors.length ? 1 : 0);
