# @iraq-maps/feature-provider

The «مزودو الخدمات» (provider) feature: business registration, dashboard, inbox management, and place ownership.

## Screens

- `ProviderRegistrationScreen` (`/provider/register`): multi-step registration (with step-progress dots) — business name, category, location, phone, photos, hours. Submits to `POST /v1/providers`.
- `ProviderDashboardScreen` (`/provider/dashboard`): overview of active listings, recent inquiries, unread messages, and a verified badge when the account is verified.
- `ProviderInboxScreen` (`/provider/inbox`): list of received user inquiries with status badges. Supports skeleton loading and pull-to-refresh.
- `InquiryDetailScreen` (`/provider/inbox/[id]`): full inquiry thread; provider can reply, mark resolved, or close.
- `EarningsScreen` (`/provider/earnings`): earnings tracker (reserved for a later phase; currently shows a placeholder).
- `ReviewResponseScreen` (`/provider/reviews`): allows providers to post a public response to user reviews.

## Components (in `src/components/`)

- `VerifiedBadge` — a blue tick shown on verified provider profiles.
- `Skeleton` (`src/skeleton.tsx`) — shared skeleton loader for all provider screens.

## Hooks / utilities

- `src/request.ts` — wraps the provider API calls with session-aware error handling.
- `src/phone.ts` — phone number normalizer used during registration (same rules as `feature-account`).
- `src/messaging-api.ts` — wrapper for provider-side messaging endpoints.

## API endpoints consumed

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/providers` | register a new provider |
| GET | `/v1/providers/me` | fetch own dashboard |
| GET | `/v1/providers/me/inquiries` | list received inquiries |
| GET | `/v1/providers/me/inquiries/:id` | inquiry detail |
| POST | `/v1/providers/me/inquiries/:id/reply` | send a reply |
| PATCH | `/v1/providers/me/inquiries/:id` | update status |
| GET | `/v1/providers/me/reviews` | list reviews |
| POST | `/v1/providers/me/reviews/:id/response` | post a review response |

## Ports and dependencies

- Consumes `useApi`, `useSession`, asset upload from `@iraq-maps/mobile-kit`.
- Consumes `@iraq-maps/ui`, `@iraq-maps/i18n`.
- Uses `Provider`, `ProviderRegistration`, `Inquiry` schemas from `@iraq-maps/contracts`.

## Strings

All strings are in the `provider` namespace, in `src/i18n/{ar,ckb,en}.json`. `src/strings.test.ts` checks locale parity.

## Tests

`pnpm --filter @iraq-maps/feature-provider test`

Maestro: `maestro/provider-register.yaml` tests the registration flow end-to-end.
