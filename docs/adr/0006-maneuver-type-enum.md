# ADR-0006: ManeuverType enum instead of Valhalla narrative text

Status: Accepted
Date: 2026-10-13

## Context
Valhalla returns free-text turn instructions in English. The app needs Arabic and Kurdish Sorani navigation instructions.

## Decision
Define a ManeuverType enum in packages/contracts with 13 values covering all navigation scenarios. The routing module maps Valhalla's 30+ numeric maneuver types to this enum. The navigation feature generates locale-specific instructions from the enum value.

## Consequences
- Navigation instructions work in ar, ckb, en without Valhalla locale support
- New maneuver types require both a contracts change and a routing module update
- Valhalla maneuver IDs 0 and any unknown ID map to ManeuverType.Continue
