# Iraq Smart Maps — Mobile E2E Tests

Maestro-based end-to-end tests for the Iraq Smart Maps Android app.
All user-facing text assertions use Arabic, matching the app's primary language.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Maestro CLI | ≥ 1.38 | `curl -Ls "https://get.maestro.mobile.dev" \| bash` |
| Android device / emulator | API 31+ | `adb devices` should list it |
| Iraq Maps APK | debug build | `pnpm android:precheck` then install the APK |
| Local API stack | running | `pnpm infra:local up` |

Environment variables required for every flow (set in `.env.e2e` or shell):

```
APP_ENV=e2e
OTP_SENDER=fixed
OTP_FIXED_CODE=123456
```

Optional overrides (each flow documents its own):

```
PHONE=07700000099       # Iraqi phone number (077/078/079)
OTP_CODE=123456
NAME=مستخدم الاختبار
```

---

## Running tests

### Run a single flow

```bash
maestro test e2e/mobile/maestro/onboarding.yaml
```

### Run all Maestro flows

```bash
maestro test e2e/mobile/maestro/
```

### Run via the shell helper (sets env, starts API stub)

```bash
bash e2e/mobile/run-flows.sh
```

### Run with a specific device

```bash
maestro --device emulator-5554 test e2e/mobile/maestro/booking-flow.yaml
```

### Run with env overrides

```bash
PHONE=07712345678 OTP_CODE=123456 \
  maestro test e2e/mobile/maestro/onboarding.yaml
```

---

## Recording a new flow

```bash
maestro record e2e/mobile/maestro/my-new-flow.yaml
```

