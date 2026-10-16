# @iraq-maps/feature-provider

Provider mode — lets businesses claim a place, upload photos, set prices and hours, manage consent scopes,
and receive inquiries from users.

---

## What This Package Does

- Provider registration flow: select a place → enter business details → submit for admin verification.
- Provider dashboard: profile status, photos, prices, social links, hours.
- Consent management: grant or revoke each data scope (photos, phone, WhatsApp, social links, prices).
- Provider inbox: view received user inquiries and reply.
- Status display: draft / pending / verified / suspended with next-action guidance.

---

## Key Screens and Components

### Screens

| Export                        | Route                       | Description                                          |
|-------------------------------|-----------------------------|------------------------------------------------------|
| `ProviderRegisterScreen`      | `/provider/register`        | Multi-step registration: place → details → submit    |
| `ProviderDashboardScreen`     | `/provider/dashboard`       | Overview: status, quick stats, shortcuts             |
| `ProviderProfileEditScreen`   | `/provider/profile`         | Edit name, description, hours, social, prices        |
| `ProviderPhotosScreen`        | `/provider/photos`          | Upload, reorder and delete photos                    |
| `ProviderConsentsScreen`      | `/provider/consents`        | Toggle consent scopes                                |
| `ProviderInboxScreen`         | `/provider/inbox`           | Received inquiries (also in feature-messages)        |

### Components

| Component              | Description                                              |
|------------------------|----------------------------------------------------------|
| `StatusBanner`         | Coloured banner: pending / verified / suspended + action |
| `PhotoGrid`            | Draggable photo grid with add/delete                     |
| `PriceRangeRow`        | Price range input (label, min, max, currency)            |
| `SocialLinkRow`        | Platform picker + URL input                              |
| `ConsentToggle`        | Toggle row with scope description and consequences       |
| `PlaceSearchStep`      | Registration step 1: search and select the place to claim|
| `BusinessDetailsForm`  | Registration step 2: name, category, description         |

---

## Ports Consumed

| Port                    | Package                | Used for                                         |
|-------------------------|------------------------|--------------------------------------------------|
| `providersContract`     | `@iraq-maps/contracts` | CRUD provider profile, consents, photos, submit  |
| `mediaContract`         | `@iraq-maps/contracts` | Upload provider photos                           |
| `placesContract`        | `@iraq-maps/contracts` | Place search in registration step 1              |
| `messagingContract`     | `@iraq-maps/contracts` | Provider inbox and reply                         |

---

## Registration Flow

```
ProviderRegisterScreen
  Step 1: PlaceSearchStep     → search and select a place
  Step 2: BusinessDetailsForm → name, category, description
  Step 3: Review & Submit     → POST /v1/providers
                               → POST /v1/providers/me/submit
                               → Status: pending
```

After submission the profile status becomes `pending`. An admin verifies it (via `apps/admin`). When
`verified`, the provider appears in `PlaceDetails.provider` responses with their consented data.

---

## Consent Scopes

| Scope               | What it shows publicly                                        |
|---------------------|---------------------------------------------------------------|
| `photos`            | Provider's photos on the place card                           |
| `social_links`      | Instagram, Facebook, etc. links on the place card             |
| `show_phone`        | Business phone number on the place card                       |
| `show_prices`       | Price ranges on the place card                                |
| `whatsapp_messages` | Enables direct WhatsApp delivery for user inquiries           |

Revoking a scope hides that data from the next API response immediately; no cache clearing needed.

---

## i18n Namespaces

Namespace: `feature-provider`

| File        | Language       |
|-------------|----------------|
| `ar.json`   | Arabic         |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English        |

Key string groups:

- `register.*` — step labels, validation, submit
- `status.*` — draft / pending / verified / suspended messages
- `profile.*` — edit fields
- `consent.*` — scope names, descriptions, consequences of revoking
- `photo.*` — upload, limit, reorder
- `price.*` — currency labels, range validation

---

## How to Test

```bash
cd mobile-features/provider
pnpm test
```

Key test files:

- `ConsentToggle.test.tsx` — grant/revoke, optimistic update, error rollback
- `PhotoGrid.test.tsx` — upload flow, max 10 photos limit, delete
- `ProviderRegisterScreen.test.tsx` — step navigation, validation, submit
- `PriceRangeRow.test.tsx` — min ≤ max validation, currency selection

E2E:

```bash
maestro test mobile-features/provider/maestro/register.yaml
maestro test mobile-features/provider/maestro/manage-consents.yaml
```
