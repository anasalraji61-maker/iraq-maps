import { type AuthPrincipal, type PostIdType, type UserId, CommentId, adminDiscoverContract, discoverContract } from '@iraq-maps/contracts';
import { type z } from 'zod';
type CommentIdType = z.infer<typeof CommentId>;
import { Controller, Inject, Optional, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { DiscoverService } from './discover.service';
import type { SlidingWindowRateLimiter } from './rate-limiter';

const problem = <S extends number>(status: S, code: string, title: string, extra?: Record<string, unknown>) => ({
  status,
  body: { type: 'about:blank' as const, title, status, code, ...extra },
});

/** Minimal shape of what IdentityAuthGuard leaves on the request. */
interface AuthedRequest { principal?: AuthPrincipal }

@Controller()
export class DiscoverController {
  constructor(
    private readonly svc: DiscoverService,
    @Optional() @Inject('DISCOVER_POST_RATE_LIMITER') private readonly postLimiter: SlidingWindowRateLimiter | null,
    @Optional() @Inject('DISCOVER_REPORT_RATE_LIMITER') private readonly reportLimiter: SlidingWindowRateLimiter | null,
    @Optional() @Inject('DISCOVER_COMMENT_RATE_LIMITER') private readonly commentLimiter: SlidingWindowRateLimiter | null,
  ) {}

  @TsRestHandler(discoverContract)
  handle(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(discoverContract, {
      listFeed: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.listFeed(userId, query.cursor, query.limit, query.category);
        return { status: 200, body: result };
      },

      getPost: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const post = await this.svc.getPost(userId, params.postId as PostIdType);
          return { status: 200, body: post };
        } catch {
          return problem(404, 'not_found', 'Post not found') as never;
        }
      },

      createPost: async ({ body }) => {
        if (!userId) return problem(400, 'unauthorized', 'Authentication required') as never;
        if (this.postLimiter) {
          const rl = await this.postLimiter.check(`post:${userId}`);
          if (!rl.allowed) return problem(429, 'rate_limited', 'Too many posts', { retryAfterMs: rl.retryAfterMs }) as never;
        }
        try {
          const post = await this.svc.createPost(userId, body);
          return { status: 201, body: post };
        } catch (e: unknown) {
          if (isContentBlocked(e)) return problem(422, 'content_blocked', 'Content contains a blocked word') as never;
          throw e;
        }
      },

      likePost: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.likePost(userId, params.postId as PostIdType);
          return { status: 200, body: result };
        } catch {
          return problem(404, 'not_found', 'Post not found') as never;
        }
      },

      unlikePost: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.unlikePost(userId, params.postId as PostIdType);
          return { status: 200, body: result };
        } catch {
          return problem(404, 'not_found', 'Post not found') as never;
        }
      },

      listComments: async ({ params, query }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.listComments(userId, params.postId as PostIdType, query.cursor, query.limit);
          return { status: 200, body: result };
        } catch {
          return problem(404, 'not_found', 'Post not found') as never;
        }
      },

      createComment: async ({ params, body }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        if (this.commentLimiter) {
          const rl = await this.commentLimiter.check(`comment:${userId}`);
          if (!rl.allowed) return problem(429, 'rate_limited', 'Too many comments', { retryAfterMs: rl.retryAfterMs }) as never;
        }
        try {
          const comment = await this.svc.createComment(userId, params.postId as PostIdType, body.body);
          return { status: 201, body: comment };
        } catch (e: unknown) {
          if (isContentBlocked(e)) return problem(422, 'content_blocked', 'Content contains a blocked word') as never;
          return problem(404, 'not_found', 'Post not found') as never;
        }
      },

      deleteComment: async ({ params }) => {
        if (!userId) return problem(403, 'forbidden', 'Not authenticated') as never;
        try {
          const deleted = await this.svc.deleteComment(userId, params.commentId as CommentIdType);
          if (!deleted) return problem(403, 'forbidden', 'Not the comment author') as never;
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Comment not found') as never;
          throw e;
        }
      },

      likeComment: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.likeComment(userId, params.commentId as CommentIdType);
          return { status: 200, body: result };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Comment not found') as never;
          throw e;
        }
      },

      unlikeComment: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.unlikeComment(userId, params.commentId as CommentIdType);
          return { status: 200, body: result };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Comment not found') as never;
          throw e;
        }
      },

      updatePost: async ({ params, body }) => {
        if (!userId) return problem(403, 'forbidden', 'Not authenticated') as never;
        try {
          const updated = await this.svc.updatePost(userId, params.postId as PostIdType, body.body);
          if (!updated) return problem(403, 'forbidden', 'Not the post author') as never;
          return { status: 200, body: updated };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      deletePost: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const deleted = await this.svc.deletePost(userId, params.postId as PostIdType);
          if (!deleted) return problem(403, 'forbidden', 'Not the post author') as never;
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      pinPost: async ({ params, body }) => {
        if (!userId) return problem(403, 'forbidden', 'Not authenticated') as never;
        try {
          const post = await this.svc.pinPost(userId, params.postId as PostIdType, body.pinned);
          if (!post) return problem(403, 'forbidden', 'Not the post author') as never;
          return { status: 200, body: post };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      reportPost: async ({ params, body }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        if (this.reportLimiter) {
          const rl = await this.reportLimiter.check(`report:${userId}`);
          if (!rl.allowed) return problem(429, 'rate_limited', 'Too many reports', { retryAfterMs: rl.retryAfterMs }) as never;
        }
        try {
          await this.svc.reportPost(userId, params.postId as PostIdType, body.reason);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      userPosts: async ({ params, query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.userPosts(userId, params.authorId, query.cursor, query.limit);
        return { status: 200, body: result };
      },

      trending: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.trending(userId, query.limit);
        return { status: 200, body: result };
      },

      searchPosts: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.searchPosts(userId, query.q, query.cursor, query.limit);
        return { status: 200, body: result };
      },

      getPostStats: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const stats = await this.svc.getPostStats(userId, params.postId as PostIdType);
          return { status: 200, body: stats };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      trendingHashtags: async ({ query }) => {
        const result = await this.svc.trendingHashtags(query.limit);
        return { status: 200, body: { items: result } };
      },

      getUserStats: async ({ params }) => {
        const stats = await this.svc.getUserStats(params.userId as UserId);
        return { status: 200, body: stats };
      },

      recommended: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.recommended(userId, query.limit);
        return { status: 200, body: result };
      },

      searchSuggestions: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.searchSuggestions(query.q);
        return { status: 200, body: result };
      },

      followUser: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        const result = await this.svc.followUser(userId, params.userId as UserId);
        return { status: 200, body: result };
      },

      unfollowUser: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        const result = await this.svc.unfollowUser(userId, params.userId as UserId);
        return { status: 200, body: result };
      },

      bookmarkPost: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.bookmarkPost(userId, params.postId as PostIdType);
          return { status: 200, body: result };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      unbookmarkPost: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.unbookmarkPost(userId, params.postId as PostIdType);
          return { status: 200, body: result };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      getPostEdits: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const result = await this.svc.getPostEdits(params.postId as PostIdType);
          return { status: 200, body: result };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
      },

      searchUsers: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.searchUsers(query.q, query.limit);
        return { status: 200, body: result };
      },
    });
  }
}

