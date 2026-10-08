import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type IViolation } from 'dependency-cruiser';
import { expect, it } from 'vitest';

const ruleSet = createRequire(import.meta.url)('../dependency-cruiser.cjs');
const baseDir = fileURLToPath(new URL('./fixtures', import.meta.url));

it('reports every boundary violation in the fixtures, and nothing else', async () => {
  const { output } = await cruise(['apps', 'modules', 'mobile-features', 'adapters', 'packages', 'tools'], {
    validate: true,
    ruleSet: { forbidden: ruleSet.forbidden },
    baseDir,
    tsPreCompilationDeps: true,
  });
  if (typeof output === 'string') throw new Error('unexpected string output');
  const found = output.summary.violations.map((v: IViolation) => `${v.rule.name}: ${v.from} -> ${v.to}`).sort();
  expect(found).toEqual([
    'adapter-binding: tools/t/src/index.ts -> adapters/s3/src/index.ts',
    'adapter-imports: adapters/s3/src/index.ts -> modules/b/src/index.ts',
    'app-deep-import: apps/api/src/index.ts -> modules/b/src/internal.ts',
    'contracts-deps: packages/contracts/src/index.ts -> packages/config/src/index.ts',
    'feature-to-app: mobile-features/x/src/index.ts -> apps/mobile/src/index.ts',
    'feature-to-feature: mobile-features/x/src/index.ts -> mobile-features/y/src/index.ts',
    'mobile-to-backend: mobile-features/x/src/index.ts -> modules/b/src/index.ts',
    'module-imports: modules/a/src/index.ts -> tools/t/src/index.ts',
    'module-to-adapter: modules/a/src/index.ts -> adapters/s3/src/index.ts',
    'module-to-module: modules/a/src/index.ts -> modules/b/src/index.ts',
    'no-circular: packages/p1/src/index.ts -> packages/p2/src/index.ts',
    'not-to-unresolvable: tools/t/src/index.ts -> @iraq-maps/undeclared',
    'package-upward: packages/p2/src/index.ts -> modules/b/src/index.ts',
  ]);
  // Every rule has a fixture.
  expect(new Set(found.map((f) => f.split(':')[0]))).toEqual(new Set(ruleSet.forbidden.map((r: { name: string }) => r.name)));
});
