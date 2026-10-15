# Changelog

All notable changes to Iraq Smart Maps are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are milestone-based, not semver; each entry maps to one or more milestone files in `docs/milestones/`.

---

## [Unreleased]

---

## M41 – Skeleton Loaders (comments)

### Added
- Animated skeleton loaders for the comments list while thread loads.

---

## M40 – Post Detail Skeleton

### Added
- Skeleton loader for the post-detail screen header and body while data loads.

---

## M39 – Account Skeleton

### Added
- Skeleton loader for the account tab while profile data loads.

---

## M38 – Provider Dashboard Skeleton

### Added
- Skeleton loader for the provider dashboard stats and listing cards.

---

## M37 – Activity Skeleton

### Added
- Skeleton loaders for the activity (inquiries + notifications) tab.

---

## M36 – Provider Inbox Skeleton

### Added
- Skeleton loaders for the provider inbox list screen.

---

## M35 – Messages Skeleton

### Added
- Skeleton loaders for the messages inbox list screen.

---

## M34 – Discover Skeleton

### Added
- Skeleton loaders for the discover feed and post-detail screens.

---

## M33 – Assistant Place Cards Test

### Added
- Tests confirming assistant responses with embedded place cards render correctly.

---

## M32 – Discover Report Submit Test

### Added
- Tests for the report-post and report-comment submit flow.

---

## M31 – Inquiry Status Badge

### Added
- Color-coded status badges (`pending` / `replied` / `closed`) on inquiry list items.

---

## M30 – Discover Report Test

### Added
- Unit and integration tests for the post/comment report flow.

---

## M29 – Assistant Daily Limit UX

### Added
- Daily usage counter shown in the assistant tab header.
- Limit-reached state: friendly message and countdown to reset time.
- Server response headers drive the limit state; no extra API call needed.

---

## M28 – Activity Inquiries Tab

### Added
- Dedicated Inquiries sub-tab in the Activity screen listing all outbound inquiries.
- Pull-to-refresh and pagination.

---

## M27 – Inquiries List Refresh Test

### Added
- Tests for pull-to-refresh behavior on the inquiries list.

---

## M26 – Provider Dashboard Test

### Added
- Unit tests for the provider dashboard data-fetch and stat rendering logic.

---

## M25 – Compose Char Count Test

### Added
- Tests confirming the post-compose character counter increments and blocks submission at the limit.

---

## M24 – Provider Registration Test

### Added
- End-to-end tests for the multi-step provider registration flow (step navigation, validation, submission).

---

## M23 – Provider Inbox Detail Refresh

### Fixed
- Pull-to-refresh on the provider inbox detail now correctly re-fetches the latest reply.

---

## M22 – Inquiry Detail Refresh

### Fixed
- Pull-to-refresh on the user-side inquiry detail now correctly re-fetches messages.

---

## M21 – Assistant Copy Message

### Added
- Long-press on any assistant message shows a "copy" action that writes the text to the clipboard.

---

## M20 – Provider Dashboard Refresh

### Fixed
- Pull-to-refresh on the provider dashboard now re-fetches all stats.

---

## M19 – Place Card Tappable Links

### Added
- Phone numbers and website URLs in place cards are tappable (`tel:` and `https:` deep links).

---

## M18 – Inquiries List Status

### Added
- Inquiry status labels shown in the activity inquiries list.
- Status changes (replied, closed) reflected in real time via pull-to-refresh.

---

## M184 – Navigation Turn Arrow

### Added
- Large turn-direction arrow in the navigation HUD for the next maneuver.

---

## M183 – Lightbox Multi-Photo

### Added
- Full-screen lightbox viewer for posts with multiple photos; swipe between images.

---

## M182 – Registration Step Dots

### Added
- Step-progress dot indicator on the provider registration screen.

---

## M181 – Report Price Button

### Added
- "Report incorrect price" button on place cards; submits to the insights module.

---

## M180 – Post Delete Confirm

### Added
- Confirmation sheet before deleting a post (prevents accidental deletion).

---

## M179 – Provider Verified Badge

### Added
- Verified blue-tick badge on provider profiles and place cards when the provider is verified.

---

## M17 – Activity Refresh / Assistant Clear

### Fixed
- Activity tab refreshes correctly after a new notification arrives.

### Added
- "Clear conversation" button in the assistant tab resets history.

---

## M16 – Posts Tab Refresh

### Fixed
- Discover feed pull-to-refresh no longer duplicates posts after a reload.

---

## M15 – Delete Comment

### Added
- Comment authors and moderators can delete comments; soft-delete with a "deleted" placeholder.

---

## M14 – Edit Post

### Added
- Post authors can edit their own posts within a time window.
- Edit history is visible from an "edited" badge on the post.

