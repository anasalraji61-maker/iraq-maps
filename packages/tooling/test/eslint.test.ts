import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('../../..', import.meta.url));
const eslint = new ESLint({ cwd, overrideConfigFile: fileURLToPath(new URL('../eslint.config.js', import.meta.url)) });
const rulesHit = async (code: string, file: string) => (await eslint.lintText(code, { filePath: `${cwd}/${file}` }))[0]!.messages.map((m) => m.ruleId);

it('refuses Arabic-script string literals and templates in UI code only', async () => {
  const code = "export const label = 'تسجيل الخروج';\nexport const title = `${label} — چوونەدەرەوە`;\n";
  expect(await rulesHit(code, 'mobile-features/account/src/labels.ts')).toEqual(['no-restricted-syntax', 'no-restricted-syntax']);
  expect(await rulesHit(code, 'packages/ui/src/labels.tsx')).toEqual(['no-restricted-syntax', 'no-restricted-syntax']);
  expect(await rulesHit(code, 'modules/identity/src/labels.ts')).toEqual([]);
  expect(await rulesHit("export const label = 'Sign out';\n", 'apps/mobile/src/shell/labels.ts')).toEqual([]);
});
