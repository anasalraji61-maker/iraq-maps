# @iraq-maps/feature-messages

The «الرسائل» (messages) tab: peer-to-peer messaging between users and providers, including inquiry threads.

## Screens

- `InboxScreen` (`/messages`, a tab): conversation list with last message, unread badge, and online/typing indicator. Supports swipe-to-archive and conversation search.
- `ConversationScreen` (`/messages/[id]`): full thread with text messages, image/file attachments, emoji reactions, read receipts, and a typing indicator banner.
- `NewMessageScreen` (`/messages/new`): start a conversation — search for a provider or user by name.

## Hooks (in `src/hooks/`)

- `useConversations()` — paginated inbox list; handles real-time updates via polling.
- `useMessages(conversationId)` — message stream for one thread; appends outgoing messages optimistically.
- `useTypingIndicator(conversationId)` — debounced publish + subscribe for typing events.
- `useReadReceipts(conversationId)` — marks messages read on scroll; reads receipt state.

## Components (in `src/components/`)

- `MessageBubble` — a single message with sender avatar, timestamp, reaction row, and read-receipt tick.
- `AttachmentPicker` — opens the media picker and uploads the file via `@iraq-maps/mobile-kit`'s asset upload flow.
- `ReactionPicker` — emoji quick-pick sheet.

## Client

`src/client.ts` wraps:
- `GET /v1/messages` — inbox list
- `GET /v1/messages/:id` — conversation thread
- `POST /v1/messages/:id/send` — send a message
- `POST /v1/messages/:id/react` — add/remove a reaction
- `PATCH /v1/messages/:id/archive` — archive a conversation

## Ports and dependencies

- Consumes `useApi`, `useSession`, upload helpers from `@iraq-maps/mobile-kit`.
- Consumes `@iraq-maps/ui`, `@iraq-maps/i18n`.
- Uses `Message`, `Conversation`, `Reaction` schemas from `@iraq-maps/contracts`.
- `@react-native-community/netinfo` is used for offline detection (declared in `src/netinfo.ts`).

## Strings

All strings are in the `messages` namespace, in `src/i18n/{ar,ckb,en}.json`. `src/strings.test.ts` checks locale parity.

## Tests

`pnpm --filter @iraq-maps/feature-messages test` runs jest-expo tests for hooks and components.
