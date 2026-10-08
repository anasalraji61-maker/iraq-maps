# M0 contract requests from builder-ui-i18n

## 1. `i18next/no-literal-string` flags non-user-facing JSX attributes (non-blocking, affects every UI package)

**Status: resolved (integrator, M0).** The rule now checks JSX text and only the copy-bearing attributes `label`, `title`, `subtitle`, `body`, `message`, `error`, `placeholder`, `accessibilityLabel` and `accessibilityHint`. `packages/tooling/test/eslint.test.ts` covers it. The `prop` constant in `packages/ui` can be inlined again.

The rule runs in `mode: 'jsx-only'` with the plugin's default `jsx-attributes` (which excludes only `className`, `style`,
`type`, `key`, `id`, `width`, `height`). So every string inside JSX is an error, including values that users never see:
`accessibilityRole="button"`, `accessibilityLiveRegion="polite"`, `keyboardShouldPersistTaps="handled"`,
`animationType="slide"`, `edges={['bottom']}`, `keyboardType="phone-pad"`, `variant="secondary"`.

Workaround in place: `packages/ui/src/components.tsx` keeps these values in one `prop` constant outside JSX.

Proposed fix: validate only the attributes that carry user-facing text. The Arabic-script `no-restricted-syntax` rule
still catches Arabic anywhere in UI code.

```js
'i18next/no-literal-string': ['error', {
  mode: 'jsx-only',
  'jsx-attributes': { include: ['label', 'title', 'message', 'body', 'placeholder', 'accessibilityLabel', 'accessibilityHint', 'aria-label'] },
}],
```

Suggested regression case for `packages/tooling/test/eslint.test.ts`: in `packages/ui/src/x.tsx`,
`<Pressable accessibilityRole="button" accessibilityLabel="Close" />` reports exactly one `i18next/no-literal-string`
(for `accessibilityLabel`). Once this lands, the `prop` constant in `packages/ui` can be inlined again.

## 2. Additive exports beyond the frozen stubs (information only)

These additions do not change any frozen signature:

- `@iraq-maps/i18n`
  - `formatNumber(value, options?)`: the milestone's "number formatting per locale".
  - `assertKeyParity(ns, resources)`: the key-parity test helper. `registerNamespace` also calls it.
- `@iraq-maps/ui`
  - `useUiFonts()`: loads Noto Sans Arabic for the shell.
