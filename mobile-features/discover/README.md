# @iraq-maps/feature-discover

The «اكتشف» (discover) tab: a social feed where users and providers post about places, events, prices and tips in Iraq.

## Screens

- `DiscoverScreen` (`/discover`, a tab): the main feed with infinite scroll. Posts include text, images (multi-photo lightbox), video, GIFs, and polls.
- `PostDetailScreen` (`/discover/[id]`): a single post with threaded comments, reactions, pinned comment, and a report button.
- `ComposeScreen` (`/discover/compose`): rich post composer with character count, media picker (images/video/GIF), mention autocomplete (`@user`), hashtag suggestions, and category selector.
- `HashtagScreen` (`/discover/hashtag/[tag]`): posts filtered by hashtag.
- `SavedPostsScreen` (`/discover/saved`): bookmarked posts.
- `UserPostsScreen` (`/discover/user/[id]`): posts by a specific user.
- `CollectionScreen` (`/discover/collection/[id]`): a user-curated post collection.

## Hooks

- `useFollows()` — follow/unfollow users; drives the "following" feed filter.
- `useSavedPosts()` — bookmark and unbookmark posts.
- `useCollections()` — create and manage post collections.
- `useBlockedUsers()` — block/unblock users; blocked users' posts are hidden client-side.

## Features

- **Polls**: create timed polls; vote is recorded server-side.
- **Translations**: any post can be translated in-place via the assistant.
- **Mentions**: `@username` in a post body links to that user's profile and triggers a follow notification.
- **Hashtags**: trending hashtags shown in the explore bar; tapping filters the feed.
- **Post pinning**: providers can pin one post to the top of their profile.
- **Collections**: save thematic sets of posts.
- **Edit history**: edits are logged; original text is accessible from the "edited" badge.
- **Moderation**: report a post or comment; moderators review in the admin panel.
- **Skeleton loaders**: all list and detail screens show animated skeletons while loading.

## Client

`src/client.ts` wraps the discover API contract routes under `/v1/discover`.

## Ports and dependencies

- Consumes `useApi`, `useSession` from `@iraq-maps/mobile-kit`.
- Consumes `@iraq-maps/ui`, `@iraq-maps/i18n`.
- Uses `Post`, `Comment`, `Poll`, `Collection` schemas from `@iraq-maps/contracts`.
- `expo-av` is used for video playback (type declarations in `src/expo-av.d.ts`).

## Strings

All strings are in the `discover` namespace, in `src/i18n/{ar,ckb,en}.json`. `src/strings.test.ts` checks locale parity.

## Tests

`pnpm --filter @iraq-maps/feature-discover test` runs jest-expo and RNTL tests.

Maestro: `maestro/discover.yaml` tests the compose–post–comment E2E flow.
