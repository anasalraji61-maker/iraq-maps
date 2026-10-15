/**
 * Social graph controller: follow / unfollow, blocks, feed, suggestions.
 * Handles all routes defined in socialGraphContract.
 */
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { socialGraphContract } from '@iraq-maps/contracts';
import type { AuthPrincipal, UserId } from '@iraq-maps/contracts';
import { SocialGraphService } from './social.service';

interface AuthedRequest {
  principal?: AuthPrincipal;
}

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank' as const, title, status, code },
});

@Controller()
export class SocialGraphController {
  constructor(private readonly svc: SocialGraphService) {}

  @TsRestHandler(socialGraphContract)
  handle(@Req() req: AuthedRequest) {
    const viewerId = req.principal?.userId;

    return tsRestHandler(socialGraphContract, {
      // ── Follow ────────────────────────────────────────────────────────────

      followUser: async ({ params }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const stats = await this.svc.followUser(viewerId, params.userId as UserId);
          return { status: 200, body: stats };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error';
          if (msg === 'cannot_follow_self') return problem(400, 'cannot_follow_self', 'Cannot follow yourself') as never;
          return problem(404, 'not_found', 'User not found') as never;
        }
      },

      unfollowUser: async ({ params }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const stats = await this.svc.unfollowUser(viewerId, params.userId as UserId);
        return { status: 200, body: stats };
      },

      removeFollower: async ({ params }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const stats = await this.svc.removeFollower(viewerId, params.userId as UserId);
        return { status: 200, body: stats };
      },

      // ── Followers / Following lists ────────────────────────────────────────

      getFollowers: async ({ params, query }) => {
        const vid = viewerId ?? (params.userId as UserId);
        const result = await this.svc.getFollowers(params.userId as UserId, vid, query);
        return { status: 200, body: result };
      },

      getFollowing: async ({ params, query }) => {
        const vid = viewerId ?? (params.userId as UserId);
        const result = await this.svc.getFollowing(params.userId as UserId, vid, query);
        return { status: 200, body: result };
      },

      // ── Profile ────────────────────────────────────────────────────────────

      getUserProfile: async ({ params }) => {
        const vid = viewerId ?? (params.userId as UserId);
        try {
          const profile = await this.svc.getUserProfile(params.userId as UserId, vid);
          return { status: 200, body: profile };
        } catch {
          return problem(404, 'not_found', 'User not found') as never;
        }
      },

      // ── Feed ───────────────────────────────────────────────────────────────

      getFollowFeed: async ({ query }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.getFollowFeed(viewerId, query);
        return { status: 200, body: result };
      },

      // ── Suggestions ────────────────────────────────────────────────────────

      getFollowSuggestions: async ({ query }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const items = await this.svc.getFollowSuggestions(viewerId, query.limit);
        return { status: 200, body: { items } };
      },

      dismissSuggestion: async ({ params }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        await this.svc.dismissSuggestion(viewerId, params.userId as UserId);
        return { status: 204, body: undefined };
      },

      // ── Mutual followers ───────────────────────────────────────────────────

      getMutualFollowers: async ({ params, query }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const result = await this.svc.getMutualFollowers(viewerId, params.userId as UserId, query.limit);
          return { status: 200, body: result };
        } catch {
          return problem(404, 'not_found', 'User not found') as never;
        }
      },

      // ── Blocks ─────────────────────────────────────────────────────────────

      blockUser: async ({ params }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          await this.svc.blockUser(viewerId, params.userId as UserId);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error';
          if (msg === 'cannot_block_self') return problem(400, 'cannot_block_self', 'Cannot block yourself') as never;
          return problem(400, 'bad_request', 'Block failed') as never;
        }
      },

      unblockUser: async ({ params }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        await this.svc.unblockUser(viewerId, params.userId as UserId);
        return { status: 204, body: undefined };
      },

      getBlockedUsers: async ({ query }) => {
        if (!viewerId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.getBlockedUsers(viewerId, query);
        return { status: 200, body: result };
      },
    });
  }
}
