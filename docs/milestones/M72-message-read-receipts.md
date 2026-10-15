---
milestone: M72
slug: message-read-receipts
status: done
owners:
  - builder: "agent"
    globs:
      - "packages/contracts/src/messaging.ts"
      - "modules/messaging/src/**"
      - "modules/messaging/migrations/**"
      - "mobile-features/messages/src/hooks/useReadReceipts.ts"
---

# M72 — Message Read Receipts

## Goal

Add server-side read receipt tracking for inquiries so the backend knows when a user has viewed a message.

## Changes

### Contract (`packages/contracts/src/messaging.ts`)
- Added `readAt` (nullable ISO string) field to `Inquiry` schema
- Added `markInquiryRead` endpoint: `POST /v1/inquiries/:id/read`

### Backend (`modules/messaging/`)
- Added `read_at` column to `messaging.inquiry` table (migration `0001_inquiry_read_at.sql`)
- `MessagingService.markInquiryRead()` — idempotent, sets `read_at` on first call
- `toInquiryShape` now maps `readAt` to the response
- Controller routes `markInquiryRead` with auth check
- Tests: marks read + idempotency + wrong-user 404

### Mobile (`mobile-features/messages/src/hooks/useReadReceipts.ts`)
- `useMarkRead` now calls `api.markInquiryRead` (best-effort, non-blocking) in addition to local AsyncStorage

## Acceptance Criteria
- [x] `POST /v1/inquiries/:id/read` returns 200 `{ ok: true }`
- [x] Second call is idempotent (no error, no timestamp change)
- [x] Wrong user gets 404
- [x] `GET /v1/inquiries/:id` response includes `readAt`
- [x] Mobile calls server on inquiry open (fire-and-forget)
