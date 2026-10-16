# ADR-0011: RTL-First Design System

**Status:** Accepted  
**Date:** 2026-10-16  
**Author:** Platform team  
**Milestone:** M0 (foundational)

---

## Context

### User Base

Iraq Smart Maps serves users in Iraq, where the two dominant languages are:

- **Arabic** (`ar`) — spoken by approximately 75–80% of the population; written right-to-left.
- **Kurdish Sorani** (`ckb`) — spoken by approximately 15–20% of the population in the Kurdistan Region; written in the Sorani script, which is also right-to-left.
- **English** (`en`) — used by a small minority and by international visitors; written left-to-right.

Both primary languages are RTL. An LTR-first design system would mean the primary user experience is built for the minority language, with RTL bolted on as an afterthought. This produces known problems:

- Mirrored layouts feeling unnatural in Arabic.
- Components that "work" in LTR but have visual glitches in RTL (misaligned icons, wrong border sides, reversed scroll directions).
- Animation directions that feel backwards (sliding in from the wrong side).
- Chevrons and arrows pointing the wrong way.
- Category filter bars that scroll from the wrong end.
- Tab bars ordered left-to-right instead of right-to-left.

### Existing Practice

Most mobile map applications are LTR-first because they target Western markets first. Arabic users of apps like Google Maps accept a partially RTL experience because there are no alternatives. Iraq Smart Maps is building for Iraq first.

### React Native RTL Support

React Native supports RTL through `I18nManager.isRTL`. When `isRTL` is `true`:

- `flexDirection: 'row'` reverses to flow from right to left.
- `Text` aligns to the right by default.
- Expo Router push/pop transitions reverse direction.
- `paddingStart`/`paddingEnd` and `borderStartWidth`/`borderEndWidth` logical properties map to the correct physical side.

React Native does **not** automatically mirror:
- Custom SVG icons
- Custom animations using `translateX`
- Explicit `left`/`right` styles (instead of `start`/`end`)
- ScrollView content insets
- Absolute positioning using `left`/`right`

---

## Decision

**All layouts are RTL-first.** Arabic is the primary design language. LTR (English) is a well-supported secondary mode.

### Practical Implications

#### 1. Use Logical Properties Everywhere

```typescript
// ✅ Correct — maps to the right physical side in both RTL and LTR
{ paddingStart: 16, paddingEnd: 8 }
{ borderStartWidth: 2, borderStartColor: colors.primary }
{ marginStart: 12 }

// ❌ Wrong — hardcodes physical side; breaks in RTL
{ paddingLeft: 16, paddingRight: 8 }
{ borderLeftWidth: 2 }
{ marginLeft: 12 }
```

#### 2. Use `start`/`end` for Text Alignment

```typescript
// ✅ Correct
{ textAlign: locale === 'en' ? 'left' : 'right' }
// or via the locale-aware helper:
const { align } = useTextAlign(); // 'right' in ar/ckb, 'left' in en

// ❌ Wrong (inside Arabic UI)
{ textAlign: 'left' }
```

#### 3. RTL-Safe Animations

Slide animations must respect text direction. A "push forward" animation in LTR slides new content in from the right. In RTL, the new content comes from the left.

```typescript
// ✅ Correct: Expo Router handles this automatically for screen transitions.

// ✅ Correct: custom slide (e.g., a drawer)
const slideIn = useRef(new Animated.Value(I18nManager.isRTL ? -DRAWER_WIDTH : DRAWER_WIDTH)).current;

// ❌ Wrong: hardcoded direction
const slideIn = useRef(new Animated.Value(DRAWER_WIDTH)).current;
```

Bottom sheets always slide from the bottom — they have no left/right axis, so they are direction-neutral.

#### 4. Icon Mirroring

Direction-conveying icons are mirrored in RTL. Non-direction icons are not.

