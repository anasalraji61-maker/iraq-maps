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
- Daily usage counter with a limit-reached UX that shows a reset time.
- Clear-history button resets the session.

---

## Key Screens and Components

### Screens

| Export               | Route        | Description                                            |
|----------------------|--------------|--------------------------------------------------------|
| `AssistantScreen`    | `/assistant` | Main chat tab                                          |
| `TripPlanScreen`     | `/assistant/trip-plan` | Structured trip planner form + result view   |

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

---

## Ports Consumed

| Port                   | Package                | Used for                                            |
|------------------------|------------------------|-----------------------------------------------------|
| `assistantContract`    | `@iraq-maps/contracts` | `POST /v1/assistant/chat`, trip plan, session list  |
| `placesContract`       | `@iraq-maps/contracts` | Resolve place names for `focusPlaceIds` chips       |

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

The session ID is persisted to `AsyncStorage` so the conversation survives app restarts. Clearing history
calls `DELETE /v1/assistant/sessions/:sessionId` and resets the local state.

The daily limit is tracked by `useAssistantLimit()`:

```typescript
const { remaining, resetsAt, isAtLimit } = useAssistantLimit();
```

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

The `MapScreen` in `feature-map` handles this param and pans/zooms to the places.

---

## i18n Namespaces

Namespace: `feature-assistant`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `chat.*` — input placeholder, send button, copy, clear
- `limit.*` — daily limit banner, reset time message
- `trip.*` — trip planner form labels, interest chips, budget options
- `error.*` — network error, session error

---

## How to Test

```bash
cd mobile-features/assistant
pnpm test
```

Key test files:

- `assistant.test.tsx` — message send, loading state, error handling, daily limit
- `features.test.tsx` — focusPlaceIds navigation, composeParams button
- `TripPlanForm.test.tsx` — date validation (start before end), interests limit

E2E:

```bash
maestro test mobile-features/assistant/maestro/chat.yaml
maestro test mobile-features/assistant/maestro/trip-plan.yaml
```
