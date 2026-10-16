import {
  type AppointmentId,
  type AuthPrincipal,
  appointmentsContract,
  type ProviderId,
  providerPromotionsContract,
  providerInsightsContract,
  type ProviderInsightsDateRange,
} from '@iraq-maps/contracts';
import type { ProviderPromotionId } from '@iraq-maps/contracts';
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { PromotionsService } from './promotions.service';
import { ProvidersService } from './providers.service';

interface AuthedRequest { principal?: AuthPrincipal }

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank', title, status, code } as const,
});

@Controller()
export class PromotionsController {
  constructor(
    private readonly svc: PromotionsService,
    private readonly providersSvc: ProvidersService,
  ) {}

  @TsRestHandler(providerPromotionsContract)
  promotions(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(providerPromotionsContract, {
      create: async ({ body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const provider = await this.providersSvc.getByUserId(userId);
        if (!provider) return problem(404, 'provider_not_found', 'Provider not found');
        const promotion = await this.svc.createPromotion(provider.id as ProviderId, body);
        return { status: 201, body: promotion };
      },
      listActive: async () => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const provider = await this.providersSvc.getByUserId(userId);
        if (!provider) return problem(401, 'unauthorized', 'Provider not found');
        const promotions = await this.svc.getActivePromotions(provider.id as ProviderId);
        return { status: 200, body: promotions };
      },
      listByProvider: async ({ params }) => {
        const promotions = await this.svc.listByProvider(params.providerId as ProviderId);
        return { status: 200, body: promotions };
      },
      delete: async ({ params }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const provider = await this.providersSvc.getByUserId(userId);
        if (!provider) return problem(401, 'unauthorized', 'Provider not found');
        try {
          await this.svc.deletePromotion(provider.id as ProviderId, params.id as unknown as ProviderPromotionId);
          return { status: 204, body: undefined };
        } catch {
          return problem(404, 'not_found', 'Promotion not found');
        }
      },
    });
  }

  @TsRestHandler(appointmentsContract)
  appointments(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(appointmentsContract, {
      request: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const appt = await this.svc.requestAppointment(userId, params.providerId, body);
        return { status: 201, body: appt };
      },
      listForProvider: async ({ params }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const provider = await this.providersSvc.getByUserId(userId);
        if (!provider || provider.id !== params.providerId) return problem(403, 'forbidden', 'Access denied');
        const appts = await this.svc.listForProvider(params.providerId);
        return { status: 200, body: appts };
      },
      update: async ({ params, body }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const provider = await this.providersSvc.getByUserId(userId);
        if (!provider || provider.id !== params.providerId) return problem(403, 'forbidden', 'Access denied');
        try {
          const appt = await this.svc.updateAppointment(params.providerId, params.id as AppointmentId, body);
          return { status: 200, body: appt };
        } catch {
          return problem(404, 'not_found', 'Appointment not found');
        }
      },
      myAppointments: async () => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const appts = await this.svc.myAppointments(userId);
        return { status: 200, body: appts };
      },
    });
  }

  @TsRestHandler(providerInsightsContract)
  providerInsights(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;

    return tsRestHandler(providerInsightsContract, {
      get: async ({ params, query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const provider = await this.providersSvc.getByUserId(userId);
        if (!provider || provider.id !== params.providerId) return problem(403, 'forbidden', 'Access denied');
        const range: ProviderInsightsDateRange = (query.range as ProviderInsightsDateRange) ?? '30d';
        const insights = await this.svc.getProviderInsights(params.providerId, range);
        return { status: 200, body: insights };
      },
    });
  }
}
