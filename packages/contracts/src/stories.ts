/**
 * Stories contracts — full typed schema for the extended Stories feature.
 * The basic Story / StoryAuthor / storiesContract types live in discover.ts
 * (they were added early and are frozen). This file adds the richer v2
 * surface: extended story types (text, place_visit, route_share), per-story
 * metadata, privacy tiers, view analytics, and reply threads.
 *
 * Import order: this file re-exports the base types so callers only need one
 * import path.
 */
import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { PlaceId, UserId } from './common';

const c = initContract();

// ─── Re-export base types ─────────────────────────────────────────────────────

export {
  StoryId,
  Story,
  StoryAuthor,
  storiesContract,
  type StoryIdType,
  type StoryType,
  type StoryAuthorType,
} from './discover';

// ─── Extended story types ─────────────────────────────────────────────────────

/** All story content variants. */
export const StoryContentType = z.enum([
  'photo',
  'video',
  'text',
  'place_visit',
  'route_share',
]);
export type StoryContentType = z.infer<typeof StoryContentType>;

/** Privacy audience for a story. */
export const StoryPrivacy = z.enum([
  'public',      // all followers
  'followers',   // confirmed followers only
  'close',       // close-friends list
]);
export type StoryPrivacy = z.infer<typeof StoryPrivacy>;

/** Text overlay displayed on top of a media story. */
export const StoryTextOverlay = z.object({
  text: z.string().max(200),
  /** Font index 0–5, maps to a design-system font variant. */
  fontIndex: z.number().int().min(0).max(5).default(0),
  /** Hex colour of the text, e.g. "#FFFFFF". */
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FFFFFF'),
  /** Normalised position 0..1 from the start edge. */
  x: z.number().min(0).max(1).default(0.5),
  /** Normalised position 0..1 from the top. */
  y: z.number().min(0).max(1).default(0.8),
});
export type StoryTextOverlay = z.infer<typeof StoryTextOverlay>;

/** Metadata for a `text` story — full-bleed text card. */
export const TextStoryMeta = z.object({
  text: z.string().min(1).max(500),
  /** Hex background colour. */
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1976D2'),
  /** Font index 0–5. */
  fontIndex: z.number().int().min(0).max(5).default(0),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#FFFFFF'),
});
export type TextStoryMeta = z.infer<typeof TextStoryMeta>;

