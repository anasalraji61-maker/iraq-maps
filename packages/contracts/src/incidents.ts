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

export const IncidentType = z.enum([
  'accident',
  'road_closure',
  'pothole',
  'flooding',
  'traffic_jam',
  'wrong_way',
  'hazard',
  'police',
  'speed_camera',
  'roadblock',
  'flood',
  'construction',
  'other',
]);
export type IncidentType = z.infer<typeof IncidentType>;

export const IncidentSeverity = z.enum(['minor', 'moderate', 'severe']);
export type IncidentSeverity = z.infer<typeof IncidentSeverity>;

export const IncidentId = z.string().uuid().brand<'IncidentId'>();
export type IncidentId = z.infer<typeof IncidentId>;

export const Incident = z.object({
  id: IncidentId,
  type: IncidentType,
  severity: IncidentSeverity,
  location: LngLat,
  description: z.string().max(500).nullable(),
  reportedBy: UserId.nullable(),
  anonymous: z.boolean(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  /** True when the incident has not yet passed its expiresAt. */
  active: z.boolean(),
  confirmedCount: z.number().int().min(0),
  disputedCount: z.number().int().min(0),
  /** Whether the current user has confirmed this incident. */
  confirmedByMe: z.boolean(),
  /** Whether the current user has disputed this incident. */
  disputedByMe: z.boolean(),
});
export type Incident = z.infer<typeof Incident>;

export const CreateIncidentRequest = z.object({
  type: IncidentType,
  severity: IncidentSeverity.default('moderate'),
  location: LngLat,
  description: z.string().max(500).optional(),
  /** Hours until the incident expires (default 2). */
  ttlHours: z.number().int().min(1).max(72).default(2),
  /** Report anonymously (reportedBy will be null in responses). */
  anonymous: z.boolean().default(false),
});
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequest>;

export const VoteIncidentRequest = z.object({
  vote: z.enum(['confirm', 'dispute']),
});
export type VoteIncidentRequest = z.infer<typeof VoteIncidentRequest>;

export const IncidentList = z.object({
  items: z.array(Incident),
});
export type IncidentList = z.infer<typeof IncidentList>;

export const ContributorEntry = z.object({
  userId: UserId,
  displayName: z.string().nullable(),
  incidentCount: z.number().int(),
  reviewCount: z.number().int(),
  placeCount: z.number().int(),
  photoCount: z.number().int(),
  totalPoints: z.number().int(),
  rank: z.number().int(),
  badgeTier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
});
export type ContributorEntry = z.infer<typeof ContributorEntry>;

export const LeaderboardResponse = z.object({
  cityId: z.string(),
  period: z.enum(['week', 'month', 'allTime']),
  entries: z.array(ContributorEntry),
  myEntry: ContributorEntry.nullable(),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponse>;

// ---------------------------------------------------------------------------
// GeoJSON FeatureCollection response
// ---------------------------------------------------------------------------

export const IncidentGeoJsonFeature = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: LngLat,
  }),
  properties: Incident,
});
export type IncidentGeoJsonFeature = z.infer<typeof IncidentGeoJsonFeature>;

export const IncidentGeoJsonCollection = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(IncidentGeoJsonFeature),
});
export type IncidentGeoJsonCollection = z.infer<typeof IncidentGeoJsonCollection>;

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
      /** Filter by type (comma-separated). */
      types: z.string().optional(),
    }),
    responses: {
      200: IncidentList,
      400: Problem,
    },
  },
  vote: {
    method: 'POST',
    path: '/v1/incidents/:id/vote',
    pathParams: z.object({ id: IncidentId }),
    body: VoteIncidentRequest,
    responses: {
      200: Incident,
      400: Problem,
      401: Problem,
      404: Problem,
    },
  },
  leaderboard: {
    method: 'GET',
    path: '/v1/incidents/leaderboard',
    query: z.object({
      cityId: z.string().default('baghdad'),
      period: z.enum(['week', 'month', 'allTime']).default('month'),
    }),
    responses: {
      200: LeaderboardResponse,
      400: Problem,
    },
  },
});
