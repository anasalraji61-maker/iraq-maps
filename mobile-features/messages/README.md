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
| `InquiryCard`        | Summary card showing message preview + status             |
| `DeliveryTarget`     | Per-place status badge + handoff link button              |
| `HandoffLinkButton`  | Opens the WhatsApp/Instagram/phone URL; shows copyable Arabic text |
| `ComposeForm`        | Text area (max 500 chars) + char counter + send button    |
| `PlacePicker`        | Multi-select place picker: search + add up to 5 places    |
| `ReplyForm`          | Provider reply input (max 1000 chars)                     |

---

## Ports Consumed

| Port                  | Package                | Used for                                       |
|-----------------------|------------------------|------------------------------------------------|
| `messagingContract`   | `@iraq-maps/contracts` | Create and list inquiries, provider reply      |
| `placesContract`      | `@iraq-maps/contracts` | Place search in the compose place picker       |
| `notificationsContract` | `@iraq-maps/contracts` | Badge count for unread inquiries             |

---

## Key Flows

### User sending an inquiry

1. User taps «تواصل» on a place card → opens `ComposeScreen` with `placeIds` pre-filled.
2. User types message text (1–500 chars) → taps «إرسال».
3. `ComposeScreen` calls `POST /v1/inquiries` with `confirm: true` and an `Idempotency-Key`.
4. On success, navigates to `InquiryDetailScreen` showing initial `queued` status.
5. Delivery status updates arrive via push notifications (`messaging.inquiry.status_changed.v1`).

### Provider replying

1. Provider opens `ProviderInboxScreen` → taps an inquiry.
2. `InquiryDetailScreen` (provider view) shows the customer's message and a reply form.
3. Provider submits reply → `POST /v1/provider/inquiries/:id/reply`.

---

## i18n Namespaces

Namespace: `feature-messages`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `inbox.*` — tab title, empty state
- `compose.*` — placeholder, char counter, send, confirm dialog
- `status.*` — delivery status labels (queued / sent / delivered / read / replied / failed / handed_off)
- `handoff.*` — handoff link labels and copy-text instructions
- `provider.*` — provider inbox and reply UI
- `error.*` — daily limit, network error

---

## How to Test

```bash
cd mobile-features/messages
pnpm test
```

Key test files:

- `ComposeForm.test.tsx` — char limit, empty state, idempotency key generation
- `DeliveryTarget.test.tsx` — status badge rendering, handoff link action
- `InquiryCard.test.tsx` — preview text truncation, unread indicator

E2E flows:

```bash
maestro test mobile-features/messages/maestro/send-inquiry.yaml
maestro test mobile-features/messages/maestro/provider-reply.yaml
```
