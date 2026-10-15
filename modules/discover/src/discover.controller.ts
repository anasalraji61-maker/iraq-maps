import { type AuthPrincipal, type PostIdType, CommentId, adminDiscoverContract, discoverContract } from '@iraq-maps/contracts';
import { type z } from 'zod';
type CommentIdType = z.infer<typeof CommentId>;
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { DiscoverService } from './discover.service';

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank' as const, title, status, code },
});

/** Minimal shape of what IdentityAuthGuard leaves on the request. */
interface AuthedRequest { principal?: AuthPrincipal }

@Controller()
export class DiscoverController {
  constructor(private readonly svc: DiscoverService) {}

  @TsRestHandler(discoverContract)
  handle(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(discoverContract, {
      listFeed: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.listFeed(userId, query.cursor, query.limit);
        return { status: 200, body: result };
      },

      createPost: async ({ body }) => {
        if (!userId) return problem(400, 'unauthorized', 'Authentication required') as never;
        const post = await this.svc.createPost(userId, body);
        return { status: 201, body: post };
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
        try {
          const comment = await this.svc.createComment(userId, params.postId as PostIdType, body.body);
          return { status: 201, body: comment };
        } catch {
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

      reportPost: async ({ params, body }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          await this.svc.reportPost(userId, params.postId as PostIdType, body.reason);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found') as never;
          throw e;
        }
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
          await this.svc.adminApprovePost(params.postId as PostIdType);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Post not found');
          throw e;
        }
      },
      removePost: async ({ params }) => {
        try {
          await this.svc.adminRemovePost(params.postId as PostIdType);
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
