# @iraq-maps/ui

React Native design-system primitives for the app. Every visible string comes in through props, already translated with
`@iraq-maps/i18n`; the package itself has no copy.

**Components:** `Screen`, `Text`, `Button`, `TextField`, `ListItem`, `Card`, `Sheet`, `Banner`, `EmptyState`,
`IconButton`, `Badge` and `PlaceSummaryCard`. The props are the interfaces in `src/types.ts`.

`PlaceSummaryCard` is one place in a list (the map search results; later Discover and the assistant). It takes only
text: `name`, plus optional `category` (or the kind for a street or area), `area`, `distance` (already formatted for the
locale) and `source` (shown as a `Badge`), and a required `onPress`. The first line holds the name and the distance, and
the second holds `category · area` and the badge. Both lines begin at the logical start, so they mirror in RTL.

**Tokens:** `tokens` holds the colors, spacing, radii, font sizes and `minTouch: 48`.
- Every text and background pair meets WCAG AA (4.5:1), and borders reach 3:1. `src/tokens.test.ts` asserts both.
- Every pressable is at least 48dp tall: Button, the TextField input, a pressable ListItem or Card (so also
  PlaceSummaryCard), and the 48×48 IconButton.

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
| `Card`, `PlaceSummaryCard` | With `onPress`, one `button` whose accessible name is its texts in reading order. |
| `ListItem disabled` | A pressable row with `disabled` ignores presses, is dimmed, and exposes `accessibilityState.disabled` (for example, the language rows while the choice is saved). |
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
`arrow_back`, rendered by `expo-symbols` on Android (Apache-2.0, see `docs/DATA_SOURCES.md`). The `ListItem` check mark
and the shell's tab icons use Material Symbols on Android too.

On iOS, `expo-symbols` draws [SF Symbols](https://developer.apple.com/sf-symbols/) from the operating system. Today only
the `ListItem` check mark has an iOS name (`checkmark`). SF Symbols may be used only as system symbols in an Apple-platform
app: we never bundle, export or redistribute the glyphs, they never appear on Android or in the admin web panel, and we
avoid the restricted symbols that depict Apple products (see the SF Symbols row in `docs/DATA_SOURCES.md`).
`IconButton` has no SF Symbol mapping yet, so it draws no glyph on iOS. Map each icon before the iOS release.

**Ports:** none. **Env:** none.

**Tests:** `pnpm --filter @iraq-maps/ui test` runs Jest with the `jest-expo` preset and RNTL 14. Note that
`render`/`fireEvent` are async in v14, so `await` them.
