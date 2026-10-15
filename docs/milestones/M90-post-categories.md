---
milestone: M90
slug: post-categories
owned_paths:
  - packages/contracts/src/discover.ts
  - modules/discover/src/schema.ts
  - modules/discover/src/discover.service.ts
  - modules/discover/src/discover.controller.ts
  - modules/discover/migrations/0002_post_category.sql
  - mobile-features/discover/src/screens/DiscoverFeedScreen.tsx
  - mobile-features/discover/src/screens/CreatePostScreen.tsx
  - mobile-features/discover/src/i18n/ar.json
  - mobile-features/discover/src/i18n/en.json
  - mobile-features/discover/src/i18n/ckb.json
---

# M90 — Post Categories

## Features
- `PostCategory` enum in contracts: food, transport, tourism, shopping, services, other
- `category` column added to `discover.post` with migration `0002_post_category.sql`
- `listFeed` accepts optional `category` query param for server-side filtering
- `createPost` body accepts optional `category`
- CreatePostScreen shows category picker chips (optional, toggleable)
- DiscoverFeedScreen shows category filter row below type filter row
- All strings through `t()`, Arabic/Kurdish/English

## Status: مكتملة
