import type { AuthPrincipal, UserId, PlaceId } from '@iraq-maps/contracts';
import { fullReviewsContract } from '@iraq-maps/contracts';
type PlaceIdType = PlaceId;
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { ReviewsService } from './reviews.service';
import type { ReviewIdType } from './types';

interface AuthedRequest {
  principal?: AuthPrincipal;
}

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: {
    type: 'about:blank' as const,
    title,
    status,
    code,
  },
});

@Controller()
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @TsRestHandler(fullReviewsContract)
  handle(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId as UserId | undefined;

    return tsRestHandler(fullReviewsContract, {
      createReview: async ({ body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const review = await this.svc.createReview(userId, {
            placeId: body.placeId as PlaceIdType,
            rating: body.rating,
            text: body.text,
            photos: body.photos,
            isAnonymous: body.isAnonymous,
            visitDate: body.visitDate,
          });
          return { status: 201, body: review as never };
        } catch (e: unknown) {
          if (isConflict(e)) return problem(409, 'already_reviewed', 'You have already reviewed this place') as never;
          if (isBadRequest(e)) return problem(400, 'invalid_input', getMsg(e)) as never;
          throw e;
        }
      },

      updateReview: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const review = await this.svc.updateReview(userId, params.id as ReviewIdType, body);
          return { status: 200, body: review as never };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Review not found') as never;
          if (isForbidden(e)) return problem(403, 'forbidden', 'You can only edit your own reviews') as never;
          if (isBadRequest(e)) return problem(400, 'invalid_input', getMsg(e)) as never;
          throw e;
        }
      },

      deleteReview: async ({ params }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          await this.svc.deleteReview(userId, params.id as ReviewIdType);
          return { status: 204, body: {} };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Review not found') as never;
          if (isForbidden(e)) return problem(403, 'forbidden', 'You can only delete your own reviews') as never;
          throw e;
        }
      },

      getPlaceReviews: async ({ params, query }) => {
        const page = await this.svc.getReviews(
          params.placeId as PlaceIdType,
          {
            sort: query.sort,
            rating: query.rating,
            cursor: query.cursor,
            limit: query.limit,
          },
          userId,
        );
        return { status: 200, body: page as never };
      },

      getUserReviews: async ({ params, query }) => {
        const page = await this.svc.getUserReviews(params.userId as UserId, {
          cursor: query.cursor,
          limit: query.limit,
        });
        return { status: 200, body: page as never };
      },

      voteReview: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          const result = await this.svc.voteReview(userId, params.id as ReviewIdType, { isHelpful: body.isHelpful });
          return { status: 200, body: result };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Review not found') as never;
          if (isBadRequest(e)) return problem(400, 'invalid_input', getMsg(e)) as never;
          throw e;
        }
      },

      reportReview: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        try {
          await this.svc.reportReview(userId, params.id as ReviewIdType, { reason: body.reason });
          return { status: 204, body: {} };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Review not found') as never;
          if (isConflict(e)) return problem(409, 'already_reported', 'You have already reported this review') as never;
          if (isBadRequest(e)) return problem(400, 'invalid_input', getMsg(e)) as never;
          throw e;
        }
      },

      respondToReview: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        // providerId = userId for provider-role users (auth guard enforces provider role upstream)
        try {
          const response = await this.svc.respondToReview(userId as string, params.id as ReviewIdType, { text: body.text });
          return { status: 200, body: response as never };
        } catch (e: unknown) {
          if (isNotFound(e)) return problem(404, 'not_found', 'Review not found') as never;
          if (isBadRequest(e)) return problem(400, 'invalid_input', getMsg(e)) as never;
          throw e;
        }
      },

      getPlaceRatingSummary: async ({ params }) => {
        const summary = await this.svc.getPlaceRatingSummary(params.placeId as PlaceIdType);
        return { status: 200, body: summary as never };
      },

      getTopReviewers: async ({ query }) => {
        const reviewers = await this.svc.getTopReviewers(query.limit);
        return { status: 200, body: { items: reviewers as never[] } };
      },
    });
  }
}

// ── Error helpers ─────────────────────────────────────────────────────────────

function isNotFound(e: unknown): boolean {
  return isHttpStatus(e, 404);
}
function isForbidden(e: unknown): boolean {
  return isHttpStatus(e, 403);
}
function isBadRequest(e: unknown): boolean {
  return isHttpStatus(e, 400);
}
function isConflict(e: unknown): boolean {
  return isHttpStatus(e, 409);
}
function isHttpStatus(e: unknown, status: number): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    (e as { status: number }).status === status
  );
}
function getMsg(e: unknown): string {
  return typeof e === 'object' && e !== null && 'message' in e
    ? String((e as { message: unknown }).message)
    : 'Invalid input';
}
