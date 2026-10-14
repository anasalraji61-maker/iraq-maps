import { type AuthPrincipal, type PostIdType, discoverContract } from '@iraq-maps/contracts';
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
    });
  }
}

function isNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === 404;
}
