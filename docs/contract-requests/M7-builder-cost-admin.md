# Contract Request — M7 builder-cost-admin

**Requested by:** builder-cost-admin  
**Date:** 2026-10-14  
**File:** `packages/contracts/src/assistant.ts`

## Change requested

Add `focusPlaceIds?: PlaceId[]` (max 5) to `AssistantResponse`, replacing the existing
single `focusPlaceId?: PlaceId` field. Keep `focusPlaceId` for backwards compat.

```ts
// packages/contracts/src/assistant.ts — AssistantResponse additions
focusPlaceIds: z.array(PlaceId).max(5).optional(),
```

## Reason

The assistant now surfaces up to 5 places from `search_places` on the map, and the
"plan my day" feature returns an ordered itinerary of 3–5 places. A single `focusPlaceId`
is insufficient.

## Backwards compat

The old `focusPlaceId` field is kept (optional) so any client that reads only the first
pin keeps working without a code change.
