# @iraq-maps/feature-messages

The «رسائل» (Messages) tab — lets users send inquiries to businesses (places) and track delivery status. The
messaging engine selects the best channel for each recipient: in-app, WhatsApp, or a handoff link.

---

## What This Package Does

- Shows the user's sent inquiries and their delivery status per place.
- Provides a compose screen where the user types a message and selects up to 5 destination places.
- Displays per-place delivery status: queued → sent → delivered → read → replied / handed_off / failed.
- When a place uses WhatsApp and has granted `whatsapp_messages` consent, the message is sent as a
  WhatsApp Cloud API message. Otherwise a handoff link is shown (wa.me, Instagram, or phone).
- Provider view: a separate inbox screen for providers to read and reply to received inquiries.
- Drafts are auto-saved to `AsyncStorage` so a partial message survives app kills.
- Unsent inquiries are queued offline and flushed when connectivity is restored (ADR-0012).
- Idempotency: every send uses a stable UUID key to prevent duplicate inquiries on retry.

---

## Key Screens and Components

### Screens

| Export                | Route                      | Description                                            |
|-----------------------|----------------------------|--------------------------------------------------------|
| `MessagesScreen`      | `/messages`                | Tab: list of sent inquiries                            |
| `InquiryDetailScreen` | `/messages/[id]`           | One inquiry with per-target status and handoff links   |
| `ComposeScreen`       | `/messages/compose`        | Message composer + place picker                        |
| `ProviderInboxScreen` | `/provider/inbox`          | Provider view: received inquiries + reply action       |

### Components

| Component            | Description                                               |
|----------------------|-----------------------------------------------------------|
| `InquiryCard`        | Summary card showing message preview + status badge       |
| `DeliveryTargetRow`  | Per-place status badge + handoff link button              |
| `HandoffLinkButton`  | Opens the WhatsApp/Instagram/phone URL; shows copyable Arabic text |
| `ComposeForm`        | Text area (max 500 chars) + live char counter + send button |
| `PlacePicker`        | Multi-select place picker: search + add up to 5 places    |
| `ReplyForm`          | Provider reply input (max 1000 chars)                     |
| `StatusBadge`        | Colour-coded chip per `MessageStatus`                     |
| `QueuedBadge`        | «سيُرسل عند الاتصال» indicator for offline-queued inquiries |

### Status Badge Colours

| Status | Label AR | Color |
|--------|----------|-------|
| `queued` | في الانتظار | Grey |
| `sent` | أُرسل | Blue |
| `delivered` | وصل | Teal |
| `read` | قُرئ | Green |
| `replied` | تمّ الرد | Gold |
| `handed_off` | تمّ التحويل | Purple |
| `failed` | فشل | Red |

---

## Ports Consumed

| Port                    | Package                | Used for                                       |
|-------------------------|------------------------|------------------------------------------------|
| `messagingContract`     | `@iraq-maps/contracts` | Create and list inquiries, provider reply      |
| `placesContract`        | `@iraq-maps/contracts` | Place search in the compose place picker       |
| `notificationsContract` | `@iraq-maps/contracts` | Badge count for unread inquiries               |
| `mobile-kit`            | `@iraq-maps/mobile-kit`| `OutgoingQueue` for offline send, `useAutosave` for drafts |

---

## Environment Variables

None directly. All API calls go through `@iraq-maps/api-client`.

---

## Key Flows

### User Sending an Inquiry

1. User taps «تواصل» on a place card → opens `ComposeScreen` with `placeIds` pre-filled.
2. User types message text (1–500 chars) → taps «إرسال».
3. If online: `ComposeScreen` calls `POST /v1/inquiries` with `confirm: true` and a stable `Idempotency-Key`.
4. If offline: the inquiry is added to `OutgoingQueue`; a `QueuedBadge` is shown.
5. On success, navigates to `InquiryDetailScreen` showing initial `queued` status.
6. Delivery status updates arrive via push notifications (`messaging.inquiry.status_changed.v1`).

### Provider Replying

1. Provider opens `ProviderInboxScreen` → taps an inquiry.
2. `InquiryDetailScreen` (provider view) shows the customer's message and a reply form.
3. Provider submits reply → `POST /v1/provider/inbox/:id/reply`.

### Handoff Flow

When a place has no in-app messaging channel:

1. `InquiryDetailScreen` shows a `HandoffLinkButton` per target.
2. Button opens the `wa_me` / `ig_me` / `tel` URL.
3. A copyable Arabic text (`copyText` from `HandoffLink`) is shown below the button.

---

## Idempotency

The `ComposeScreen` generates a UUID once per compose session (`useRef(crypto.randomUUID())`). It is:
- Included as `Idempotency-Key` header on `POST /v1/inquiries`.
- Stored in the `OutgoingQueue` as the action `id` for offline sends.
- Reset only when the user clears the compose form and starts a new compose session.

Retrying a failed send (network error) reuses the same key — the server deduplicates safely.

---

## i18n Namespaces

Namespace: `feature-messages`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `inbox.*` — tab title, empty state, refresh
- `compose.*` — placeholder, char counter, send, confirm dialog, offline queued notice
- `status.*` — delivery status labels per `MessageStatus` value
- `handoff.*` — handoff link labels and copy-text instructions
- `provider.*` — provider inbox and reply UI
- `error.*` — daily limit, network error, retry

---

## How to Test

```bash
cd mobile-features/messages
pnpm test
```

Key test files:

- `ComposeForm.test.tsx` — char limit, empty state, idempotency key generation, draft save/restore
- `DeliveryTargetRow.test.tsx` — status badge rendering, handoff link action
- `InquiryCard.test.tsx` — preview text truncation, unread indicator, queued badge

E2E flows:

```bash
maestro test mobile-features/messages/maestro/send-inquiry.yaml
maestro test mobile-features/messages/maestro/provider-reply.yaml
```