@Controller()
export class AdminDiscoverController {
  constructor(private readonly svc: DiscoverService) {}

  @TsRestHandler(adminDiscoverContract)
  adminHandle(@Req() req: AuthedRequest) {
    const roles = req.principal?.roles ?? [];
    if (!roles.includes('admin') && !roles.includes('moderator')) {
      return tsRestHandler(adminDiscoverContract, {
        reportedPosts: async () => problem(403, 'forbidden', 'Admin role required'),
        approvePost: async () => problem(403, 'forbidden', 'Admin role required'),
        removePost: async () => problem(403, 'forbidden', 'Admin role required'),
      });
    }

    return tsRestHandler(adminDiscoverContract, {
      reportedPosts: async () => {
        const posts = await this.svc.adminListReported();
        return { status: 200, body: posts };
      },
      approvePost: async ({ params }) => {
        try {
          await this.svc.adminApprovePost(params.postId as PostIdType, req.principal?.userId);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found');
          throw e;
        }
      },
      removePost: async ({ params }) => {
        try {
          await this.svc.adminRemovePost(params.postId as PostIdType, req.principal?.userId);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found');
          throw e;
        }
      },
    });
  }
}

function isNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === 404;
}

function isContentBlocked(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as Record<string, unknown>;
  // NestJS UnprocessableEntityException has status 422
  if ('status' in err && err['status'] === 422) return true;
  // Or check for the code in the response object
  if ('response' in err && typeof err['response'] === 'object' && err['response'] !== null) {
    const resp = err['response'] as Record<string, unknown>;
    return resp['code'] === 'content_blocked';
  }
  return false;
}
