# @iraq-maps/feature-activity

The «نشاطاتي» (activity) tab: shows the user's inbox — place inquiries sent to providers, and system notifications.

## Screens

- `ActivityScreen` (`/activity`, a tab): a tabbed view with two sub-tabs:
  - **Inquiries** — lists all inquiries the signed-in user has sent to providers, with status badges (`pending`, `replied`, `closed`). Tapping an inquiry opens the provider's inbox detail.
  - **Notifications** — aggregated notification feed (follows, comments, mentions, digest). Tapping a notification routes to the relevant screen.

## Hooks

- `useInquiries()` — fetches and refreshes the user's outbound inquiries via `GET /v1/inquiries`.
- `useNotifications()` — fetches the notification feed via `GET /v1/notifications`.

## Ports and dependencies

- Consumes `useApi`, `useSession` from `@iraq-maps/mobile-kit`.
- Consumes UI primitives from `@iraq-maps/ui`, strings from `@iraq-maps/i18n`.
- Reads `InquiryStatus`, `Notification` types from `@iraq-maps/contracts`.
- No outgoing ports. No env vars required.

## Strings

All strings are in the `activity` namespace, in `src/i18n/{ar,ckb,en}.json`. `src/strings.test.ts` checks locale parity.

## Tests

`pnpm --filter @iraq-maps/feature-activity test` runs jest-expo tests.
