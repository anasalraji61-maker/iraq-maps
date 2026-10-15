# Google Play Data Safety — Iraq Smart Maps

> Last updated: 2026-10-15
> Play Console section: App content → Data safety

This document is the source of truth for the Play Store Data Safety form answers. Fill in the form manually from this file.

---

## 1. Does your app collect or share any of the required user data types?

**Yes.**

## 2. Is all of the user data collected by your app encrypted in transit?

**Yes.** All client–server communication uses HTTPS. No cleartext traffic in production builds (`usesCleartextTraffic: false` in `app.config.ts` for production).

## 3. Do you provide a way for users to request that their data is deleted?

**Yes.** Users can delete their account and all associated data from the Account tab → Privacy → Delete account. The deletion URL is: `https://iraqmaps.iq/delete-account`.

---

## 4. Data types collected

### Phone number
| Field | Value |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or optional | Required (for OTP login) |
| Processing purpose | App functionality (authentication) |
| Ephemeral (not stored) | No — stored for account identification |
| Encrypted on device | N/A (stored on server, not device) |

### Approximate location
| Field | Value |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or optional | Optional (granted by user at runtime) |
| Processing purpose | App functionality (center map, sort search results, navigation) |
| Ephemeral | Yes — only sent per request, not stored persistently |

### Precise location
| Field | Value |
|---|---|
| Collected | Yes |
| Shared | No (coordinates are truncated to 4 decimal places in API logs per M7 privacy budget) |
| Required or optional | Optional |
| Processing purpose | App functionality (turn-by-turn navigation) |
| Ephemeral | Yes |

### Photos and videos
| Field | Value |
|---|---|
| Collected | Yes (providers only) |
| Shared | Yes — displayed publicly on the place card, subject to provider consent scope |
| Required or optional | Optional (only if the user registers as a provider and uploads photos) |
| Processing purpose | App functionality (place media) |
| Ephemeral | No — stored in S3-compatible object storage |

### Name
| Field | Value |
|---|---|
| Collected | Yes |
| Shared | No |
| Required or optional | Required at first login |
| Processing purpose | App functionality (display name in app) |
| Ephemeral | No |

### Messages (in-app)
| Field | Value |
|---|---|
| Collected | Yes |
| Shared | No (only shared between the sending user and the receiving provider) |
| Required or optional | Optional |
| Processing purpose | App functionality (messaging engine) |
| Ephemeral | No — stored for message history |

### App interactions (usage data)
| Field | Value |
|---|---|
| Collected | Yes — assistant request count and token usage per user (M5/M7) |
| Shared | No |
| Required or optional | N/A (automatic) |
| Processing purpose | App functionality (daily usage limits), Analytics |
| Ephemeral | No — stored per user per day |

---

## 5. Third-party data sharing

| Recipient | Data shared | Purpose | User control |
|---|---|---|---|
| Anthropic (Claude API) | Assistant chat messages, place context | AI assistant responses | Per-conversation, no long-term retention by Anthropic per their API policy |
| WhatsApp Cloud API (Meta) | Provider phone number, message template | Optional message delivery to providers who opted in to WhatsApp | Provider opt-in required; user chooses "Send via WhatsApp" handoff |
| Firebase Cloud Messaging (Google) | FCM registration token | Push notifications | User can disable in Account → Notifications |

No advertising networks. No analytics SDKs (Sentry is error monitoring only, no user tracking).

---

## 6. Data retention and deletion

| Data type | Retention | Deletion on account delete |
|---|---|---|
| Phone number | Until account deleted | Yes — identity schema purged |
| Name | Until account deleted | Yes |
| Messages | Until account deleted or conversation deleted | Yes — messaging schema purged |
| Photos (provider) | Until provider deletes or account deleted | Yes — media schema purged, S3 objects deleted |
| Location (precise) | Not stored persistently | N/A |
| Assistant usage stats | 90 days rolling | Yes |
| Activity / saved places | Until account deleted | Yes |
| FCM token | Until account deleted or token refresh | Yes |

Account deletion is permanent and non-reversible. All data is purged within 30 days of request (immediate for most, 30 days for backups).

---

## 7. Security practices

- Data encrypted in transit: Yes (HTTPS/TLS 1.2+)
- Data encrypted at rest: Yes (S3 server-side encryption, Postgres encrypted volume in production)
- Users can request data deletion: Yes (in-app + https://iraqmaps.iq/delete-account)
- Independent security review: No (MVP; planned for v1.1)
- Follows the Mobile Application Security Verification Standard (MASVS): Partial (no formal audit yet)
