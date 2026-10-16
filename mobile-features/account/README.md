# @iraq-maps/feature-account

The «حسابي» (Account) tab — user profile, settings, auth flow (OTP login/logout), and notification
preferences.

---

## What This Package Does

- OTP login flow: phone entry → 6-digit code verification → account created or resumed.
- Displays the current user's name, locale, and roles.
- Lets users update their display name and preferred language.
- Notification preferences: toggle each notification category on or off.
- Account deletion with confirmation dialog.
- Dev settings overlay (visible only when `APP_ENV=development`): API URL, mock toggles.

---

## Key Screens and Components

### Screens

| Export                      | Route                    | Description                                              |
|-----------------------------|--------------------------|----------------------------------------------------------|
| `AccountScreen`             | `/account`               | Profile summary + settings menu                          |
| `AuthScreen`                | `/auth`                  | Phone input → OTP entry → logged in                     |
| `EditProfileScreen`         | `/account/edit`          | Edit name and locale                                     |
| `NotificationPrefsScreen`   | `/account/notifications` | Toggle notification categories                           |
| `DeleteAccountScreen`       | `/account/delete`        | Confirmation and account deletion                        |

### Components

| Component              | Description                                                     |
|------------------------|-----------------------------------------------------------------|
| `PhoneInput`           | Iraqi phone input with `+964` prefix, normalises 07XX format   |
| `OtpInput`             | 6-box digit entry with auto-advance and paste support           |
| `ResendTimer`          | Countdown until the «أعد الإرسال» button is enabled            |
| `LocalePicker`         | Select language (Arabic / Kurdish / English)                    |
| `NotificationToggle`   | Toggle row with label + switch                                  |
| `RoleChip`             | Visual badge for provider / moderator / admin roles             |

---

## Ports Consumed

| Port                     | Package                | Used for                                              |
|--------------------------|------------------------|-------------------------------------------------------|
| `authContract`           | `@iraq-maps/contracts` | OTP request, verify, refresh, logout                  |
| `meContract`             | `@iraq-maps/contracts` | Get and update profile, delete account                |
| `notificationsContract`  | `@iraq-maps/contracts` | Get and update notification preferences               |
| `useSession`             | `@iraq-maps/mobile-kit`| Read and write tokens + user object                   |

---

## Auth Flow

```
/auth
  ├─ PhoneInputStep     → POST /v1/auth/otp/request
  └─ OtpVerifyStep      → POST /v1/auth/otp/verify
                             ├─ success → login() → navigate to / (map tab)
                             └─ error   → show error, allow retry
```

On successful login, `useSession().login(tokens, user)` stores tokens in `expo-secure-store` and sets the
session in memory. The `AuthGate` in `apps/mobile/src/shell/` immediately lifts and shows the tabs.

---

## i18n Namespaces

Namespace: `feature-account`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `auth.*` — phone label, send code, verify, resend, errors
- `profile.*` — name, locale, roles, edit
- `notifications.*` — preference category labels
- `delete.*` — confirmation dialog
- `error.*` — OTP expired, invalid, rate limited

---

## How to Test

```bash
cd mobile-features/account
pnpm test
```

Key test files:

- `PhoneInput.test.tsx` — normalises 07XX, validates format, rejects non-Iraqi numbers
- `OtpInput.test.tsx` — auto-advance, paste handling, backspace
- `AuthScreen.test.tsx` — full OTP flow with mocked API client
- `NotificationPrefsScreen.test.tsx` — toggle state, optimistic update, error rollback

E2E:

```bash
maestro test mobile-features/account/maestro/login.yaml
maestro test mobile-features/account/maestro/edit-profile.yaml
```
