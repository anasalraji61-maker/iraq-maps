---
id: M184
slug: nav-turn-arrow
owned_paths:
  - mobile-features/navigation/src/screens/ActiveNavigationScreen.tsx
---

# M184 — Turn arrow icon in active navigation instruction block

## Features
- `ActiveNavigationScreen` now shows a Unicode direction arrow (↑ ↗ → ↘ ↙ ← ↖) before the instruction text, derived from `currentManeuver.modifier`.
- Arrow is large (40px), primary-color, and hidden from accessibility tree (instruction text already covers this).

## Acceptance criteria
- [x] Arrow icon displayed for each maneuver direction
- [x] Defaults to ↑ (straight) when modifier is absent
- [x] All 48 navigation tests pass, lint and typecheck clean