Maestro watches your taps and generates YAML. Clean up the recording:
- Replace hardcoded text with `${ENV_VAR}` expressions.
- Replace generated `tapOn: {text: "…"}` with `tapOn: {id: …}` where a
  testID is available (check the component's `testID` prop).
- Add `extendedWaitUntil` before every `assertVisible` that follows a
  navigation action.
- Add `takeScreenshot` at each major state change.

---

## Test flows

### `onboarding.yaml`
Fresh install → phone login → OTP → name entry → verify all tabs.

Steps: 19 | Screenshots: 13

### `navigation-flow.yaml`
Login → search → open place card → request directions → route preview →
start navigation → recenter → stop.

Steps: 18 | Screenshots: 10

### `discover-post.yaml`
Login → Discover tab → create post → like → comment → delete post.

Steps: 16 | Screenshots: 13

### `provider-registration.yaml`
Login → account → register as provider → fill business details → submit →
verify pending status.

Steps: 14 | Screenshots: 9

### `booking-flow.yaml`
Login → find restaurant → tap Book → select date → select time →
confirm booking → verify appointment in profile → cancel option visible.

Steps: 19 | Screenshots: 16

Key assertions:
- `booking.datePicker` visible after tapping Book
- `booking.success` after confirm
- Arabic text: `تم الحجز بنجاح`
- Booking item visible in `account.bookings.list`

### `stories-flow.yaml`
Login → Discover → stories ring → open story → swipe through frames →
reply to story → verify sent → close → ring shows viewed state.

Steps: 22 | Screenshots: 15

Key assertions:
- `discover.stories.ring` on Discover tab
- `story.viewer.progress` progress bar
- `story.viewer.paused` on tap-to-pause
- Arabic confirmation: `تم إرسال ردك`
- `discover.stories.item.viewed` after viewing

### `collections-flow.yaml`
Login → search place → long-press → Save to Collection → create new
collection (Arabic name) → add second place → open Collections screen →
view detail → remove a place.

Steps: 24 | Screenshots: 22

Key assertions:
- `collection.picker` after long-press
- `collection.create.nameInput` for new collection
- `collections.screen` in account tab
- Place count decrements after remove

### `challenges-flow.yaml`
Login → Discover → Challenges section → challenge detail → start →
check in at a place to complete → claim reward → verify points in
reputation panel.

Steps: 21 | Screenshots: 18

Key assertions:
- `discover.challenges.section` on Discover feed
- `challenges.detail.progress.complete` after check-in
- `challenges.reward.claimed` modal
- Arabic: `تم الحصول على المكافأة`
- Points visible in `account.reputation.panel`

### `reviews-flow.yaml`
Login → find place → Write Review → 5-star rating → text body →
submit → see review in place detail → aggregate rating updated →
review in activity feed.

Steps: 23 | Screenshots: 18

Key assertions:
- `review.star.5.selected` after tapping 5th star
- `review.submitted` after submit
- Arabic: `تم نشر تقييمك`
- Review text visible in `place.reviews.section`
- Reviewer name matches logged-in user

### `provider-dashboard.yaml`
Login as approved provider → analytics dashboard → message inbox →
reply to message → update business hours → verify saved.

Steps: 26 | Screenshots: 23

Prerequisites: `PROVIDER_PHONE=07700000001` must be pre-approved in the
e2e seed DB (`APP_ENV=e2e` seed script inserts this account).

Key assertions:
- `account.providerStatus.approved`
- Analytics metrics: `provider.analytics.views`, `.messages`, `.rating`
- Outgoing message visible after reply
- Business hours `09:00` / `22:00` after save
- Arabic: `تم حفظ أوقات العمل`

### `offline-flow.yaml`
Login → offline maps settings → download Baghdad region → enable
simulate-offline → map shows cached tiles → search returns cached
results → AI assistant disabled offline → disable simulate-offline →
back online → delete downloaded region.

Steps: 22 | Screenshots: 16

Notes:
- Uses `offline.devToggle.simulateOffline` (only exposed when `APP_ENV=e2e`).
- For a real device network test replace the dev toggle with `adb shell
  svc wifi disable` / `adb shell svc data disable` and re-enable after.

Key assertions:
- `map.offlineBanner` visible when offline
- `map.tiles` not blank
- Search result visible from local cache
- `place.assistant.offline` when AI is unavailable
- Banner gone after coming back online

### `trip-planner-flow.yaml`
Login → map → Plan Trip → add 3 stops (search each) → optimize route →
save trip (Arabic name) → start navigation → trip stop counter in HUD →
stop → verify saved trip in account.

Steps: 23 | Screenshots: 17

Key assertions:
- `tripPlanner.routePreview` with 3 stops
- `tripPlanner.optimized` after optimization
- Arabic: `تم حفظ الرحلة`
- `navigation.tripStopCounter` during navigation
- Trip name visible in `account.savedTrips.list`

---

## Reusable helpers

Located in `e2e/mobile/maestro/helpers/`. Include them with `runFlow`:

```yaml
- runFlow: helpers/auth-helper.yaml
```

### `helpers/auth-helper.yaml`
Performs the full login flow (phone → OTP → name) and waits for the
authenticated state. Requires `PHONE`, `OTP_CODE`, `NAME` in the parent env.
Leaves the user on the map tab.

### `helpers/map-helper.yaml`
Navigates to the map tab, confirms `map.view` loads, checks OSM attribution
and search bar are visible. Requires authentication first.

### `helpers/place-helper.yaml`
Searches for `SEARCH_Q`, taps the first result, and confirms `place.card`
is open. Requires the map tab to already be active (run `map-helper` first).

---

## Element ID conventions

| Prefix | Scope |
|---|---|
| `tab.*` | bottom tab bar |
| `auth.*` | authentication screens |
| `map.*` | map screen |
| `place.*` | place card / detail |
| `navigation.*` | turn-by-turn navigation HUD |
| `discover.*` | Discover tab |
| `story.*` | story viewer |
| `collection.*` | collections picker / detail |
| `collections.*` | Collections list screen |
| `booking.*` | booking flow |
| `review.*` | review compose screen |
| `challenges.*` | challenges list / detail |
| `challenge.*` | in-flight challenge banner |
| `provider.*` | provider registration / dashboard |
| `offline.*` | offline maps settings |
| `tripPlanner.*` | trip planner screen |
| `account.*` | account tab menus |
| `activity.*` | activity feed tab |

---

## Screenshot output

Screenshots are saved to `~/.maestro/tests/<run-id>/screenshots/` by
default. The `run-flows.sh` script also copies them to
`e2e/mobile/screenshots/` for CI artifact upload.

---

## CI integration

The `android.yml` GitHub Actions workflow runs:

1. Build APK (`pnpm android:precheck`)
2. Start emulator (API 33)
3. Start local API (`APP_ENV=e2e pnpm start:api`)
4. `maestro test e2e/mobile/maestro/` with a 10-minute timeout

A Maestro cloud run (`maestro cloud`) can replace step 2–4 for real-device
testing. Set `MAESTRO_API_KEY` in GitHub secrets.
