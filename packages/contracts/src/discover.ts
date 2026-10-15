import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { PlaceId, UserId } from './common';

const c = initContract();

export const PostId = z.string().uuid().brand('PostId');
export const CommentId = z.string().uuid().brand('CommentId');

export const PostType = z.enum(['photo', 'tip', 'event', 'offer']);

export const DiscoverPost = z.object({
  id: PostId,
  authorId: UserId,
  placeId: PlaceId.optional(),
  type: PostType,
  body: z.string().max(1000),
  mediaAssetIds: z.array(z.string().uuid()).max(4),
  likeCount: z.number().int().default(0),
  commentCount: z.number().int().default(0),
  isLikedByMe: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const DiscoverComment = z.object({
  id: CommentId,
  postId: PostId,
  authorId: UserId,
  body: z.string().max(500),
  createdAt: z.string().datetime(),
});

export const discoverContract = c.router({
  listFeed: {
    method: 'GET',
    path: '/discover/feed',
    query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().max(20).default(10) }),
    responses: {
      200: z.object({ items: z.array(DiscoverPost), nextCursor: z.string().optional() }),
    },
    summary: 'Paginated discover feed',
  },
  createPost: {
    method: 'POST',
    path: '/discover/posts',
    body: z.object({ type: PostType, body: z.string().max(1000), placeId: PlaceId.optional(), mediaAssetIds: z.array(z.string().uuid()).max(4).optional() }),
    responses: {
      201: DiscoverPost,
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
    },
    summary: 'Create a discover post',
  },
  likePost: {
    method: 'POST',
    path: '/discover/posts/:postId/like',
    pathParams: z.object({ postId: PostId }),
    body: z.object({}),
    responses: {
      200: z.object({ likeCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Like a post',
  },
  unlikePost: {
    method: 'DELETE',
    path: '/discover/posts/:postId/like',
    pathParams: z.object({ postId: PostId }),
    responses: {
      200: z.object({ likeCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Unlike a post',
  },
  listComments: {
    method: 'GET',
    path: '/discover/posts/:postId/comments',
    pathParams: z.object({ postId: PostId }),
    query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().max(20).default(10) }),
    responses: {
      200: z.object({ items: z.array(DiscoverComment), nextCursor: z.string().optional() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'List comments on a post',
  },
  createComment: {
    method: 'POST',
    path: '/discover/posts/:postId/comments',
    pathParams: z.object({ postId: PostId }),
    body: z.object({ body: z.string().max(500) }),
    responses: {
      201: DiscoverComment,
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Comment on a post',
  },
  updatePost: {
    method: 'PATCH',
    path: '/discover/posts/:postId',
    pathParams: z.object({ postId: PostId }),
    body: z.object({ body: z.string().min(1).max(1000) }),
    responses: {
      200: DiscoverPost,
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Edit own post body',
  },
  deletePost: {
    method: 'DELETE',
    path: '/discover/posts/:postId',
    pathParams: z.object({ postId: PostId }),
    responses: {
      204: z.undefined(),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Delete own post',
  },
  reportPost: {
    method: 'POST',
    path: '/discover/posts/:postId/report',
    pathParams: z.object({ postId: PostId }),
    body: z.object({ reason: z.enum(['spam', 'inappropriate', 'misinformation', 'other']) }),
    responses: {
      204: z.undefined(),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Report a post for review',
  },
});

export const ReportedPostView = z.object({
  id: PostId,
  authorId: UserId,
  body: z.string(),
  type: PostType,
  reportCount: z.number().int(),
  reasons: z.array(z.string()),
  createdAt: z.string().datetime(),
  removedAt: z.string().datetime().nullable(),
});

export const adminDiscoverContract = c.router({
  reportedPosts: {
    method: 'GET',
    path: '/admin/discover/reported',
    responses: {
      200: z.array(ReportedPostView),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
    },
    summary: 'List reported posts (admin/moderator)',
  },
  approvePost: {
    method: 'POST',
    path: '/admin/discover/posts/:postId/approve',
    pathParams: z.object({ postId: PostId }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Clear reports from a post (admin/moderator)',
  },
  removePost: {
    method: 'POST',
    path: '/admin/discover/posts/:postId/remove',
    pathParams: z.object({ postId: PostId }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Soft-delete a post (admin/moderator)',
  },
});

export type PostIdType = z.infer<typeof PostId>;
export type DiscoverPostType = z.infer<typeof DiscoverPost>;
