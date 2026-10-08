import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

// Paths are relative to the repo root (the root eslint.config.js re-exports this).
const UI = ['packages/ui/src/**', 'packages/mobile-kit/src/**', 'mobile-features/*/src/**', 'apps/mobile/app/**', 'apps/mobile/src/**', 'apps/admin/src/**'];

export default defineConfig(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/android/**', '**/ios/**', '**/.turbo/**', '**/coverage/**', '**/fixtures/**', '**/expo-env.d.ts'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: UI.map((p) => `${p}/*.{ts,tsx}`),
    ignores: ['**/*.test.{ts,tsx}', '**/test/**'],
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-only' }] },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
