import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import i18next from 'eslint-plugin-i18next';
import tseslint from 'typescript-eslint';

// Paths are relative to the repo root (the root eslint.config.js re-exports this).
// Arabic, Arabic Supplement, Arabic Extended-A and the presentation forms (Arabic and Kurdish Sorani).
const ARABIC = '/[\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]/';
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
    rules: {
      // JSX text and the attributes that carry copy; enum props (variant="title", keyboardType, accessibilityRole) are not copy.
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': { include: ['label', 'title', 'subtitle', 'body', 'message', 'error', 'placeholder', 'accessibilityLabel', 'accessibilityHint'] },
        },
      ],
      // jsx-only misses `const label = 'تسجيل الخروج'`: any Arabic-script string in UI code belongs in an i18n catalog.
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${ARABIC}]`, message: 'Arabic-script text belongs in an i18n namespace, not in code.' },
        { selector: `TemplateElement[value.raw=${ARABIC}]`, message: 'Arabic-script text belongs in an i18n namespace, not in code.' },
        {
          selector: 'Property[key.name=/^(title|tabBarLabel|tabBarAccessibilityLabel|headerTitle|headerBackTitle)$/] > Literal[value=/[A-Za-z]/]',
          message: 'Navigation titles and labels are user-facing: use t().',
        },
        { selector: "CallExpression[callee.object.name='Alert'] > Literal", message: 'Alert text is user-facing: use t().' },
        {
          selector: 'Property[key.name=/^(left|right|(margin|padding)(Left|Right)|border(Left|Right)(Width|Color)|border(Top|Bottom)(Left|Right)Radius)$/]',
          message: 'Physical left/right styles do not mirror in RTL: use start/end (start, marginStart, paddingEnd, borderStartWidth, ...).',
        },
        { selector: "Property[key.name='textAlign'] > Literal[value=/^(left|right)$/]", message: "Use textAlign 'auto' or the writing direction, not left/right." },
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