| Icon | Mirror in RTL? | Rationale |
|------|---------------|-----------|
| Back arrow (←) | ✅ Yes → becomes → | "Back" means the opposite direction in RTL |
| Forward arrow (→) | ✅ Yes → becomes ← | |
| Chevron right (>) | ✅ Yes → becomes < | "More" / "next" meaning |
| Chevron left (<) | ✅ Yes → becomes > | |
| Turn right arrow | ✅ Yes | Navigation: left/right maneuver icons |
| Turn left arrow | ✅ Yes | |
| Star (rating) | ❌ No | No direction |
| Heart (like) | ❌ No | No direction |
| Camera | ❌ No | |
| Pin/location | ❌ No | |
| Check mark | ❌ No | |

Mirroring is done with `scaleX(-1)`:

```typescript
const isRTL = I18nManager.isRTL;
<ChevronRightIcon
  style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}
/>
```

#### 5. Tab Bar Order

The tab bar order reverses in RTL. In Arabic, the most important or most frequently used tab is the **rightmost** tab (the first tab in the RTL reading direction).

```
LTR order: [Map] [Discover] [Assistant] [Messages] [Account]
RTL order: [Account] [Messages] [Assistant] [Discover] [Map]
              ←  rightmost in RTL = first/primary in RTL reading direction  →
```

Expo Router `(tabs)` layout reverses tab order automatically when `I18nManager.isRTL` is `true`. No manual reversal needed.

#### 6. Horizontal Scroll Direction

Horizontally scrollable lists (category filter bar, photo carousel) scroll in the correct direction for the locale:

- RTL: scroll starts at the right end, moves left to reveal more.
- LTR: scroll starts at the left end, moves right.

React Native's `FlatList` and `ScrollView` handle this automatically when `I18nManager.isRTL` is `true`. No `inverted` prop needed.

#### 7. Numbers in RTL Text

Arabic numbers (Arabic-Indic numerals ٠١٢٣٤٥٦٧٨٩) are used for prices and counts in the Arabic locale. Western numerals (0123456789) are used for technical values (coordinates, zoom levels, dates).

See ADR-0013 for the full numeral decision.

Distance values inside navigation instruction strings always use Western numerals wrapped in a LTR span, because they are directional/technical:

```tsx
<Text>
  {'انعطف يميناً بعد '}
  <Text style={{ writingDirection: 'ltr' }}>450</Text>
  {' م'}
</Text>
```

#### 8. Form Input Direction

Text inputs for user-typed content use `textAlign: 'right'` and `writingDirection: 'rtl'` in Arabic and Kurdish. They switch to `textAlign: 'left'` and `writingDirection: 'ltr'` when the user types Latin characters (detected via `onChangeText` with a Unicode script check).

URL and phone inputs are always LTR regardless of locale.

#### 9. Map Compass and Controls

The MapLibre map itself does not flip — geographic north stays up and east stays right regardless of locale. Map controls (zoom buttons, compass, location button) are positioned on the **start** side (right in RTL, left in LTR) unless a layout constraint requires otherwise.

---

## Consequences

### Positive

- Arabic and Kurdish users get a natural, high-quality experience.
- Most layout bugs are caught early because RTL is tested by default.
- The codebase accumulates RTL-safe patterns from the start, making it easier for new contributors.

### Negative / Trade-offs

- English users see a slightly non-standard layout for some components (e.g., tab bar order, text alignment). This is acceptable given the user base.
- Contributors from LTR-first backgrounds must learn to use logical properties. ESLint rules enforce this, but there is an onboarding cost.
- Some third-party components do not support RTL properly and need wrappers or replacements. This is documented in `packages/ui` for each such case.
- Maestro E2E tests must be written to work in RTL (the emulator locale is `ar-IQ` by default in CI).

### Neutral

- Expo Router handles screen transition direction automatically — no custom logic needed.
- MapLibre Native maps are locale-neutral — no impact.
- Backend APIs are locale-neutral — responses include all locale strings and the client picks the right one.

---

## Verification

Before any PR is merged:

1. Run the app in Arabic locale: `EXPO_PUBLIC_DEFAULT_LOCALE=ar pnpm start`.
2. Visually verify every new screen for RTL layout.
3. ESLint rule `no-left-right-style` (from `packages/tooling/eslint-config`) fails the build if `left`/`right` style properties are used in component files.
