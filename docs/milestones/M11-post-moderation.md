---
id: M11
slug: post-moderation
status: in_progress
branch: claude/iraq-smart-maps-app-aybpjn
owners:
  builder-discover:
    - "packages/contracts/src/discover.ts"
    - "modules/discover/src/**"
    - "modules/discover/migrations/**"
    - "apps/admin/src/api.ts"
    - "apps/admin/src/**"
---

# M11 — Post Reporting & Admin Moderation

## Features

1. **Report post** — Users can flag a discover post for review (`POST /discover/posts/:id/report`).
2. **Admin reported posts queue** — Admins see reported posts with report count and reason (`GET /admin/discover/reported`).
3. **Admin approve/remove** — Admins can approve (dismiss reports) or remove (soft-delete) a post.
4. **Wire admin panel** — Replace mock reported posts with real API calls.

## Acceptance Criteria

- A user can report a post once per post (idempotent).
- Admin queue lists posts sorted by report count descending, newest first.
- Approve clears the report flags; remove soft-deletes the post (hidden from feed).
- Admin panel ReportedPosts tab uses real data.
- All gate checks pass.

## Completion

SHA:
