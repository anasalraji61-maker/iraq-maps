/**
 * Social features controller: Events, Challenges, Marketplace
 */
import { eventsContract, challengesContract, marketplaceContract } from '@iraq-maps/contracts';
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { SocialService } from './social.service';
import type { AuthPrincipal } from '@iraq-maps/contracts';
import type { EventId, ChallengeId, ListingId } from '@iraq-maps/contracts';
import type { z } from 'zod';

type EventIdType = z.infer<typeof EventId>;
type ChallengeIdType = z.infer<typeof ChallengeId>;
type ListingIdType = z.infer<typeof ListingId>;

interface AuthedRequest { principal?: AuthPrincipal }

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank' as const, title, status, code },
});

@Controller()
export class SocialController {
  constructor(private readonly svc: SocialService) {}

  @TsRestHandler(eventsContract)
  handleEvents(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(eventsContract, {
      createEvent: async ({ body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const event = await this.svc.createEvent(userId, body);
        return { status: 201, body: event };
      },

      listEvents: async ({ query }) => {
        const uid = userId ?? ('anon' as string);
        const result = await this.svc.listEvents(uid!, query);
        return { status: 200, body: result };
      },

      getEvent: async ({ params }) => {
        const uid = userId ?? ('anon' as string);
        try {
          const event = await this.svc.getEvent(uid!, params.eventId as EventIdType);
          return { status: 200, body: event };
        } catch {
          return problem(404, 'not_found', 'Event not found') as never;
        }
      },

      rsvpEvent: async ({ params }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          await this.svc.rsvpEvent(userId, params.eventId as EventIdType);
          return { status: 204, body: undefined };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error';
          if (msg === 'Event not found') return problem(404, 'not_found', msg) as never;
          return problem(400, 'bad_request', msg) as never;
        }
      },

      cancelRsvp: async ({ params }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          await this.svc.cancelRsvp(userId, params.eventId as EventIdType);
          return { status: 204, body: undefined };
        } catch {
          return problem(404, 'not_found', 'Event not found') as never;
        }
      },
    });
  }

  @TsRestHandler(challengesContract)
  handleChallenges(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(challengesContract, {
      listChallenges: async ({ query }) => {
        const uid = userId ?? ('anon' as string);
        const result = await this.svc.listChallenges(uid!, query.status);
        return { status: 200, body: result };
      },

      getChallenge: async ({ params }) => {
        const uid = userId ?? ('anon' as string);
        try {
          const result = await this.svc.getChallenge(uid!, params.challengeId as ChallengeIdType);
          return { status: 200, body: result };
        } catch {
          return problem(404, 'not_found', 'Challenge not found') as never;
        }
      },

      recordProgress: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const result = await this.svc.recordProgress(userId, params.challengeId as ChallengeIdType, body.increment);
          return { status: 200, body: result };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error';
          if (msg === 'Challenge not found') return problem(404, 'not_found', msg) as never;
          return problem(400, 'bad_request', msg) as never;
        }
      },
    });
  }

  @TsRestHandler(marketplaceContract)
  handleMarketplace(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(marketplaceContract, {
      createListing: async ({ body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const sellerName = req.principal?.userId?.slice(0, 8) ?? 'unknown';
        const listing = await this.svc.createListing(userId, body, sellerName);
        return { status: 201, body: listing };
      },

      listListings: async ({ query }) => {
        const result = await this.svc.listListings(query);
        return { status: 200, body: result };
      },

      getListing: async ({ params }) => {
        try {
          const listing = await this.svc.getListing(params.listingId as ListingIdType);
          return { status: 200, body: listing };
        } catch {
          return problem(404, 'not_found', 'Listing not found') as never;
        }
      },

      updateListing: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const listing = await this.svc.updateListing(userId, params.listingId as ListingIdType, body);
          return { status: 200, body: listing };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error';
          if (msg === 'Not your listing') return problem(403, 'forbidden', msg) as never;
          if (msg === 'Listing not found') return problem(404, 'not_found', msg) as never;
          return problem(400, 'bad_request', msg) as never;
        }
      },
    });
  }
}
