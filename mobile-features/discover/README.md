# @iraq-maps/feature-discover

The «اكتشف» (Discover) tab — a social feed where users and verified providers share photos, tips, events,
and offers about places in Iraq.

---

## What This Package Does

- Displays a scrollable feed of posts filtered by category (food, transport, tourism, shopping, services).
- Lets authenticated users create posts with up to 4 photos, a caption, an optional place tag, and @mentions.
- Supports like, comment, and bookmark actions.
- Shows a verified badge next to provider authors.
- Lets users report inappropriate content.

---

## Key Screens and Components

### Screens

| Export             | Route               | Description                                      |
|--------------------|---------------------|--------------------------------------------------|
| `DiscoverScreen`   | `/discover`         | The main tab: feed + category filter strip       |
| `PostDetailScreen` | `/discover/[id]`    | Full post with comments thread                   |
| `CreatePostScreen` | `/discover/create`  | Compose a new post with media picker             |

### Components

| Component           | Description                                              |
|---------------------|----------------------------------------------------------|
| `PostCard`          | Feed card: author, photos carousel, body, action bar     |
| `CategoryFilter`    | Horizontal pill strip: all / food / transport / etc.     |
| `CommentThread`     | Nested list of comments for a post                       |
| `CreatePostForm`    | Text input + media picker + place tag picker             |
| `AuthorBadge`       | Name + verified tick for provider authors                |
| `ReportSheet`       | Bottom sheet for reporting a post                        |

---

## Ports Consumed

| Port                | Package            | Used for                                    |
|---------------------|--------------------|---------------------------------------------|
| `discoverContract`  | `@iraq-maps/contracts` | `GET /discover/feed`, `POST /discover/posts`, likes, comments |
| `mediaContract`     | `@iraq-maps/contracts` | Upload photos before attaching to a post    |
| `placesContract`    | `@iraq-maps/contracts` | Place picker when tagging a place           |

All API calls go through `@iraq-maps/mobile-kit`'s `apiClient`. This package never imports from `modules/*`.

---

## i18n Namespaces

Namespace: `feature-discover`

Key files:

| File        | Language     |
|-------------|--------------|
| `ar.json`   | Arabic (primary, required) |
| `ckb.json`  | Kurdish Sorani |
| `en.json`   | English       |

Key string groups:

- `feed.*` — feed header, empty state, loading
- `post.*` — like, comment, bookmark, share, report actions
- `create.*` — compose screen labels and validation messages
- `comment.*` — comment input, reply, delete
- `category.*` — category filter labels
- `report.*` — report reasons

---

## How to Test

### Unit tests

```bash
cd mobile-features/discover
pnpm test
```

Tests live in `src/__tests__/`. Key files:

- `PostCard.test.tsx` — renders correctly with and without photos, liked/unliked state
- `CategoryFilter.test.tsx` — filter strip selects correct category
- `CreatePostForm.test.tsx` — validation, media limit, submit flow

### E2E (Maestro)

```bash
maestro test mobile-features/discover/maestro/create-post.yaml
maestro test mobile-features/discover/maestro/like-comment.yaml
```

The e2e flows require `OTP_SENDER=fixed` and a seeded test account.
