/**
 * tour3d contract – 3D virtual walk-through scenes for Iraq.
 * Module: modules/tour3d
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, LngLat, PlaceId, Problem, paginated } from './common';

const c = initContract();

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export const Tour3DSceneId = z.string().uuid().brand<'Tour3DSceneId'>();
export type Tour3DSceneId = z.infer<typeof Tour3DSceneId>;

export const Tour3DAssetId = z.string().uuid().brand<'Tour3DAssetId'>();
export type Tour3DAssetId = z.infer<typeof Tour3DAssetId>;

export const Tour3DAnnotationId = z.string().uuid().brand<'Tour3DAnnotationId'>();
export type Tour3DAnnotationId = z.infer<typeof Tour3DAnnotationId>;

export const Tour3DCategory = z.enum([
  'heritage',
  'mosque',
  'market',
  'park',
  'museum',
  'shrine',
  'bridge',
  'neighborhood',
  'other',
]);
export type Tour3DCategory = z.infer<typeof Tour3DCategory>;

export const Tour3DAssetType = z.enum(['photo360', 'video360', 'model3d']);
export type Tour3DAssetType = z.infer<typeof Tour3DAssetType>;

export const Tour3DIconType = z.enum(['info', 'place', 'photo', 'food', 'mosque', 'historic', 'shop']);
export type Tour3DIconType = z.infer<typeof Tour3DIconType>;

/** A single scene point's viewing orientation. */
export const TourPoint = z.object({
  /** [longitude, latitude] */
  location: LngLat,
  /** Altitude in metres above ground (0 = ground level). */
  altitude: z.number().min(0).max(500).default(0),
  /** Camera heading in degrees (0 = north, 90 = east). */
  heading: z.number().min(0).max(360).default(0),
  /** Camera pitch in degrees (0 = horizon, 90 = straight up, -90 = down). */
  pitch: z.number().min(-90).max(90).default(0),
});
export type TourPoint = z.infer<typeof TourPoint>;

/** A 360° photo, 360° video or 3D model asset belonging to a scene. */
export const Tour3DAsset = z.object({
  id: Tour3DAssetId,
  sceneId: Tour3DSceneId,
  type: Tour3DAssetType,
  /** Public CDN URL of the asset. */
  url: z.string().url(),
  /** Heading at which this asset is viewed (useful for sequenced panoramas). */
  heading: z.number().min(0).max(360).default(0),
  pitch: z.number().min(-90).max(90).default(0),
  altitude: z.number().min(0).max(500).default(0),
  /** Display order within the scene (ascending). */
  sequenceOrder: z.number().int().min(0).default(0),
  labelAr: z.string().max(200).nullable(),
  labelEn: z.string().max(200).nullable(),
  createdAt: z.string().datetime(),
});
export type Tour3DAsset = z.infer<typeof Tour3DAsset>;

/** A geo-anchored annotation overlaid on the scene. */
export const Tour3DAnnotation = z.object({
  id: Tour3DAnnotationId,
  sceneId: Tour3DSceneId,
  location: LngLat,
  altitude: z.number().min(0).max(500).default(0),
  labelAr: z.string().max(200),
  labelCkb: z.string().max(200).nullable(),
  labelEn: z.string().max(200).nullable(),
  iconType: Tour3DIconType,
  /** Optional link to a place in the places module. */
  linkedPlaceId: PlaceId.nullable(),
});
export type Tour3DAnnotation = z.infer<typeof Tour3DAnnotation>;

/** A 3D virtual tour scene. */
export const Tour3DScene = z.object({
  id: Tour3DSceneId,
  nameAr: z.string().max(200),
  nameCkb: z.string().max(200).nullable(),
  nameEn: z.string().max(200).nullable(),
  descriptionAr: z.string().max(2000).nullable(),
  location: LngLat,
  altitude: z.number().min(0).max(500).default(0),
  city: CityId,
  category: Tour3DCategory,
  thumbnailUrl: z.string().url().nullable(),
  viewCount: z.number().int().min(0).default(0),
  /** Total number of assets belonging to this scene. */
  assetCount: z.number().int().min(0).default(0),
  createdAt: z.string().datetime(),
});
export type Tour3DScene = z.infer<typeof Tour3DScene>;

