# @iraq-maps/ui

React Native design-system primitives for the app. Every visible string comes in through props, already translated with
`@iraq-maps/i18n`; the package itself has no copy.

**Components:** `Screen`, `Text`, `Button`, `TextField`, `ListItem`, `Card`, `Sheet`, `Banner`, `EmptyState` and
`IconButton`. The props are the frozen interfaces in `src/types.ts`.

**Tokens:** `tokens` holds the colors, spacing, radii, font sizes and `minTouch: 48`.
- Every text and background pair meets WCAG AA (4.5:1), and borders reach 3:1. `src/tokens.test.ts` asserts both.
- Every pressable is at least 48dp tall: Button, the TextField input, a pressable ListItem, and the 48×48 IconButton.

**RTL.** Layouts use only logical properties (`borderStartWidth`, `borderTopStartRadius`), and `flexDirection: 'row'`
flips automatically under `I18nManager`. `textAlign` is left unset, so each text aligns by its own direction.
`IconButton` mirrors directional Material Symbols (`arrow_back`, `chevron_left`, ...) when `I18nManager.isRTL` is set.
Give phone, OTP and URL fields `direction="ltr"`. The input then stays left-to-right in an RTL layout, so `0770 123 4567`
does not show as `4567 123 0770`. TextField also passes `autoComplete` and `textContentType` through to the input.

**Accessibility.**

| Component | Behavior |
|---|---|
| `Button` | `button` role; its `disabled`/`busy` state is exposed. |
| `TextField` | The input's `accessibilityLabel` is the label. The error is set as the input's hint, and `AccessibilityInfo.announceForAccessibility` announces it when it appears or changes. |
| `Text variant="title"` | `header` role. |
| `EmptyState` | Its title has the `header` role. |
| `Banner` | Its message is announced when the banner is shown or the message changes. `kind="error"` also gets the `alert` role. |
| `ListItem selected` | A pressable row with `selected` set becomes a `radio` with `checked` state, instead of a `button`. When `selected` is `true`, the row also gets a `surface` background, a `primary` start border and a check mark at its logical end. The check mark is visual only, with testID `${testID}.selected`. |
| `Sheet` | Closes on Android back (`onRequestClose`), a backdrop tap, or the iOS escape gesture. |

**testIDs.** The `testID` goes on the element that Maestro taps. For `TextField` that is the `TextInput`, and for
`Button` it is the pressable. `EmptyState`'s action button gets `${testID}.action`.

**Fonts.** The font is Noto Sans Arabic (OFL-1.1, see `docs/DATA_SOURCES.md`) in two families, `NotoSansArabic_400Regular`
and `NotoSansArabic_700Bold`. The app root gates its first render on the hook:

```tsx
const fontsReady = useUiFonts(); // true once loaded, or on a load error (system font fallback)
if (!fontsReady) return null;
```

**Icons.** `IconButton.icon` is a [Material Symbols](https://fonts.google.com/icons) name such as `close`, `settings` or
`arrow_back`, rendered by `expo-symbols` on Android. iOS SF Symbol mapping comes later.

**Ports:** none. **Env:** none.

**Tests:** `pnpm --filter @iraq-maps/ui test` runs Jest with the `jest-expo` preset and RNTL 14. Note that
`render`/`fireEvent` are async in v14, so `await` them.
