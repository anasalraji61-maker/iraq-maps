import { readdirSync, readFileSync } from 'node:fs';
import picomatch from 'picomatch';
import { parse } from 'yaml';

export type OwnershipMap = Record<string, string[]>;
const FIXTURE_MAX_BYTES = 500 * 1024;

const MILESTONES_DIR = new URL('../../../docs/milestones/', import.meta.url).pathname;

/** The `owners` map from the YAML front-matter of docs/milestones/<milestone>-*.md, the single source of truth. */
export function milestoneOwners(milestone: string, dir = MILESTONES_DIR): OwnershipMap {
  const file = readdirSync(dir).find((f) => f.startsWith(`${milestone}-`) && f.endsWith('.md'));
  if (!file) throw new Error(`no docs/milestones/${milestone}-*.md`);
  const frontMatter = /^---\n([\s\S]*?)\n---/.exec(readFileSync(dir + file, 'utf8'))?.[1];
  const owners = frontMatter && (parse(frontMatter) as { owners?: OwnershipMap }).owners;
  if (!owners) throw new Error(`docs/milestones/${file} has no owners front-matter`);
  return owners;
}

const matcher = (globs: string[]) => picomatch(globs, { dot: true });
const probe = (glob: string) => glob.replaceAll('**', 'p1/p2').replaceAll('*', 'p0');

/** Pairs of globs owned by different owners that can match the same path (checked by probing each glob and by real files). */
export function findOverlaps(map: OwnershipMap, files: string[] = []): string[] {
  const entries = Object.entries(map);
  const out = new Set<string>();
  for (const [i, [ownerA, globsA]] of entries.entries()) {
    for (const [ownerB, globsB] of entries.slice(i + 1)) {
      for (const a of globsA)
        for (const b of globsB) {
          const hit = picomatch(b, { dot: true })(probe(a)) || picomatch(a, { dot: true })(probe(b)) || files.some((f) => picomatch(a, { dot: true })(f) && picomatch(b, { dot: true })(f));
          if (hit) out.add(`${ownerA}:${a} overlaps ${ownerB}:${b}`);
        }
    }
  }
  return [...out];
}

/** Changed files that fall outside `agent`'s globs, or outside every owner when no agent is given. */
export function findOutsideOwner(map: OwnershipMap, changed: string[], agent?: string): string[] {
  if (agent && !map[agent]) throw new Error(`unknown agent ${agent}; known: ${Object.keys(map).join(', ')}`);
  const isOwned = matcher(agent ? map[agent]! : Object.values(map).flat());
  return changed.filter((f) => !isOwned(f));
}

export function findLargeFixtures(changed: { path: string; bytes: number }[]): string[] {
  const isFixture = picomatch('**/fixtures/**', { dot: true });
  return changed.filter((f) => isFixture(f.path) && f.bytes > FIXTURE_MAX_BYTES).map((f) => `${f.path} (${f.bytes} bytes > ${FIXTURE_MAX_BYTES})`);
}
