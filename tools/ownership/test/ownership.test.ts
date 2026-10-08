import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findLargeFixtures, findOutsideOwner, findOverlaps } from '../src/ownership.ts';

const cli = new URL('../src/cli.ts', import.meta.url).pathname;

describe('ownership', () => {
  it('flags overlapping globs between owners and accepts disjoint ones', () => {
    expect(findOverlaps({ a: ['packages/x/**'], b: ['packages/**'] })).toHaveLength(1);
    expect(findOverlaps({ a: ['apps/mobile/*'], b: ['apps/mobile/src/shell/**'] })).toEqual([]);
    expect(findOverlaps({ a: ['apps/*/x.ts'], b: ['apps/m/*'] }, ['apps/m/x.ts'])).toHaveLength(1);
  });

  it('flags changed files outside the agent or outside every owner', () => {
    const map = { a: ['modules/a/**'], b: ['modules/b/**'] };
    expect(findOutsideOwner(map, ['modules/a/x.ts', 'modules/b/y.ts'], 'a')).toEqual(['modules/b/y.ts']);
    expect(findOutsideOwner(map, ['modules/b/y.ts', 'README.md'])).toEqual(['README.md']);
  });

  it('flags fixtures over 500KB', () => {
    expect(findLargeFixtures([{ path: 'x/fixtures/a.pbf', bytes: 600 * 1024 }, { path: 'x/a.pbf', bytes: 600 * 1024 }])).toHaveLength(1);
  });

  it('CLI exits non-zero when a diff touches another owner, and on overlapping globs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'own-'));
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir });
    git('init', '-q');
    writeFileSync(join(dir, 'base.txt'), '');
    git('add', '.');
    git('commit', '-qm', 'base');
    writeFileSync(join(dir, 'map.json'), JSON.stringify({ owners: { a: ['a/**', 'map.json'], b: ['b/**'] } }));
    writeFileSync(join(dir, 'overlap.json'), JSON.stringify({ owners: { a: ['**'], b: ['b/**'] } }));
    const run = (...a: string[]) => spawnSync(process.execPath, [cli, ...a], { cwd: dir, encoding: 'utf8' });

    expect(run('--map', 'map.json', '--base', 'HEAD', '--agent', 'a').status).toBe(1); // overlap.json is outside a
    expect(run('--map', 'overlap.json').status).toBe(1);
    expect(run('--map', 'map.json').status).toBe(0);
  });
});
