# @iraq-maps/ui

React Native design system for the app: RTL-safe primitives, AA-contrast tokens, the Noto Sans Arabic font and Material Symbols icons. Components render only text their callers pass in, already translated with `@iraq-maps/i18n` `t()`. The package itself has no user-facing strings.

## Components (from `src/index.ts` only)

| Component | Props | Notes |
|---|---|---|
| `Screen` | `children`, `scroll?`, `testID?` | `bg` background, safe-area insets (react-native-safe-area-context), `m` padding and gap. `scroll` uses a ScrollView with `keyboardShouldPersistTaps="handled"`. |
| `Text` | `children`, `variant?: title \| subtitle \| body \| caption`, `tone?: default \| muted \| danger`, `testID?` | `title` is announced as a header. Title and subtitle use the bold family. |
| `Button` | `label`, `onPress`, `variant?: primary \| secondary \| danger`, `disabled?`, `loading?`, `testID?` | Role `button`, accessible name = `label`, `accessibilityState { disabled, busy }`. Disabled and loading buttons ignore presses; loading shows a spinner and keeps the name. |
| `TextField` | `label`, `value`, `onChangeText`, `error?`, `placeholder?`, `keyboardType?`, `autoFocus?`, `maxLength?`, `testID?` | The visible label is the input's accessible name (`accessibilityLabelledBy`, Android). The error turns the border red and is announced politely (`accessibilityLiveRegion`). `phone-pad`, `number-pad`, `numeric`, `decimal-pad`, `email-address` and `url` keep the content left-to-right inside RTL layouts (`direction: 'ltr'`), so `0770 123 4567` is not reordered. |
| `ListItem` | `title`, `subtitle?`, `onPress?`, `trailing?`, `testID?` | A button only when `onPress` is given. |
| `Card` | `children`, `onPress?`, `testID?` | A button only when `onPress` is given. |
| `Sheet` | `visible`, `onClose`, `children`, `closeLabel?`, `testID?` | Bottom sheet in a `Modal`. Android back (`onRequestClose`) and a tap on the backdrop call `onClose`. Pass a translated `closeLabel` (e.g. `t('shell:close')`) so screen readers can reach the backdrop as a button. |
| `Banner` | `kind: info \| success \| error`, `message`, `testID?` | `error` is an `alert` announced assertively; `info`/`success` are announced politely. An icon repeats the meaning of the color. |
| `EmptyState` | `title`, `body?`, `action?: { label, onPress }`, `testID?` | The one placeholder for tabs and screens whose features are not delivered yet. |
| `IconButton` | `icon`, `accessibilityLabel` (required), `onPress`, `testID?` | 48x48 touch target. `icon` is a Material Symbols name. |
| `Icon` | `name`, `size? = 24`, `color? = text`, `testID?` | Decorative, hidden from screen readers (e.g. tab bar icons: `map`, `explore`, `forum`, `history`, `person`, `settings`). `arrow_back`, `arrow_forward`, `chevron_left` and `chevron_right` are mirrored in RTL. |
| `useUiFonts()` | returns `boolean` | See "Fonts". |
| `tokens` / `Tokens` | | See "Tokens". |

Additive to the frozen M0 stubs: `Icon` and `IconProps`, `useUiFonts`, `SheetProps.closeLabel`, `tokens.color.success`, `tokens.color.scrim` and `tokens.font.familyBold`.

## Tokens

| Token | Value | Contrast (WCAG 2.x, tested in `src/tokens.test.ts`) |
|---|---|---|
| `color.bg` / `color.surface` | `#F6F7F9` / `#FFFFFF` | |
| `color.text` | `#14181F` | 16.6:1 on bg, 17.8:1 on surface |
| `color.textMuted` | `#4F5866` | 6.7:1 on bg, 7.2:1 on surface |
| `color.primary` / `color.onPrimary` | `#00695C` / `#FFFFFF` | 6.6:1 (also 6.6:1 as text on surface) |
| `color.danger` | `#B3261E` | 6.1:1 as text on bg; white on danger 6.5:1 |
| `color.border` | `#79818E` | 3.7:1 on bg, 3.9:1 on surface (input outlines, 3:1 minimum) |
| `color.success` | `#1E7B34` | 5.3:1 on surface (banner icon and edge) |
| `color.scrim` | `rgba(20, 24, 31, 0.5)` | sheet backdrop |
| `space` | `xs 4, s 8, m 16, l 24, xl 32` | |
| `radius` | `s 6, m 12, l 20` | |
| `font` | `family`, `familyBold`, `size { caption 13, body 16, subtitle 18, title 24 }` | line height is 1.5x the size so Arabic marks do not clip |
| `minTouch` | `48` | applied as `minHeight` (and `minWidth` where the content can be narrow) to every pressable |

## Fonts

Noto Sans Arabic (SIL OFL 1.1, via `@expo-google-fonts/noto-sans-arabic`). Only the per-weight subpaths `400Regular` and `700Bold` are imported, never the package root, which would bundle all nine weights into the APK. It covers the whole Arabic block, including the Sorani letters ڕ ۆ ێ ڵ ە; Latin text falls back to the system font.

Android does not switch font files by `fontWeight`, so bold text uses its own family, `tokens.font.familyBold`.

The shell's root layout waits for the fonts before it renders:

```tsx
import { useUiFonts } from '@iraq-maps/ui';

export function RootLayout() {
  const fontsReady = useUiFonts();
  if (!fontsReady) return null;
  return <Tabs />;
}
```

`useUiFonts` also returns `true` when loading fails, so the app falls back to the system font instead of staying blank.

## Icons

Google Material Symbols (Apache-2.0), rendered by `expo-symbols` `SymbolView`, which uses `@expo-google-fonts/material-symbols` 400Regular (about 1 MB) on Android. Names are Material Symbols names (https://fonts.google.com/icons). iOS needs SF Symbol names and is out of scope until iOS work starts.

Both licenses are recorded in `docs/DATA_SOURCES.md`.

## RTL and accessibility rules

- Styles use only logical properties (`marginStart/End`, `paddingStart/End`, `borderStart*`, `start/end`), never left or right. A test walks every rendered host element of every component and fails on any left or right style key.
- `Text` sets no `textAlign`, so on Android (Fabric) it aligns with the layout direction (start) in both RTL and LTR, whatever the script of the string. `EmptyState` centers its text.
- Every pressable has `accessibilityRole="button"` and a minimum 48dp touch target (also tested on every component). `IconButton` requires `accessibilityLabel`.
- Decorative icons are hidden from screen readers.
- Non-visible enum props such as `accessibilityRole` live in `src/a11y.ts` and in module constants, because the repo's `i18next/no-literal-string` rule (`jsx-only` mode) flags every string literal inside JSX.

## Ports and env vars

Provides no ports and consumes none. Needs no environment variables.

## Tests

`pnpm --filter @iraq-maps/ui test` (Jest with jest-expo and React Native Testing Library): roles and accessible names, press handlers, disabled and loading buttons, TextField label, typing, error and LTR content, Sheet closing from the backdrop and from `requestClose`, Banner announcements, EmptyState action, RTL icon mirroring, font loading, token contrast with the WCAG formula, 48dp touch targets and the no-left/right style walk.
