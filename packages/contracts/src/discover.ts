import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { PlaceId, UserId } from './common';

const c = initContract();

export const PostId = z.string().uuid().brand('PostId');
export const CommentId = z.string().uuid().brand('CommentId');

export const PostType = z.enum(['photo', 'tip', 'event', 'offer']);

/** Content category for discovery filtering. @public M90 */
export const PostCategory = z.enum(['food', 'transport', 'tourism', 'shopping', 'services', 'other']);
export type PostCategory = z.infer<typeof PostCategory>;

export const DiscoverPost = z.object({
  id: PostId,
  authorId: UserId,
  placeId: PlaceId.optional(),
  type: PostType,
  /** Content category for discover filtering. @M90 */
  category: PostCategory.optional(),
  body: z.string().max(1000),
  mediaAssetIds: z.array(z.string().uuid()).max(4),
  likeCount: z.number().int().default(0),
  commentCount: z.number().int().default(0),
  viewCount: z.number().int().default(0),
  bookmarkCount: z.number().int().default(0),
  /** IDs of users @mentioned in the post body. */
  mentionedUserIds: z.array(UserId).default([]),
  isLikedByMe: z.boolean().default(false),
  /** True when the post author is a verified provider. @M93 */
  authorVerified: z.boolean().default(false),
  /** Whether this post is pinned to the top of the author's profile feed. */
  isPinned: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const DiscoverComment = z.object({
  id: CommentId,
  postId: PostId,
  authorId: UserId,
  body: z.string().max(500),
  /** Number of likes on this comment. @M175 */
  likeCount: z.number().int().default(0),
  /** Whether the current user has liked this comment. @M175 */
  isLikedByMe: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const PostEditEntry = z.object({
  id: z.string().uuid(),
  postId: PostId,
  previousBody: z.string(),
  editedAt: z.string().datetime(),
});

export const UserSearchResult = z.object({
  userId: UserId,
  username: z.string(),
  displayName: z.string(),
});

export const discoverContract = c.router({
  listFeed: {
    method: 'GET',
    path: '/discover/feed',
    query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().max(20).default(10), category: PostCategory.optional() }),
    responses: {
      200: z.object({ items: z.array(DiscoverPost), nextCursor: z.string().optional() }),
    },
    summary: 'Paginated discover feed',
  },
  createPost: {
    method: 'POST',
    path: '/discover/posts',
    body: z.object({ type: PostType, category: PostCategory.optional(), body: z.string().max(1000), placeId: PlaceId.optional(), mediaAssetIds: z.array(z.string().uuid()).max(4).optional(), mentionedUserIds: z.array(UserId).optional() }),
    responses: {
      201: DiscoverPost,
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
      422: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(422), code: z.string() }),
      429: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(429), code: z.string(), retryAfterMs: z.number().int() }),
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
      422: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(422), code: z.string() }),
    },
    summary: 'Comment on a post',
  },
  deleteComment: {
    method: 'DELETE',
    path: '/discover/posts/:postId/comments/:commentId',
    pathParams: z.object({ postId: PostId, commentId: CommentId }),
    responses: {
      204: z.undefined(),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Delete own comment',
  },
  likeComment: {
    method: 'POST',
    path: '/discover/comments/:commentId/like',
    pathParams: z.object({ commentId: CommentId }),
    body: z.object({}),
    responses: {
      200: z.object({ likeCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Like a comment (M175)',
  },
  unlikeComment: {
    method: 'DELETE',
    path: '/discover/comments/:commentId/like',
    pathParams: z.object({ commentId: CommentId }),
    responses: {
      200: z.object({ likeCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Unlike a comment (M175)',
  },
  getPost: {
    method: 'GET',
    path: '/discover/posts/:postId',
    pathParams: z.object({ postId: PostId }),
    responses: {
      200: DiscoverPost,
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Fetch a single post by ID',
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
  pinPost: {
    method: 'PATCH',
    path: '/discover/posts/:postId/pin',
    pathParams: z.object({ postId: PostId }),
    body: z.object({ pinned: z.boolean() }),
    responses: {
      200: DiscoverPost,
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Pin or unpin a post to the top of the author profile feed (provider only)',
  },
  reportPost: {
    method: 'POST',
    path: '/discover/posts/:postId/report',
    pathParams: z.object({ postId: PostId }),
    body: z.object({ reason: z.enum(['spam', 'inappropriate', 'misinformation', 'other']) }),
    responses: {
      204: z.undefined(),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
      429: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(429), code: z.string(), retryAfterMs: z.number().int() }),
    },
    summary: 'Report a post for review',
  },
  trending: {
    method: 'GET',
    path: '/discover/trending',
    query: z.object({ limit: z.coerce.number().int().max(20).default(10) }),
    responses: {
      200: z.object({ items: z.array(DiscoverPost) }),
    },
    summary: 'Trending posts by engagement score (last 48h)',
  },
  searchPosts: {
    method: 'GET',
    path: '/discover/search',
    query: z.object({
      q: z.string().min(1).max(200),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().max(20).default(10),
    }),
    responses: {
      200: z.object({ items: z.array(DiscoverPost), nextCursor: z.string().optional() }),
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
    },
    summary: 'Full-text search across post bodies',
  },
  userPosts: {
    method: 'GET',
    path: '/discover/users/:authorId/posts',
    pathParams: z.object({ authorId: UserId }),
    query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().max(20).default(10) }),
    responses: {
      200: z.object({ items: z.array(DiscoverPost), nextCursor: z.string().optional() }),
    },
    summary: "Paginated list of a user's posts",
  },

  getPostStats: {
    method: 'GET',
    path: '/discover/posts/:postId/stats',
    pathParams: z.object({ postId: PostId }),
    responses: {
      200: z.object({
        viewCount: z.number().int(),
        likeCount: z.number().int(),
        commentCount: z.number().int(),
        uniqueViewerCount: z.number().int(),
      }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Get analytics stats for a post',
  },

  trendingHashtags: {
    method: 'GET',
    path: '/discover/trending/hashtags',
    query: z.object({ limit: z.coerce.number().int().max(50).default(10) }),
    responses: {
      200: z.object({
        items: z.array(z.object({ hashtag: z.string(), count: z.number().int() })),
      }),
    },
    summary: 'Top hashtags by usage in last 24h',
  },

  getUserStats: {
    method: 'GET',
    path: '/discover/users/:userId/stats',
    pathParams: z.object({ userId: UserId }),
    responses: {
      200: z.object({
        postCount: z.number().int(),
        followersCount: z.number().int(),
        followingCount: z.number().int(),
        totalLikes: z.number().int(),
      }),
    },
    summary: 'Aggregated stats for a user',
  },

  recommended: {
    method: 'GET',
    path: '/discover/recommended',
    query: z.object({ limit: z.coerce.number().int().max(20).default(10) }),
    responses: {
      200: z.object({ items: z.array(DiscoverPost) }),
    },
    summary: 'Personalised post recommendations',
  },

  searchSuggestions: {
    method: 'GET',
    path: '/discover/search/suggestions',
    query: z.object({ q: z.string().min(1).max(100) }),
    responses: {
      200: z.object({
        hashtags: z.array(z.string()),
        userIds: z.array(UserId),
      }),
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
    },
    summary: 'Autocomplete suggestions for hashtags and users',
  },

  followUser: {
    method: 'POST',
    path: '/discover/users/:userId/follow',
    pathParams: z.object({ userId: UserId }),
    body: z.object({}),
    responses: {
      200: z.object({ followersCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Follow a user',
  },

  unfollowUser: {
    method: 'DELETE',
    path: '/discover/users/:userId/follow',
    pathParams: z.object({ userId: UserId }),
    responses: {
      200: z.object({ followersCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Unfollow a user',
  },

  bookmarkPost: {
    method: 'POST',
    path: '/discover/posts/:postId/bookmark',
    pathParams: z.object({ postId: PostId }),
    body: z.object({}),
    responses: {
      200: z.object({ bookmarkCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Bookmark a post',
  },

  unbookmarkPost: {
    method: 'DELETE',
    path: '/discover/posts/:postId/bookmark',
    pathParams: z.object({ postId: PostId }),
    responses: {
      200: z.object({ bookmarkCount: z.number().int() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Remove bookmark from a post',
  },

  getPostEdits: {
    method: 'GET',
    path: '/discover/posts/:postId/edits',
    pathParams: z.object({ postId: PostId }),
    responses: {
      200: z.object({ items: z.array(PostEditEntry) }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Edit history for a post',
  },

  searchUsers: {
    method: 'GET',
    path: '/discover/users/search',
    query: z.object({ q: z.string().min(1).max(100), limit: z.coerce.number().int().max(20).default(10) }),
    responses: {
      200: z.object({ items: z.array(UserSearchResult) }),
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
    },
    summary: '@mention autocomplete: search users by username/displayName prefix',
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
export type PostEditEntryType = z.infer<typeof PostEditEntry>;
export type UserSearchResultType = z.infer<typeof UserSearchResult>;

// ─── Stories ──────────────────────────────────────────────────────────────────

export const StoryId = z.string().uuid().brand('StoryId');
export type StoryId = z.infer<typeof StoryId>;

export const Story = z.object({
  id: StoryId,
  authorId: UserId,
  mediaUrl: z.string().url(),
  mediaType: z.enum(['image', 'video']),
  duration: z.number().int().min(1).max(60).default(5),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  /** Whether the current user has viewed this story */
  viewedByMe: z.boolean().default(false),
});
export type StoryType = z.infer<typeof Story>;

export const StoryAuthor = z.object({
  userId: UserId,
  displayName: z.string(),
  stories: z.array(Story),
  hasUnviewed: z.boolean(),
});
export type StoryAuthorType = z.infer<typeof StoryAuthor>;

export const storiesContract = c.router({
  createStory: {
    method: 'POST',
    path: '/discover/stories',
    body: z.object({
      mediaUrl: z.string().url(),
      mediaType: z.enum(['image', 'video']),
      duration: z.number().int().min(1).max(60).optional(),
    }),
    responses: {
      201: Story,
      400: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(400), code: z.string() }),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
    },
    summary: 'Create a new story (expires after 24h)',
  },
  getFeed: {
    method: 'GET',
    path: '/discover/stories/feed',
    responses: {
      200: z.object({ authors: z.array(StoryAuthor) }),
      401: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(401), code: z.string() }),
    },
    summary: 'Active stories from followed users + own stories',
  },
  deleteStory: {
    method: 'DELETE',
    path: '/discover/stories/:storyId',
    pathParams: z.object({ storyId: StoryId }),
    responses: {
      204: z.undefined(),
      403: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(403), code: z.string() }),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Delete own story',
  },
  markViewed: {
    method: 'POST',
    path: '/discover/stories/:storyId/view',
    pathParams: z.object({ storyId: StoryId }),
    body: z.object({}),
    responses: {
      204: z.undefined(),
      404: z.object({ type: z.literal('about:blank'), title: z.string(), status: z.literal(404), code: z.string() }),
    },
    summary: 'Mark a story as viewed by current user',
  },
});

export type StoryIdType = z.infer<typeof StoryId>;