/** Metadata for a `place_visit` story — "I'm at [Place]". */
export const PlaceVisitMeta = z.object({
  placeId: PlaceId,
  placeName: z.string().max(200),
  /** Optional note from the author. */
  note: z.string().max(300).optional(),
  /** Approximate coordinates for the map pin. */
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type PlaceVisitMeta = z.infer<typeof PlaceVisitMeta>;

/** Metadata for a `route_share` story — "I just drove [Route]". */
export const RouteShareMeta = z.object({
  /** Human-readable summary, e.g. "بغداد → كربلاء". */
  routeSummary: z.string().max(200),
  distanceKm: z.number().nonnegative(),
  durationMinutes: z.number().int().nonnegative(),
  /** Encoded polyline or route ID (opaque; rendered by map-kit). */
  routeRef: z.string().max(2000).optional(),
  originName: z.string().max(200),
  destinationName: z.string().max(200),
});
export type RouteShareMeta = z.infer<typeof RouteShareMeta>;

/** Discriminated union of all story metadata shapes. */
export const StoryMeta = z.discriminatedUnion('type', [
  z.object({ type: z.literal('photo'),       textOverlay: StoryTextOverlay.optional(), placeTag: PlaceId.optional() }),
  z.object({ type: z.literal('video'),       textOverlay: StoryTextOverlay.optional() }),
  z.object({ type: z.literal('text'),        data: TextStoryMeta }),
  z.object({ type: z.literal('place_visit'), data: PlaceVisitMeta }),
  z.object({ type: z.literal('route_share'), data: RouteShareMeta }),
]);
export type StoryMeta = z.infer<typeof StoryMeta>;

// ─── Rich story shape (v2) ────────────────────────────────────────────────────

export const StoryV2Id = z.string().uuid().brand('StoryV2Id');
export type StoryV2Id = z.infer<typeof StoryV2Id>;

export const StoryV2 = z.object({
  id: StoryV2Id,
  authorId: UserId,
  /** The primary content type. */
  contentType: StoryContentType,
  /** Present for photo / video stories. */
  mediaUrl: z.string().url().optional(),
  /** Present for photo / video stories. */
  mediaType: z.enum(['image', 'video']).optional(),
  /** Playback / display duration in seconds. */
  duration: z.number().int().min(1).max(60).default(5),
  /** Structured metadata — shape depends on contentType. */
  meta: StoryMeta.optional(),
  privacy: StoryPrivacy.default('public'),
  viewCount: z.number().int().nonnegative().default(0),
  viewedByMe: z.boolean().default(false),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  /** True when the current viewer has been blocked by the author. Omit = false. */
  blockedFromViewing: z.boolean().default(false),
});
export type StoryV2 = z.infer<typeof StoryV2>;

/** Author ring item for the feed. */
export const StoryRingAuthor = z.object({
  userId: UserId,
  displayName: z.string(),
  avatarUrl: z.string().url().optional(),
  stories: z.array(StoryV2),
  /** True when at least one story has not been viewed by the current user. */
  hasUnviewed: z.boolean(),
  /** True when the current user follows this author. */
  isFollowed: z.boolean().default(false),
});
export type StoryRingAuthor = z.infer<typeof StoryRingAuthor>;

// ─── Request / response bodies ────────────────────────────────────────────────

export const CreateStoryV2Body = z.object({
  contentType: StoryContentType,
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  duration: z.number().int().min(1).max(60).optional(),
  meta: StoryMeta.optional(),
  privacy: StoryPrivacy.optional(),
});
export type CreateStoryV2Body = z.infer<typeof CreateStoryV2Body>;

export const StoryViewerRow = z.object({
  userId: UserId,
  displayName: z.string(),
  avatarUrl: z.string().url().optional(),
  viewedAt: z.string().datetime(),
});
export type StoryViewerRow = z.infer<typeof StoryViewerRow>;

export const StoryReplyBody = z.object({
  text: z.string().min(1).max(500),
});
export type StoryReplyBody = z.infer<typeof StoryReplyBody>;

export const StoryReportBody = z.object({
  reason: z.enum(['spam', 'inappropriate', 'misinformation', 'other']),
});
export type StoryReportBody = z.infer<typeof StoryReportBody>;

// ─── Problem detail shorthand ─────────────────────────────────────────────────

const prob = (status: 400 | 401 | 403 | 404 | 422 | 429) =>
  z.object({
    type: z.literal('about:blank'),
    title: z.string(),
    status: z.literal(status),
    code: z.string(),
  });

// ─── HTTP contract (v2) ───────────────────────────────────────────────────────

export const storiesV2Contract = c.router({
  /** Create a rich story (all content types). */
  createStoryV2: {
    method: 'POST',
    path: '/discover/stories/v2',
    body: CreateStoryV2Body,
    responses: {
      201: StoryV2,
      400: prob(400),
      401: prob(401),
      422: prob(422),
      429: prob(429),
    },
    summary: 'Create a rich story (v2) — photo, video, text, place_visit, route_share',
  },

  /** Paginated feed of story rings, ordered: friends → followed → popular. */
  getStoriesFeedV2: {
    method: 'GET',
    path: '/discover/stories/v2/feed',
    query: z.object({
      city: z.string().optional(),
      limit: z.coerce.number().int().max(50).default(20),
    }),
    responses: {
      200: z.object({ authors: z.array(StoryRingAuthor) }),
      401: prob(401),
    },
    summary: 'Stories ring feed — friends first, then followed, then popular',
  },

  /** Get details + viewer list for a single story (owner only for viewers). */
  getStoryV2: {
    method: 'GET',
    path: '/discover/stories/v2/:storyId',
    pathParams: z.object({ storyId: StoryV2Id }),
    responses: {
      200: StoryV2,
      401: prob(401),
      403: prob(403),
      404: prob(404),
    },
    summary: 'Fetch a single rich story',
  },

  /** Mark a story as viewed. Idempotent. */
  viewStoryV2: {
    method: 'POST',
    path: '/discover/stories/v2/:storyId/view',
    pathParams: z.object({ storyId: StoryV2Id }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      404: prob(404),
    },
    summary: 'Mark a story viewed (increments view count)',
  },

  /** Reply to a story — creates a private message thread. */
  replyToStoryV2: {
    method: 'POST',
    path: '/discover/stories/v2/:storyId/reply',
    pathParams: z.object({ storyId: StoryV2Id }),
    body: StoryReplyBody,
    responses: {
      201: z.object({ threadId: z.string().uuid() }),
      400: prob(400),
      401: prob(401),
      404: prob(404),
    },
    summary: 'Reply to a story (opens a messaging thread)',
  },

  /** Delete own story. */
  deleteStoryV2: {
    method: 'DELETE',
    path: '/discover/stories/v2/:storyId',
    pathParams: z.object({ storyId: StoryV2Id }),
    responses: {
      204: z.undefined(),
      403: prob(403),
      404: prob(404),
    },
    summary: 'Delete own story',
  },

  /** Get own active stories with per-story view counts. */
  getMyStoriesV2: {
    method: 'GET',
    path: '/discover/stories/v2/mine',
    responses: {
      200: z.object({ stories: z.array(StoryV2) }),
      401: prob(401),
    },
    summary: 'Own active stories with view counts',
  },

  /** Staff-curated featured stories for Discover. */
  getFeaturedStories: {
    method: 'GET',
    path: '/discover/stories/featured',
    query: z.object({
      city: z.string().optional(),
      limit: z.coerce.number().int().max(20).default(10),
    }),
    responses: {
      200: z.object({ stories: z.array(StoryV2) }),
    },
    summary: 'Staff-picked featured stories for the Discover page',
  },

  /** Get list of viewers for own story. */
  getStoryViewers: {
    method: 'GET',
    path: '/discover/stories/v2/:storyId/viewers',
    pathParams: z.object({ storyId: StoryV2Id }),
    query: z.object({ limit: z.coerce.number().int().max(50).default(20) }),
    responses: {
      200: z.object({ viewers: z.array(StoryViewerRow), total: z.number().int() }),
      403: prob(403),
      404: prob(404),
    },
    summary: 'Viewers of own story (owner only)',
  },

  /** Report a story. */
  reportStoryV2: {
    method: 'POST',
    path: '/discover/stories/v2/:storyId/report',
    pathParams: z.object({ storyId: StoryV2Id }),
    body: StoryReportBody,
    responses: {
      204: z.undefined(),
      404: prob(404),
      429: prob(429),
    },
    summary: 'Report a story for moderation review',
  },
});
