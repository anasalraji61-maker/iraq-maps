# @iraq-maps/feature-assistant

The «المساعد» (Assistant) tab — an Arabic-first conversational AI guide for places, prices, and directions
in Iraq. Powered by Claude on the server side; the mobile app never holds an API key.

---

## What This Package Does

- Chat interface where users ask questions in Arabic (or Kurdish / English).
- The assistant responds with text and optional embedded place cards that link to the map tab.
- When the assistant identifies places to show, it passes `focusPlaceIds` back; the screen navigates the
  map tab to show those places.
- When the assistant wants to help the user contact a place, it passes `composeParams`; tapping «تواصل»
  opens the compose screen in feature-messages.
- Trip planning: a «خطط رحلتك» entry point that sends a structured `TripPlanRequest`.
- Recommendations: a curated list of places by category near the user's location.
- Daily usage counter with a limit-reached UX that shows a reset time.
- Clear-history button resets the session.
- Session ID persisted to `AsyncStorage` — conversation survives app restarts.
- Assistant chat requires network; a clear offline error state is shown without network.

---

## Key Screens and Components

### Screens

| Export               | Route                  | Description                                            |
|----------------------|------------------------|--------------------------------------------------------|
| `AssistantScreen`    | `/assistant`           | Main chat tab                                          |
| `TripPlanScreen`     | `/assistant/trip-plan` | Structured trip planner form + result view             |

### Components

| Component              | Description                                                    |
|------------------------|----------------------------------------------------------------|
| `ChatBubble`           | A single message (user or assistant), with copy action         |
| `PlaceChip`            | Tappable place name chip — navigates to place on map           |
| `ComposeButton`        | «تواصل» button — opens compose screen with pre-filled params   |
| `DailyLimitBanner`     | Shown when the daily limit is reached; shows reset time        |
| `TripPlanForm`         | Destination, dates, interests, budget, party size inputs       |
| `TripDayCard`          | One day of a trip plan: theme, activities, estimated cost      |
| `TypingIndicator`      | Animated dots while waiting for the assistant's reply          |
| `MessageInput`         | Text input + send button; auto-grows up to 5 lines             |
| `RecommendationCard`   | Place recommendation with AI reason and estimated price        |

---

## Ports Consumed

| Port                   | Package                | Used for                                            |
|------------------------|------------------------|-----------------------------------------------------|
| `assistantContract`    | `@iraq-maps/contracts` | `POST /v1/assistant/chat`, trip plan, session list  |
| `placesContract`       | `@iraq-maps/contracts` | Resolve place names for `focusPlaceIds` chips       |

---

## Environment Variables

None directly. All API calls go through `@iraq-maps/api-client`.

The assistant model is configured server-side via the `ASSISTANT_MODEL` env var in `packages/config`.
The mobile app never sees the model name or the API key.

---

## State and Session

Session state (messages, session ID, loading flag) is managed by `useAssistantSession()`:

```typescript
const {
  messages,       // AssistantMessage[]
  sessionId,      // string | null
  loading,        // boolean
  sendMessage,    // (text: string) => Promise<void>
  clearHistory,   // () => void
} = useAssistantSession();
```

The session ID is persisted to `AsyncStorage` under key `assistant_session_id` so the conversation
survives app restarts. Clearing history calls `DELETE /v1/assistant/sessions/:sessionId` and resets
the local state and `AsyncStorage`.

The daily limit is tracked by `useAssistantLimit()`:

```typescript
const { remaining, resetsAt, isAtLimit } = useAssistantLimit();
// remaining: number of messages left today
// resetsAt: ISO timestamp when the limit resets (midnight UTC)
// isAtLimit: boolean
```

When `isAtLimit` is `true`, `MessageInput` is disabled and `DailyLimitBanner` is displayed.

---

## Chat Bubble RTL Layout

In Arabic/Kurdish (RTL) locale, user and assistant bubble positions are swapped compared to LTR convention:

```
RTL layout (Arabic):
  ┌──────────────────────────────────────────┐
  │                [assistant bubble, right] │
  │ [user bubble, left]                      │
  └──────────────────────────────────────────┘
```

This matches the natural reading direction — the assistant speaks from the «start» side (right in RTL),
the user from the «end» side (left in RTL).

---

## Map Integration

When `AssistantResponse.focusPlaceIds` is non-empty, the screen pushes a navigation event to the map tab:

```typescript
// Inside AssistantScreen after receiving a response
if (response.focusPlaceIds?.length) {
  router.navigate({
    pathname: '/',
    params: { focusPlaceIds: response.focusPlaceIds.join(',') },
  });
}
```

The `MapScreen` in `feature-map` handles this param and pans/zooms to show the places.

When `AssistantResponse.composeParams` is non-null, a «تواصل» `ComposeButton` appears beneath the
assistant's message. Tapping it opens the compose screen:

```typescript
router.navigate({
  pathname: '/messages/compose',
  params: {
    text: response.composeParams.text ?? '',
    placeIds: (response.composeParams.placeIds ?? []).join(','),
  },
});
```

---

## Trip Planner

The `TripPlanScreen` provides structured inputs:

| Field | Control | Validation |
|-------|---------|------------|
| Destination | Text input | 1–200 chars |
| Start date | Date picker | Must be today or future |
| End date | Date picker | Must be after start date |
| Interests | Multi-select chips | 1–6 from: food, culture, shopping, nature, history, religious |
| Budget | Single-select: budget / mid / luxury | Required |
| Party size | Number picker 1–20 | Default 2 |

The result `TripPlanResponse` is rendered as a scrollable list of `TripDayCard` components, one per day.
Each card shows: day number, date, theme, activity list with times and estimated costs.

---

## i18n Namespaces

Namespace: `feature-assistant`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `chat.*` — input placeholder, send button, copy, clear, offline error
- `limit.*` — daily limit banner, reset time message
- `trip.*` — trip planner form labels, interest chips, budget options, result labels
- `recommend.*` — recommendations section title, AI reason label, price estimate label
- `error.*` — network error, session error

---

## How to Test

```bash
cd mobile-features/assistant
pnpm test
```

Key test files:

- `assistant.test.tsx` — message send, loading state, error handling, daily limit
- `features.test.tsx` — focusPlaceIds navigation, composeParams button rendering
- `TripPlanForm.test.tsx` — date validation (start before end), interests limit (max 6)
- `sessionPersistence.test.ts` — sessionId stored/restored from AsyncStorage

E2E:

```bash
maestro test mobile-features/assistant/maestro/chat.yaml
maestro test mobile-features/assistant/maestro/trip-plan.yaml
```
