/**
 * incidents contract – traffic incidents reported by users.
 * Module: modules/incidents (routing schema neighbour, separate schema).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { LngLat, Problem, UserId } from './common';

const c = initContract();

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export const IncidentType = z.enum(['accident', 'roadblock', 'flood', 'construction', 'other']);
export type IncidentType = z.infer<typeof IncidentType>;

export const IncidentId = z.string().uuid().brand<'IncidentId'>();
export type IncidentId = z.infer<typeof IncidentId>;

export const Incident = z.object({
  id: IncidentId,
  type: IncidentType,
  location: LngLat,
  description: z.string().max(500).nullable(),
  reportedBy: UserId.nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  /** True when the incident has not yet passed its expiresAt. */
  active: z.boolean(),
});
export type Incident = z.infer<typeof Incident>;

export const CreateIncidentRequest = z.object({
  type: IncidentType,
  location: LngLat,
  description: z.string().max(500).optional(),
  /** Hours until the incident expires (default 2). */
  ttlHours: z.number().int().min(1).max(72).default(2),
});
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequest>;

export const IncidentList = z.object({
  items: z.array(Incident),
});
export type IncidentList = z.infer<typeof IncidentList>;

// ---------------------------------------------------------------------------
// REST contract
// ---------------------------------------------------------------------------

export const incidentsContract = c.router({
  create: {
    method: 'POST',
    path: '/v1/incidents',
    body: CreateIncidentRequest,
    responses: {
      201: Incident,
      400: Problem,
      401: Problem,
    },
  },
  list: {
    method: 'GET',
    path: '/v1/incidents',
    query: z.object({
      /** Latitude of centre point. */
      lat: z.coerce.number().min(-90).max(90),
      /** Longitude of centre point. */
      lng: z.coerce.number().min(-180).max(180),
      /** Search radius in kilometres (default 10, max 50). */
      radiusKm: z.coerce.number().min(0.1).max(50).default(10),
    }),
    responses: {
      200: IncidentList,
      400: Problem,
    },
  },
});
