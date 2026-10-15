---
id: M182
slug: registration-step-dots
owned_paths:
  - mobile-features/provider/src/screens/ProviderRegistrationScreen.tsx
---

# M182 — Visual step-progress dots in provider registration wizard

## Features
- Replaced plain "Step X of 4" text with animated pill-shaped dot indicators.
- Active step dot is wider (pill shape, primary blue); inactive dots are grey circles.
- `accessibilityRole="progressbar"` and `accessibilityLabel` keep the screen reader experience.

## Acceptance criteria
- [x] Four dots shown, active dot highlighted
- [x] Dots update as the user advances through the wizard
- [x] Accessible: progressbar role with label
- [x] All 40 provider tests pass, lint and typecheck clean
