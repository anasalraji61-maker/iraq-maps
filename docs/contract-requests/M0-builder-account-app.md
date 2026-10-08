# M0 contract requests from builder-account-app

## Navigation contract (integrator: `apps/mobile/app`)

**Status: resolved (integrator, M0). All five route files exist as listed, and the root Stack picks up the four non-tab screens automatically.**

All five route names already exist in mobile-kit `routes` and in `apps/mobile/src/shell/available-routes.ts`. Each route
file is one line, e.g. `export { PhoneScreen as default } from '@iraq-maps/feature-account';`.

| Route name | Path | File | Export | Params |
|---|---|---|---|---|
| `account` | `/account` | `app/(tabs)/account.tsx` (replaces `PendingScreen`) | `AccountScreen` | none |
| `accountLanguage` | `/account/language` | `app/account/language.tsx` | `LanguageScreen` | none |
| `authPhone` | `/auth/phone` | `app/auth/phone.tsx` | `PhoneScreen` | none |
| `authOtp` | `/auth/otp` | `app/auth/otp.tsx` | `OtpScreen` | search params: `phone` (E.164 `+9647…`, required), `resendAfterSec` (integer string from the 202, optional; missing means resend is allowed at once) |
| `authName` | `/auth/name` | `app/auth/name.tsx` | `NameScreen` | none |

- The four non-tab screens belong to the root `Stack` (outside `(tabs)`), so they get a header with a back button.
- Calls the screens make: `push(href('authPhone'))`, `push({ pathname: href('authOtp'), params: { phone, resendAfterSec } })`,
  `replace(href('authName'))` for a new user, `dismissTo(href('account'))` after sign-in or after saving the name,
  `push(href('authName'))` to edit the name, `push(href('accountLanguage'))`, and `back()` after choosing a language.
- `apps/mobile/package.json` needs `"@iraq-maps/feature-account": "workspace:*"`. The feature declares `expo-router`,
  `react` and `react-native` as peer dependencies; the app already has them.

## 1. `testIDs.account.signIn` (additive, non-blocking)

**Status: resolved (integrator, M0). Added to `testIDs.account`. The integrator replaced the local constant in `src/AccountScreen.tsx` with `testIDs.account.signIn`.** The signed-out account tab shows a sign-in button that opens PhoneScreen. `testIDs` has no id for it,
so `src/AccountScreen.tsx` uses a local `const signInTestID = 'account.signIn'`, and `maestro/login.yaml` uses the same
string. Please add `signIn: 'account.signIn'` to `testIDs.account`; then the local constant becomes
`testIDs.account.signIn` (one line, no other change).

## 2. ESLint `i18next/no-literal-string` flags enum props (blocking lint for account, ui and the shell)

**Status: resolved (integrator, M0). Applied as proposed.** In `packages/tooling/eslint.config.js`, `mode: 'jsx-only'` checks every JSX attribute except the
plugin's short default list. So `variant="title"`, `tone="muted"`, `kind="error"`, `keyboardType="phone-pad"` and
`onPress={() => router.push(href('authName'))}` all fail, although none of them is user-facing text.
`pnpm --filter @iraq-maps/feature-account lint` fails with 21 such errors. `packages/ui/src` and `apps/mobile/src/shell`
fail the same way.

Proposed fix: check only the attributes that carry copy.

```js
'i18next/no-literal-string': ['error', { mode: 'jsx-only', 'jsx-attributes': { include: ['label', 'title', 'subtitle', 'body', 'message', 'error', 'placeholder', 'accessibilityLabel', 'accessibilityHint'] } }],
```

I verified this with a scratch config layered on the current one. `mobile-features/account`, `packages/ui/src` and
`apps/mobile/src` lint clean. `<Button label="Sign out" />` and JSX text such as `<Text>Hello</Text>` are still
reported. The Arabic-literal `no-restricted-syntax` rule and `packages/tooling/test/eslint.test.ts` are unaffected.

## 3. For information: what the feature relies on beyond the frozen stubs

- `@iraq-maps/i18n`:
  - `formatNumber`, used for the resend countdown, which shows Arabic-Indic digits in ar and ckb.
  - `assertKeyParity`, used by the parity test.
  - `{param}` interpolation.

  All three come from builder-ui-i18n's implementation; none is in the frozen stub.
- `Session.signOut()` clears the local session first, then revokes on the server best-effort with `POST /v1/auth/logout`,
  as `packages/mobile-kit/src/session.tsx` does now. Logout after `DELETE /v1/me` relies on this: the tokens are already
  revoked by then, and logout must not block.
- `PATCH /v1/me` returns the updated `Me`. The feature passes it to `session.updateUser`.
- Sign-in sends the app's current locale with `POST /v1/auth/otp/request`. The feature does not apply `user.locale` from
  verify, so the app language stays as the user last chose on this device.