---

## M13 – My Posts / Delete Post

### Added
- "My posts" section on the user profile lists the signed-in user's own posts.
- Post delete with confirmation sheet (hard delete by author; soft delete by moderator).

---

## M12 – Discover + Notifications Polish

### Added
- Notification digest: batched "N new followers" / "N new comments" summaries.
- Post pinning: providers pin one post to the top of their profile feed.
- Soft-delete comments: deleted comment shows a tombstone, preserving thread structure.
- Content moderation flags in the admin panel.
- Insights summary endpoint for aggregated place stats.

---

## M11 – Post Moderation

### Added
- Admin panel content-moderation queue: review flagged posts and comments, take action (approve/remove/warn).
- Moderation audit log.

---

## M10 – Admin Panel + Real API

### Added
- Admin web panel (`apps/admin`) connected to the real API.
- User management: search, suspend, reinstate users.
- Comment moderation tools.
- Place edit from admin panel.
- CSV export for providers and places.
- Earnings tracker for providers.
- Review-response management.

---

## M9 – Post-Launch Polish

### Added
- Privacy settings screen (control who can message you, see your activity).
- Account deletion confirmation with data-export download link.
- Display name editing.
- App version check: prompts update when a minimum version is enforced.
- Soft rate-limiting UX for OTP and search.
- Read receipts in message threads.
- Hashtag support on posts; trending hashtags explore bar.
- Place photo reviews (users submit photos reviewed by moderators).

---

## M8 – Play Store Submission

### Added
- App icon, splash screen, and store listing assets.
- EAS build configuration for production track.
- Android Gradle signing configured via CI secrets.
- `pnpm android:precheck` command for local build verification without the Android SDK.

---

## M7 – Ops / Privacy / Budgets / RC

### Added
- Privacy: GDPR-style data export and erasure endpoints.
- Budget controls: per-user daily assistant token budget enforced server-side.
- RC (remote config) endpoint for feature flags.
- Observability: Sentry adapter for error reporting, structured log reporter.
- Database migrations for all modules finalized.

---

## M6 – Discover + Activity + Moderation

### Added
- **Discover feed**: post creation (text, image, video, GIF, polls), feed with infinite scroll.
- **Comments**: threaded comments on posts with reactions.
- **Activity tab**: notifications for follows, comments, and mentions.
- **Moderation**: report-post flow; admin moderation queue (basic).
- Post categories and hashtags (initial support).
- Notification batching for digest emails/push.

---

## M5 – Assistant + Insights

### Added
- **Assistant tab**: conversational AI (Claude API, server-side) that answers questions about places, prices, hours, and directions in Arabic.
- Place cards embedded in assistant responses.
- **Insights module**: crowdsourced price reports, crowding observations, with `Estimate<T>` metadata (source, observedAt, confidence).
- Insights summary aggregation endpoint.

---

## M4 – Messaging + Inbox + Notifications

### Added
- **Messages tab**: peer-to-peer threads between users and providers.
- **Provider inbox**: providers receive and reply to inquiries.
- **Push notifications**: FCM integration (mocked in local dev); notification events via outbox.
- WhatsApp messaging channel adapter (mocked).
- Transactional outbox for reliable event publish.

---

## M3 – Providers + Media + Verification

### Added
- **Provider registration**: multi-step flow, business profile, category, hours.
- **Media module**: image/video upload to S3-compatible storage; signed URL generation.
- **Verification queue**: admin reviews provider applications.
- Place photos submitted and moderated.
- Consent scopes: providers opt in before their contact details are shown or messaged.

---

## M2 – Routing + Navigation + Satellite

### Added
- **Navigation tab**: turn-by-turn directions powered by Valhalla routing engine.
- **Satellite imagery** toggle on the map (mocked in local dev).
- MapLibre-based map view with PMTiles offline tile support.
- Geocoding via Photon (Arabic place-name search).

---

## M1 – Map + Search + Place Card

### Added
- **Map tab**: OpenStreetMap tiles rendered with MapLibre Native.
- Place search with Arabic text normalization (`pg_trgm` + custom normalizer).
- Place card bottom sheet: name, category, hours, address, ratings.
- OSM attribution displayed at all times.

---

## M0 – Walking Skeleton + Login Gates

### Added
- Monorepo scaffold: pnpm workspaces, Turborepo, TypeScript throughout.
- Five-tab Expo Router shell (Map, Navigate, Discover, Messages, Account).
- Arabic-first RTL layout; locale switcher (ar / ckb / en).
- Phone + OTP authentication (`identity` module).
- CI gate: lint, typecheck, test, boundary check, secret scan.
- Android build in GitHub Actions.
- OSM data quality report baseline.
