import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cruise, type IViolation } from 'dependency-cruiser';
import { expect, it } from 'vitest';

const ruleSet = createRequire(import.meta.url)('../dependency-cruiser.cjs');
const baseDir = fileURLToPath(new URL('./fixtures', import.meta.url));

it('reports every boundary violation in the fixtures, and nothing else', async () => {
  const { output } = await cruise(['modules', 'mobile-features', 'adapters', 'packages'], {
    validate: true,
    ruleSet: { forbidden: ruleSet.forbidden },
    baseDir,
    tsPreCompilationDeps: true,
  });
  if (typeof output === 'string') throw new Error('unexpected string output');
  const found = output.summary.violations.map((v: IViolation) => `${v.rule.name}: ${v.from} -> ${v.to}`).sort();
  expect(found).toEqual([
    'adapter-imports: adapters/s3/src/index.ts -> modules/b/src/index.ts',
    'feature-to-feature: mobile-features/x/src/index.ts -> mobile-features/y/src/index.ts',
    'mobile-to-backend: mobile-features/x/src/index.ts -> modules/b/src/index.ts',
    'module-to-module: modules/a/src/index.ts -> modules/b/src/index.ts',
  ]);
});
