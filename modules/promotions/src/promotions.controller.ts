/**
 * PromotionsController — HTTP endpoints for the promotions module.
 * Implemented with ts-rest @TsRestHandler to stay aligned with the typed contract.
 */
import {
  BrowsePromotionsQuery,
  CreatePromotionBody,
  Problem,
  PromotionId,
  UpdatePromotionBody,
  promotionsContract,
} from '@iraq-maps/contracts';
import { Controller, Inject, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import type { PromotionsService } from './promotions.service';

export const PROMOTIONS_SERVICE = Symbol('PROMOTIONS_SERVICE');

/** Extracted from the Bearer token by an upstream auth guard. */
interface RequestPrincipal {
  userId: string;
  providerId?: string;
}

/** Minimal interface matching NestJS request objects injected via @Req(). */
interface AuthenticatedRequest {
  principal?: RequestPrincipal;
}

function problem(status: number, title: string, code?: string): Problem {
  return { type: 'about:blank', title, status, code };
}

@Controller()
export class PromotionsController {
  constructor(
    @Inject(PROMOTIONS_SERVICE)
    private readonly svc: PromotionsService,
  ) {}

  @TsRestHandler(promotionsContract.browse)
  async browse() {
    return tsRestHandler(promotionsContract.browse, async ({ query }) => {
      const parsed = BrowsePromotionsQuery.safeParse(query);
      if (!parsed.success) {
        return { status: 400 as const, body: problem(400, 'Invalid query') };
      }
      const result = await this.svc.getActivePromotions(parsed.data);
      return { status: 200 as const, body: result };
    });
  }

  @TsRestHandler(promotionsContract.featured)
  async featured() {
    return tsRestHandler(promotionsContract.featured, async ({ query }) => {
      const items = await this.svc.getFeaturedPromotions(query.cityId);
      return { status: 200 as const, body: items };
    });
  }

  @TsRestHandler(promotionsContract.get)
  async getOne() {
    return tsRestHandler(promotionsContract.get, async ({ params }) => {
      const detail = await this.svc.getPromotion(params.id);
      if (!detail) return { status: 404 as const, body: problem(404, 'Not found') };
      return { status: 200 as const, body: detail };
    });
  }

  @TsRestHandler(promotionsContract.redeem)
  async redeem(@Req() req: AuthenticatedRequest) {
    if (!req.principal?.userId) {
      return tsRestHandler(promotionsContract.redeem, async () => ({ status: 401 as const, body: problem(401, 'Unauthenticated') }));
    }
    const userId = req.principal.userId;
    return tsRestHandler(promotionsContract.redeem, async ({ params, body }) => {
      try {
        const result = await this.svc.redeemPromotion(userId, params.id, body.code);
        return { status: 200 as const, body: { redemptionId: result.redemptionId as unknown as ReturnType<typeof PromotionId.parse>, message: result.message } };
      } catch (err: unknown) {
        const e = err as { code?: string; status?: number; message: string };
        const status = (e.status ?? 400) as 400 | 404 | 409 | 429;
        return { status, body: problem(status, e.message, e.code) };
      }
    });
  }

  // ── Provider-scoped ──────────────────────────────────────────────────────────

  @TsRestHandler(promotionsContract.listActive)
  async listActive(@Req() req: AuthenticatedRequest) {
    if (!req.principal?.providerId) {
      return tsRestHandler(promotionsContract.listActive, async () => ({ status: 401 as const, body: problem(401, 'Unauthenticated') }));
    }
    const providerId = req.principal.providerId;
    return tsRestHandler(promotionsContract.listActive, async () => {
      const promotions = await this.svc.getProviderPromotions(providerId);
      return { status: 200 as const, body: promotions };
    });
  }

  @TsRestHandler(promotionsContract.create)
  async create(@Req() req: AuthenticatedRequest) {
    if (!req.principal?.providerId) {
      return tsRestHandler(promotionsContract.create, async () => ({ status: 401 as const, body: problem(401, 'Unauthenticated') }));
    }
    const providerId = req.principal.providerId;
    return tsRestHandler(promotionsContract.create, async ({ body }) => {
      const parsed = CreatePromotionBody.safeParse(body);
      if (!parsed.success) {
        return { status: 400 as const, body: problem(400, 'Invalid body') };
      }
      try {
        const promo = await this.svc.createPromotion(providerId, parsed.data);
        return { status: 201 as const, body: promo };
      } catch (err: unknown) {
        const e = err as { code?: string; status?: number; message: string };
        const status = (e.status ?? 422) as 400 | 401 | 422;
        return { status, body: problem(status, e.message, e.code) };
      }
    });
  }

  @TsRestHandler(promotionsContract.update)
  async update(@Req() req: AuthenticatedRequest) {
    if (!req.principal?.providerId) {
      return tsRestHandler(promotionsContract.update, async () => ({ status: 401 as const, body: problem(401, 'Unauthenticated') }));
    }
    const providerId = req.principal.providerId;
    return tsRestHandler(promotionsContract.update, async ({ params, body }) => {
      const parsed = UpdatePromotionBody.safeParse(body);
      if (!parsed.success) {
        return { status: 400 as const, body: problem(400, 'Invalid body') };
      }
      try {
        const promo = await this.svc.updatePromotion(providerId, params.id, parsed.data);
        return { status: 200 as const, body: promo };
      } catch (err: unknown) {
        const e = err as { code?: string; status?: number; message: string };
        const status = (e.status ?? 400) as 400 | 401 | 403 | 404;
        return { status, body: problem(status, e.message, e.code) };
      }
    });
  }

  @TsRestHandler(promotionsContract.delete)
  async deletePromo(@Req() req: AuthenticatedRequest) {
    if (!req.principal?.providerId) {
      return tsRestHandler(promotionsContract.delete, async () => ({ status: 401 as const, body: problem(401, 'Unauthenticated') }));
    }
    const providerId = req.principal.providerId;
    return tsRestHandler(promotionsContract.delete, async ({ params }) => {
      try {
        await this.svc.deletePromotion(providerId, params.id);
        return { status: 204 as const, body: undefined };
      } catch (err: unknown) {
        const e = err as { code?: string; status?: number; message: string };
        const status = (e.status ?? 400) as 401 | 403 | 404;
        return { status, body: problem(status, e.message, e.code) };
      }
    });
  }

  @TsRestHandler(promotionsContract.stats)
  async stats(@Req() req: AuthenticatedRequest) {
    if (!req.principal?.providerId) {
      return tsRestHandler(promotionsContract.stats, async () => ({ status: 401 as const, body: problem(401, 'Unauthenticated') }));
    }
    const providerId = req.principal.providerId;
    return tsRestHandler(promotionsContract.stats, async ({ params }) => {
      try {
        const statsResult = await this.svc.getRedemptionStats(params.id, providerId);
        return { status: 200 as const, body: statsResult };
      } catch (err: unknown) {
        const e = err as { code?: string; status?: number; message: string };
        const status = (e.status ?? 400) as 401 | 403 | 404;
        return { status, body: problem(status, e.message, e.code) };
      }
    });
  }
}
