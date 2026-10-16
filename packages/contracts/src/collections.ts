/**
 * Place Collections contracts — curated lists of places.
 * User-owned metadata; ODbL-clean (no OSM fields in collection tables).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CityId, PlaceId, Problem, UserId } from './common';

const c = initContract();

// ── IDs ────────────────────────────────────────────────────────────────────

export const CollectionId = z.string().uuid().brand<'CollectionId'>();
export type CollectionId = z.infer<typeof CollectionId>;

// ── Enums ──────────────────────────────────────────────────────────────────

export const CollectionVisibility = z.enum(['public', 'followers', 'private']);
export type CollectionVisibility = z.infer<typeof CollectionVisibility>;

export const CollectionType = z.enum(['favorites', 'want_to_visit', 'visited', 'custom']);
export type CollectionType = z.infer<typeof CollectionType>;

// ── Shapes ─────────────────────────────────────────────────────────────────

export const CollectionSummary = z.object({
  id: CollectionId,
  userId: UserId,
  nameAr: z.string().max(100),
  nameEn: z.string().max(100).nullable(),
  descriptionAr: z.string().max(500).nullable(),
  descriptionEn: z.string().max(500).nullable(),
  coverUrl: z.string().url().nullable(),
  emoji: z.string().max(8).nullable(),
  visibility: CollectionVisibility,
  type: CollectionType,
  placeCount: z.number().int().nonnegative(),
  followerCount: z.number().int().nonnegative(),
  isOwner: z.boolean(),
  isFollowing: z.boolean(),
  isStaffPick: z.boolean(),
  ownerName: z.string().nullable(),
  ownerAvatarUrl: z.string().url().nullable(),
  city: CityId.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CollectionSummary = z.infer<typeof CollectionSummary>;

export const CollectionPlace = z.object({
  collectionId: CollectionId,
  placeId: PlaceId,
  note: z.string().max(300).nullable(),
  position: z.number().int().nonnegative(),
  addedAt: z.string().datetime(),
  // Denormalised place fields (user-owned metadata, not OSM-derived)
  placeName: z.string(),
  placeNameAr: z.string().nullable(),
  placeCategory: z.string().nullable(),
  location: z.tuple([z.number(), z.number()]).nullable(),
  coverImageUrl: z.string().url().nullable(),
  rating: z.number().min(0).max(5).nullable(),
});
export type CollectionPlace = z.infer<typeof CollectionPlace>;

export const CollectionDetail = CollectionSummary.extend({
  places: z.array(CollectionPlace),
});
export type CollectionDetail = z.infer<typeof CollectionDetail>;

// ── Request bodies ─────────────────────────────────────────────────────────

export const CreateCollectionBody = z.object({
  nameAr: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional(),
  descriptionAr: z.string().max(500).optional(),
  descriptionEn: z.string().max(500).optional(),
  emoji: z.string().max(8).optional(),
  visibility: CollectionVisibility.default('public'),
  type: CollectionType.default('custom'),
  city: CityId.optional(),
});
export type CreateCollectionBody = z.infer<typeof CreateCollectionBody>;

export const UpdateCollectionBody = z.object({
  nameAr: z.string().min(1).max(100).optional(),
  nameEn: z.string().max(100).optional(),
  descriptionAr: z.string().max(500).optional(),
  descriptionEn: z.string().max(500).optional(),
  emoji: z.string().max(8).optional(),
  coverUrl: z.string().url().optional(),
  visibility: CollectionVisibility.optional(),
  type: CollectionType.optional(),
  city: CityId.optional(),
});
export type UpdateCollectionBody = z.infer<typeof UpdateCollectionBody>;

export const AddPlaceBody = z.object({
  placeId: PlaceId,
  note: z.string().max(300).optional(),
});
export type AddPlaceBody = z.infer<typeof AddPlaceBody>;

export const ReorderPlacesBody = z.object({
  placeIds: z.array(PlaceId).min(1).max(500),
});
export type ReorderPlacesBody = z.infer<typeof ReorderPlacesBody>;

export const SearchCollectionsQuery = z.object({
  q: z.string().min(1).max(200),
  city: CityId.optional(),
  cursor: z.string().optional(),
});

export const FeaturedCollectionsQuery = z.object({
  city: CityId.optional(),
  cursor: z.string().optional(),
});

// ── Contract ───────────────────────────────────────────────────────────────

export const collectionsContract = c.router({
  /** List the calling user's own collections */
  getMyCollections: {
    method: 'GET',
    path: '/v1/collections/mine',
    responses: {
      200: z.object({ collections: z.array(CollectionSummary) }),
      401: Problem,
    },
    summary: 'Get my collections',
  },

  /** Create a new collection */
  createCollection: {
    method: 'POST',
    path: '/v1/collections',
    body: CreateCollectionBody,
    responses: {
      201: z.object({ collection: CollectionSummary }),
      400: Problem,
      401: Problem,
    },
    summary: 'Create collection',
  },

  /** Get full collection detail (places included) */
  getCollectionDetail: {
    method: 'GET',
    path: '/v1/collections/:collectionId',
    pathParams: z.object({ collectionId: CollectionId }),
    responses: {
      200: z.object({ collection: CollectionDetail }),
      403: Problem,
      404: Problem,
    },
    summary: 'Get collection detail',
  },

  /** Update a collection's metadata */
  updateCollection: {
    method: 'PATCH',
    path: '/v1/collections/:collectionId',
    pathParams: z.object({ collectionId: CollectionId }),
    body: UpdateCollectionBody,
    responses: {
      200: z.object({ collection: CollectionSummary }),
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Update collection',
  },

  /** Delete a collection */
  deleteCollection: {
    method: 'DELETE',
    path: '/v1/collections/:collectionId',
    pathParams: z.object({ collectionId: CollectionId }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Delete collection',
  },

  /** Add a place to a collection */
  addPlace: {
    method: 'POST',
    path: '/v1/collections/:collectionId/places',
    pathParams: z.object({ collectionId: CollectionId }),
    body: AddPlaceBody,
    responses: {
      201: z.object({ entry: CollectionPlace }),
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
      409: Problem, // already in collection
    },
    summary: 'Add place to collection',
  },

  /** Remove a place from a collection */
  removePlace: {
    method: 'DELETE',
    path: '/v1/collections/:collectionId/places/:placeId',
    pathParams: z.object({ collectionId: CollectionId, placeId: PlaceId }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Remove place from collection',
  },

  /** Reorder places in a collection */
  reorderPlaces: {
    method: 'PUT',
    path: '/v1/collections/:collectionId/places/order',
    pathParams: z.object({ collectionId: CollectionId }),
    body: ReorderPlacesBody,
    responses: {
      200: z.object({ ok: z.literal(true) }),
      400: Problem,
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Reorder places',
  },

  /** Follow a public collection */
  followCollection: {
    method: 'POST',
    path: '/v1/collections/:collectionId/follow',
    pathParams: z.object({ collectionId: CollectionId }),
    body: z.object({}),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      401: Problem,
      404: Problem,
      409: Problem,
    },
    summary: 'Follow collection',
  },

  /** Unfollow a collection */
  unfollowCollection: {
    method: 'DELETE',
    path: '/v1/collections/:collectionId/follow',
    pathParams: z.object({ collectionId: CollectionId }),
    body: z.object({}),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      401: Problem,
      404: Problem,
    },
    summary: 'Unfollow collection',
  },

  /** Get collections the user follows */
  getFollowedCollections: {
    method: 'GET',
    path: '/v1/collections/following',
    responses: {
      200: z.object({ collections: z.array(CollectionSummary) }),
      401: Problem,
    },
    summary: 'Get followed collections',
  },

  /** Staff-curated featured collections for a city */
  getFeaturedCollections: {
    method: 'GET',
    path: '/v1/collections/featured',
    query: FeaturedCollectionsQuery,
    responses: {
      200: z.object({ collections: z.array(CollectionSummary), nextCursor: z.string().nullable() }),
    },
    summary: 'Get featured collections',
  },

  /** Search public collections */
  searchCollections: {
    method: 'GET',
    path: '/v1/collections/search',
    query: SearchCollectionsQuery,
    responses: {
      200: z.object({ collections: z.array(CollectionSummary), nextCursor: z.string().nullable() }),
    },
    summary: 'Search collections',
  },

  /** Duplicate a collection into the caller's account */
  duplicateCollection: {
    method: 'POST',
    path: '/v1/collections/:collectionId/duplicate',
    pathParams: z.object({ collectionId: CollectionId }),
    body: z.object({}),
    responses: {
      201: z.object({ collection: CollectionSummary }),
      401: Problem,
      403: Problem,
      404: Problem,
    },
    summary: 'Duplicate collection',
  },

  /** Check which of the caller's collections contain a given place */
  getPlaceCollections: {
    method: 'GET',
    path: '/v1/collections/by-place/:placeId',
    pathParams: z.object({ placeId: PlaceId }),
    responses: {
      200: z.object({ collectionIds: z.array(CollectionId) }),
      401: Problem,
    },
    summary: 'Collections containing a place',
  },
});

export type CollectionsContract = typeof collectionsContract;
