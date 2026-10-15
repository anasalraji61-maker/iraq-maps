---
id: M12
slug: discover-notifications
status: completed
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "apps/api/src/app.ts"
    - "modules/notifications/src/**"
    - "modules/discover/src/**"
    - "mobile-features/discover/src/**"
    - "mobile-features/activity/src/**"
---

# M12 — Discover Notifications

## Features

1. **Wire discover eventBus** — Pass the real EventBus to `discoverModule` so like/comment events propagate.
2. **Notifications for likes** — When a post is liked, send a push notification to the post author.
3. **Notifications for comments** — When a comment is posted, send a push notification to the post author.
4. **Notification prefs for discover** — Add `discoverLikes` and `discoverComments` prefs to `NotificationPrefs`.

## Acceptance Criteria

- Like on a post triggers `discover.post.liked.v1` event and sends push notification to post author (not to self-likers).
- Comment on a post triggers `discover.post.commented.v1` event and sends push notification to post author.
- Both notifications gated by new prefs `discoverLikes` and `discoverComments` (default: true).
- `pnpm gate` passes.

## Completion

SHA:
