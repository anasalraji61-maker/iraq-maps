/**
 * Social features contracts: Events, Challenges, Marketplace
 * @module social
 */
import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { UserId } from './common';

const c = initContract();

// ─── Shared IDs ──────────────────────────────────────────────────────────────

export const EventId = z.string().uuid().brand('EventId');
export type EventId = z.infer<typeof EventId>;

export const ChallengeId = z.string().uuid().brand('ChallengeId');
export type ChallengeId = z.infer<typeof ChallengeId>;

export const ListingId = z.string().uuid().brand('ListingId');
export type ListingId = z.infer<typeof ListingId>;

// ─── Events ──────────────────────────────────────────────────────────────────

export const EventCategory = z.enum([
  'cultural',
  'sport',
  'food',
  'business',
  'education',
  'entertainment',
  'social',
  'other',
]);
export type EventCategory = z.infer<typeof EventCategory>;

export const DiscoverEvent = z.object({
  id: EventId,
  organizerId: UserId,
  title: z.string().max(200),
  description: z.string().max(2000),
  lat: z.number(),
  lng: z.number(),
  address: z.string().max(500),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  maxAttendees: z.number().int().min(1).nullable(),
  attendeeCount: z.number().int().default(0),
  isAttending: z.boolean().default(false),
  imageUrl: z.string().url().nullable(),
  category: EventCategory,
  createdAt: z.string().datetime(),
});
export type DiscoverEventType = z.infer<typeof DiscoverEvent>;

export const eventsContract = c.router({
  createEvent: {
    method: 'POST',
    path: '/discover/events',
    body: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000),
      lat: z.number(),
      lng: z.number(),
      address: z.string().max(500),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      maxAttendees: z.number().int().min(1).optional(),
      imageUrl: z.string().url().optional(),
      category: EventCategory,
    }),
    responses: {
      201: DiscoverEvent,
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
    },
    summary: 'Create a new event',
  },
  listEvents: {
    method: 'GET',
    path: '/discover/events',
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(20).default(10),
      category: EventCategory.optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
      radiusKm: z.coerce.number().max(100).optional(),
    }),
    responses: {
      200: z.object({ items: z.array(DiscoverEvent), nextCursor: z.string().optional() }),
    },
    summary: 'List events with optional filters',
  },
  getEvent: {
    method: 'GET',
    path: '/discover/events/:eventId',
    pathParams: z.object({ eventId: EventId }),
    responses: {
      200: DiscoverEvent,
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Get event by ID',
  },
  rsvpEvent: {
    method: 'POST',
    path: '/discover/events/:eventId/rsvp',
    pathParams: z.object({ eventId: EventId }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'RSVP to an event',
  },
  cancelRsvp: {
    method: 'DELETE',
    path: '/discover/events/:eventId/rsvp',
    pathParams: z.object({ eventId: EventId }),
    responses: {
      204: z.undefined(),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Cancel RSVP',
  },
});

// ─── Challenges ───────────────────────────────────────────────────────────────

export const ChallengeType = z.enum(['photo', 'checkin', 'review']);
export type ChallengeType = z.infer<typeof ChallengeType>;

export const ChallengeStatus = z.enum(['upcoming', 'active', 'completed']);
export type ChallengeStatus = z.infer<typeof ChallengeStatus>;

export const Challenge = z.object({
  id: ChallengeId,
  title: z.string().max(200),
  description: z.string().max(2000),
  type: ChallengeType,
  targetCount: z.number().int().min(1),
  reward: z.string().max(200).nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: ChallengeStatus,
  totalParticipants: z.number().int().default(0),
  myProgress: z.number().int().default(0),
  myRank: z.number().int().nullable(),
  createdAt: z.string().datetime(),
});
export type ChallengeType2 = z.infer<typeof Challenge>;

export const ChallengeLeaderEntry = z.object({
  rank: z.number().int(),
  userId: UserId,
  displayName: z.string(),
  progress: z.number().int(),
});
export type ChallengeLeaderEntryType = z.infer<typeof ChallengeLeaderEntry>;

export const challengesContract = c.router({
  listChallenges: {
    method: 'GET',
    path: '/discover/challenges',
    query: z.object({
      status: ChallengeStatus.optional(),
    }),
    responses: {
      200: z.object({ items: z.array(Challenge) }),
    },
    summary: 'List challenges',
  },
  getChallenge: {
    method: 'GET',
    path: '/discover/challenges/:challengeId',
    pathParams: z.object({ challengeId: ChallengeId }),
    responses: {
      200: z.object({ challenge: Challenge, leaderboard: z.array(ChallengeLeaderEntry) }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Get challenge detail with leaderboard',
  },
  recordProgress: {
    method: 'POST',
    path: '/discover/challenges/:challengeId/progress',
    pathParams: z.object({ challengeId: ChallengeId }),
    body: z.object({ increment: z.number().int().min(1).default(1) }),
    responses: {
      200: z.object({ newProgress: z.number().int(), completed: z.boolean() }),
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Record progress on a challenge',
  },
});

// ─── Marketplace ──────────────────────────────────────────────────────────────

export const ListingCategory = z.enum([
  'electronics',
  'clothing',
  'vehicles',
  'furniture',
  'food',
  'services',
  'real_estate',
  'other',
]);
export type ListingCategory = z.infer<typeof ListingCategory>;

export const ListingStatus = z.enum(['active', 'sold', 'removed']);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const Listing = z.object({
  id: ListingId,
  sellerId: UserId,
  sellerName: z.string(),
  title: z.string().max(200),
  description: z.string().max(2000),
  price: z.number().min(0),
  currency: z.string().length(3).default('IQD'),
  category: ListingCategory,
  images: z.array(z.string().url()).max(8),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  status: ListingStatus.default('active'),
  createdAt: z.string().datetime(),
});
export type ListingType = z.infer<typeof Listing>;

export const marketplaceContract = c.router({
  createListing: {
    method: 'POST',
    path: '/discover/listings',
    body: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000),
      price: z.number().min(0),
      currency: z.string().length(3).optional(),
      category: ListingCategory,
      images: z.array(z.string().url()).max(8).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }),
    responses: {
      201: Listing,
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
    },
    summary: 'Create a marketplace listing',
  },
  listListings: {
    method: 'GET',
    path: '/discover/listings',
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(20).default(12),
      category: ListingCategory.optional(),
      minPrice: z.coerce.number().optional(),
      maxPrice: z.coerce.number().optional(),
      sellerId: z.string().uuid().optional(),
    }),
    responses: {
      200: z.object({ items: z.array(Listing), nextCursor: z.string().optional() }),
    },
    summary: 'List marketplace listings',
  },
  getListing: {
    method: 'GET',
    path: '/discover/listings/:listingId',
    pathParams: z.object({ listingId: ListingId }),
    responses: {
      200: Listing,
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Get listing by ID',
  },
  updateListing: {
    method: 'PATCH',
    path: '/discover/listings/:listingId',
    pathParams: z.object({ listingId: ListingId }),
    body: z.object({
      title: z.string().max(200).optional(),
      description: z.string().max(2000).optional(),
      price: z.number().min(0).optional(),
      status: ListingStatus.optional(),
      images: z.array(z.string().url()).max(8).optional(),
    }),
    responses: {
      200: Listing,
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Update own listing',
  },
});