export const Tour3DSceneDetail = Tour3DScene.extend({
  assets: z.array(Tour3DAsset),
  annotations: z.array(Tour3DAnnotation),
});
export type Tour3DSceneDetail = z.infer<typeof Tour3DSceneDetail>;

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export const CreateTour3DSceneRequest = z.object({
  nameAr: z.string().min(1).max(200),
  nameCkb: z.string().max(200).optional(),
  nameEn: z.string().max(200).optional(),
  descriptionAr: z.string().max(2000).optional(),
  location: LngLat,
  altitude: z.number().min(0).max(500).optional(),
  city: CityId,
  category: Tour3DCategory,
  thumbnailUrl: z.string().url().optional(),
});
export type CreateTour3DSceneRequest = z.infer<typeof CreateTour3DSceneRequest>;

export const AddTour3DAssetRequest = z.object({
  type: Tour3DAssetType,
  url: z.string().url(),
  heading: z.number().min(0).max(360).optional(),
  pitch: z.number().min(-90).max(90).optional(),
  altitude: z.number().min(0).max(500).optional(),
  sequenceOrder: z.number().int().min(0).optional(),
  labelAr: z.string().max(200).optional(),
  labelEn: z.string().max(200).optional(),
});
export type AddTour3DAssetRequest = z.infer<typeof AddTour3DAssetRequest>;

// ---------------------------------------------------------------------------
// REST contract
// ---------------------------------------------------------------------------

export const tour3dContract = c.router({
  listScenes: {
    method: 'GET',
    path: '/v1/tour3d/scenes',
    query: z.object({
      city: CityId.optional(),
      category: Tour3DCategory.optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().min(0.1).max(100).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: paginated(Tour3DScene),
    },
    summary: 'List available 3D tour scenes',
  },

  getScene: {
    method: 'GET',
    path: '/v1/tour3d/scenes/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: {
      200: Tour3DSceneDetail,
      404: Problem,
    },
    summary: 'Get a 3D tour scene with all assets and annotations',
  },

  getSceneAssets: {
    method: 'GET',
    path: '/v1/tour3d/scenes/:id/assets',
    pathParams: z.object({ id: z.string().uuid() }),
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    }),
    responses: {
      200: paginated(Tour3DAsset),
      404: Problem,
    },
    summary: 'Paginated list of assets for a scene',
  },

  createScene: {
    method: 'POST',
    path: '/v1/tour3d/scenes',
    body: CreateTour3DSceneRequest,
    responses: {
      201: Tour3DScene,
      400: Problem,
      401: Problem,
      403: Problem,
    },
    summary: 'Admin: create a new 3D tour scene',
    metadata: { requiresAuth: true, roles: ['admin'] } as const,
  },

  addAsset: {
    method: 'POST',
    path: '/v1/tour3d/scenes/:id/assets',
    pathParams: z.object({ id: z.string().uuid() }),
    body: AddTour3DAssetRequest,
    responses: {
      201: Tour3DAsset,
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Admin: add an asset to a scene',
    metadata: { requiresAuth: true, roles: ['admin'] } as const,
  },

  recordView: {
    method: 'POST',
    path: '/v1/tour3d/scenes/:id/view',
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      404: Problem,
    },
    summary: 'Record a view for a scene (fire-and-forget)',
  },
});

// Legacy reserved port – kept for backwards compat
export interface Tour3DPort {
  getTour(placeId: PlaceId): Promise<{ placeId: PlaceId; sceneUrl: string; attribution: string } | null>;
}
