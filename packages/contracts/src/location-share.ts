/**
 * location-share contract – ephemeral live location links.
 * Share a URL; anyone with the link can see your current position until it expires.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { LngLat, Problem, UserId } from './common';

const c = initContract();

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export const ShareId = z.string().uuid().brand<'ShareId'>();
export type ShareId = z.infer<typeof ShareId>;

export const LocationShare = z.object({
  shareId: ShareId,
  /** Current position; null until the first PUT update. */
  location: LngLat.nullable(),
  /** ISO-8601; when the share expires and is no longer accessible. */
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  ownerId: UserId.nullable(),
});
export type LocationShare = z.infer<typeof LocationShare>;

export const CreateShareRequest = z.object({
  /** Time-to-live in hours (default 2, max 24). */
  ttlHours: z.number().int().min(1).max(24).default(2),
});
export type CreateShareRequest = z.infer<typeof CreateShareRequest>;

export const UpdateLocationRequest = z.object({
  location: LngLat,
});
export type UpdateLocationRequest = z.infer<typeof UpdateLocationRequest>;

// ---------------------------------------------------------------------------
// REST contract
// ---------------------------------------------------------------------------

export const locationShareContract = c.router({
  create: {
    method: 'POST',
    path: '/v1/location/share',
    body: CreateShareRequest,
    responses: {
      201: LocationShare,
      401: Problem,
    },
  },
  get: {
    method: 'GET',
    path: '/v1/location/share/:shareId',
    responses: {
      200: LocationShare,
      404: Problem,
      410: Problem, // expired
    },
  },
  update: {
    method: 'PUT',
    path: '/v1/location/share/:shareId',
    body: UpdateLocationRequest,
    responses: {
      200: LocationShare,
      401: Problem,
      403: Problem,
      404: Problem,
      410: Problem,
    },
  },
});
