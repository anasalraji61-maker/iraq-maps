# M0 contract requests from builder-ui-i18n

## 1. `i18next/no-literal-string` flags non-visible React Native enum props (non-blocking)

**Status: open.** `packages/ui` works around it today: the enum props live in `packages/ui/src/a11y.ts` and in module constants, which the rule does not check.

`packages/tooling/eslint.config.js` runs the rule as `['error', { mode: 'jsx-only' }]`. In `jsx-only` mode, eslint-plugin-i18next 6.1.5 checks every string literal inside JSX, including attribute values. Its default `jsx-attributes.exclude` only lists web attributes (`className`, `styleName`, `style`, `type`, `key`, `id`, `width`, `height`). So ordinary, non-translatable React Native code fails lint, for example:

```tsx
<Pressable accessibilityRole="button" />            // flagged
<ScrollView keyboardShouldPersistTaps="handled" />  // flagged
<TextField keyboardType="phone-pad" />              // flagged
<Icon name="settings" />                            // flagged
<Tabs.Screen name="index" />                        // flagged
```

Every UI builder (mobile-kit, shell, features) hits this, and each workaround hides intent.

**Proposed change** (`packages/tooling/eslint.config.js`, UI block). The rule then still checks every visible string (JSX text, `label`, `title`, `message`, `body`, `placeholder`, `accessibilityLabel`, `accessibilityHint`, `aria-label`, ...):

```js
rules: {
  'i18next/no-literal-string': ['error', {
    mode: 'jsx-only',
    'jsx-attributes': {
      exclude: [
        // plugin defaults (a custom list replaces them)
        'className', 'styleName', 'style', 'type', 'key', 'id', 'width', 'height',
        // React Native and app enum props that are never shown to the user
        'testID', 'nativeID', 'role', 'accessibilityRole', 'accessibilityLiveRegion', 'aria-live',
        'importantForAccessibility', 'accessibilityLabelledBy', 'aria-labelledby',
        'keyboardType', 'inputMode', 'autoCapitalize', 'autoComplete', 'textContentType', 'returnKeyType', 'enterKeyHint',
        'keyboardShouldPersistTaps', 'animationType', 'presentationStyle', 'edges', 'resizeMode', 'pointerEvents',
        'name', 'icon', 'variant', 'tone', 'kind', 'href',
      ],
    },
  }],
},
```

The plugin skips literals anywhere inside an excluded attribute, ternaries included (`lib/helper/shouldSkip.js` and the `JSXAttribute` handler in `lib/rules/no-literal-string.js`). After the change, `packages/ui` can drop `src/a11y.ts` and the module constants in `src/layout.tsx` in a follow-up.

## 2. packages/ui cannot depend on @iraq-maps/i18n without a lockfile refresh (informational)

**Status: no change needed in M0.** The task brief says `packages/ui/package.json` lists `@iraq-maps/i18n`, but it does not, and `packages/ui/node_modules` has no workspace link. Adding it would need `pnpm install`, which builders may not run. `packages/ui` therefore has no strings of its own: the only one it needs, the Sheet backdrop's accessible name, is the additive optional prop `SheetProps.closeLabel`, which callers fill with `t()`. If a later milestone needs strings inside ui, the integrator adds `"@iraq-maps/i18n": "workspace:*"` and reinstalls.
