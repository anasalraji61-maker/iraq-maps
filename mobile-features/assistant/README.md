# @iraq-maps/feature-assistant

The «المساعد» (assistant) tab: an Arabic-first conversational AI guide for places, prices, and directions in Iraq.

## Screens

- `AssistantScreen` (`/assistant`, a tab): a chat interface where users ask questions in Arabic (or Kurdish/English). The assistant responds with text and optional embedded place cards that link to the map.
- Includes a daily usage counter and a limit-reached UX that shows a reset time.
- The "copy message" action copies the assistant's reply to the clipboard.
- Conversation history is stored per-session in device storage; a clear-history button resets it.

## Hooks

- `useAssistantSession()` — manages session state (messages, loading, error) and handles streaming responses.
- `useAssistantLimit()` — tracks the daily token/request budget from the server response headers.

## Client

`src/client.ts` wraps `POST /v1/assistant/chat` — sends messages and receives streamed responses.

## Ports and dependencies

- Consumes `useApi`, `useSession` from `@iraq-maps/mobile-kit`.
- Consumes `@iraq-maps/ui` components, `@iraq-maps/i18n` strings.
- Uses `AssistantMessage`, `AssistantRequest` schemas from `@iraq-maps/contracts`.
- The LLM is invoked server-side; the mobile package never holds an API key.

## Strings

All strings are in the `assistant` namespace, in `src/i18n/{ar,ckb,en}.json`. `src/strings.test.ts` checks locale parity.

## Tests

`pnpm --filter @iraq-maps/feature-assistant test` runs jest-expo tests including session storage helpers.

Maestro: `maestro/assistant.yaml` tests the assistant chat end-to-end.

## Env vars

None (all LLM keys are on the server side, read through `packages/config`).
