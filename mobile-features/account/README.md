# @iraq-maps/feature-account

The «حسابي» (account) feature: phone sign-in with OTP, the profile name, the app language, sign-out and account deletion.

## Screens

The package exports five screens, each re-exported by one route file in `apps/mobile/app`:

- `PhoneScreen` (`/auth/phone`): takes an Iraqi mobile number, normalizes it and requests a code.
  - Accepts `07xxxxxxxxx`, `+9647xxxxxxxxx` or `009647…`, in ASCII or Arabic-Indic digits.
  - Sends `+9647…` to the server.
  - Calls `POST /v1/auth/otp/request`.
- `OtpScreen` (`/auth/otp?phone=…&resendAfterSec=…`): takes the 6-digit code.
  - Resend waits for the server's `resendAfterSec` (60s).
  - Calls `POST /v1/auth/otp/verify`, then `session.signIn`.
  - A new user goes on to NameScreen; anyone else goes back to the account tab.
- `NameScreen` (`/auth/name`): sets or edits the name with `PATCH /v1/me`.
- `AccountScreen` (`/account`, a tab):
  - Signed in: shows the name and the language, with sign-out and account deletion. Deletion needs an explicit
    confirmation sheet, then calls `DELETE /v1/me` and `session.signOut`.
  - Signed out: shows a sign-in entry and the language picker.
- `LanguageScreen` (`/account/language`): chooses ar, ckb or en.
  - When signed in, saves the choice with `PATCH /v1/me` first.
  - Then calls `setLocale`. The shell persists the locale and handles the RTL reload.

Server Problem codes are shown as localized messages under `errors.*`: `otp_invalid`, `otp_expired`,
`otp_too_many_attempts`, `otp_locked`, `otp_rate_limited`, `otp_resend_too_soon`, `invalid_request` and `unauthorized`.
Any other failure shows a generic message, and an unreachable server shows a network message.

## Ports and dependencies

- Consumes `useApi`, `useSession`, `href` and `renderWithProviders` from `@iraq-maps/mobile-kit`.
- Consumes the UI components from `@iraq-maps/ui`, and `t`, `setLocale`, `getLocale` and `formatNumber` from
  `@iraq-maps/i18n`.
- Calls the `auth` and `me` routes of the API contract through `useApi`, and uses `testIDs` and `Locale` from
  `@iraq-maps/contracts`.
- Navigates with `expo-router`, which is a peer dependency.
- Provides no ports and needs no env vars.

## Strings

All strings are in the `account` namespace, in `src/i18n/{ar,ckb,en}.json`. `test/i18n.test.ts` checks that the three
locales have the same keys and placeholders.

## Tests

- `pnpm --filter @iraq-maps/feature-account test` runs jest-expo and RNTL. expo-router is mocked in `test/setup.ts`.
- `maestro/login.yaml` is the end-to-end login flow. It needs a server with `OTP_SENDER=fixed`, and the flow file
  documents its env vars `PHONE`, `OTP_CODE` and `NAME`.
