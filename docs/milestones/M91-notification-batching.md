---
milestone: M91
slug: notification-batching
owned_paths:
  - modules/notifications/src/like-batcher.ts
  - modules/notifications/src/like-batcher.test.ts
  - modules/notifications/src/notifications.module.ts
---

# M91 — Notification Batching

## Features
- `LikeBatcher` in `modules/notifications/src/like-batcher.ts`
- 30-second debounce window: first like starts a timer; subsequent likes increment counter
- After window expires, one push: "أعجب شخص بمنشورك." (1) or "أعجب N أشخاص بمنشورك." (N>1)
- `notifications.module.ts` uses `LikeBatcher` instead of immediate send per like
- 2 unit tests with fake timers

## Status: مكتملة
