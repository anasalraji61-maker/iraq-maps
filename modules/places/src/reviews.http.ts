/**
 * M75: Reviews HTTP controller — wires reviewsContract to ReviewsService.
 */
import { type AuthPrincipal, type PlaceId, reviewsContract, type UserId } from '@iraq-maps/contracts';
import { Controller, Inject, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { ReviewsService } from './reviews';

export const REVIEWS_SERVICE = Symbol('ReviewsService');

interface AuthedRequest { principal?: AuthPrincipal }

@Controller()
export class ReviewsController {
  constructor(
    @Inject(REVIEWS_SERVICE) private readonly svc: ReviewsService,
  ) {}

  @TsRestHandler(reviewsContract)
  handle(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId as UserId | undefined;

    return tsRestHandler(reviewsContract, {
      submit: async ({ params, body }) => {
        if (!userId) return { status: 401, body: { code: 'unauthenticated' as const } };
        try {
          const review = await this.svc.submit(params.placeId as PlaceId, userId, body.rating, body.text);
          return { status: 201, body: review };
        } catch (e) {
          return { status: 400, body: { code: String(e) } };
        }
      },

      list: async ({ params, query }) => {
        const result = await this.svc.list(params.placeId as PlaceId, query.cursor);
        return { status: 200, body: result };
      },

      deleteOwn: async ({ params }) => {
        if (!userId) return { status: 404, body: { code: 'not_found' as const } };
        const deleted = await this.svc.deleteOwn(params.placeId as PlaceId, userId);
        if (!deleted) return { status: 404, body: { code: 'not_found' as const } };
        return { status: 200, body: { ok: true as const } };
      },
    });
  }
}
