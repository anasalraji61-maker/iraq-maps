---
milestone: M89
slug: rate-limiting
owned_paths:
  - modules/discover/src/rate-limiter.ts
  - modules/discover/src/rate-limiter.spec.ts
  - modules/discover/src/discover.controller.ts
  - modules/discover/src/discover.module.ts
  - modules/discover/package.json
  - packages/contracts/src/discover.ts
  - apps/api/src/app.ts
---

# M89 — Rate Limiting on API

## Features
- Redis sliding-window rate limiter (`SlidingWindowRateLimiter`) in `modules/discover/src/rate-limiter.ts`
- 10 posts/minute per user on `createPost`
- 20 reports/hour per user on `reportPost`
- 429 response with `retryAfterMs` added to discover contract
- Redis passed from `createApp` into `discoverModule`; limiter is null when Redis is absent (graceful)

## Status: مكتملة
