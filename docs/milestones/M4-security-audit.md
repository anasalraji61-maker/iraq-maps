# M4 Security Audit Report

**Auditor:** Claude Sonnet 4.6  
**Date:** 2026-10-14  
**Branch:** claude/iraq-smart-maps-app-aybpjn  
**Scope:** messaging, notifications, whatsapp-cloud, push-fcm, contracts

---

## Summary

3 findings fixed (2 CRITICAL, 1 MINOR). 1 MINOR noted. All other checks passed.

---

## Findings

### CRITICAL (Fixed) — WhatsApp inbound signature verification bypassed
**File:** `modules/messaging/src/messaging.controller.ts:83`  
`whatsappInbound` passed empty headers `{}` to `handleInbound`, so the HMAC
`x-hub-signature-256` check in the WhatsApp adapter always found no signature
and returned null, silently dropping all inbound webhooks.  
**Fix:** Pass actual request headers to `handleInbound`.

### CRITICAL (Fixed) — `providerReply` missing ownership check
**File:** `modules/messaging/src/messaging.service.ts:138`  
Queried deliveries by `inquiryId` only, with no check that the delivery targets
a place owned by the calling provider. Any authenticated provider could reply to
any inquiry.  
**Fix:** Added `eq(deliveryTable.placeId, providerId)` to the where clause.

### MINOR (Fixed) — Env var name mismatch for WhatsApp access token
**File:** `.env.example:25` vs `adapters/whatsapp-cloud/src/index.ts:150`  
`.env.example` documented `WHATSAPP_CLOUD_ACCESS_TOKEN` but the adapter reads
`WHATSAPP_ACCESS_TOKEN`, causing silent undefined in production.  
**Fix:** Corrected name in `.env.example`.

### MINOR (Noted) — Verify-token comparison not timing-safe
**File:** `modules/messaging/src/messaging.controller.ts:76`  
`hub.verify_token` compared with `===`. Risk is low (webhook challenge only),
but should use `timingSafeEqual` for consistency.

---

## Checks Passed

| Check | Result |
|---|---|
| No secrets in code | PASS |
| WhatsApp HMAC uses timingSafeEqual | PASS |
| Zod validation on all contract inputs | PASS |
| Daily rate limit per userId | PASS |
| Drizzle ORM (parameterized queries) | PASS |
| idempotency_key UNIQUE constraint in migration | PASS |
| getInquiry/listInquiries filter by userId | PASS |
| Opt-out respected before send | PASS |
| gitleaks | SKIPPED (not installed in environment) |
