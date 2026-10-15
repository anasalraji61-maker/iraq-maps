import { adminProvidersContract, type PlaceId, type ProviderId, providersContract, type AuthPrincipal } from '@iraq-maps/contracts';
import { Controller, Req } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { ProvidersService } from './providers.service';

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank', title, status, code } as const,
});

/** Minimal shape of what IdentityAuthGuard leaves on the request. */
interface AuthedRequest { principal?: AuthPrincipal }

@Controller()
export class ProvidersController {
  constructor(private readonly svc: ProvidersService) {}

  @TsRestHandler(providersContract)
  providers(@Req() req: AuthedRequest) {
    const userId = req.principal?.userId;
    if (!userId) {
      return tsRestHandler(providersContract, {
        create: async () => problem(401, 'unauthorized', 'Authentication required'),
        me: async () => problem(401, 'unauthorized', 'Authentication required'),
        update: async () => problem(401, 'unauthorized', 'Authentication required'),
        phoneStart: async () => problem(401, 'unauthorized', 'Authentication required'),
        phoneConfirm: async () => problem(401, 'unauthorized', 'Authentication required'),
        claim: async () => problem(401, 'unauthorized', 'Authentication required'),
        submit: async () => problem(401, 'unauthorized', 'Authentication required'),
        consents: async () => problem(401, 'unauthorized', 'Authentication required'),
        setConsent: async () => problem(401, 'unauthorized', 'Authentication required'),
      });
    }

    const providerMeResponse = async (row: Awaited<ReturnType<typeof this.svc.getByUserId>>) => {
      if (!row) return problem(404, 'provider_not_found', 'Provider not found');
      const consents = await this.svc.getActiveConsents(row.id as ProviderId);
      return { status: 200 as const, body: this.svc.toProviderMe(row, consents) };
    };

    return tsRestHandler(providersContract, {
      create: async ({ body }) => {
        try {
          const row = await this.svc.register(userId, body);
          const consents = await this.svc.getActiveConsents(row.id as ProviderId);
          return { status: 201, body: this.svc.toProviderMe(row, consents) };
        } catch (e: unknown) {
          if (isNestException(e, 409)) return problem(409, getCode(e), getMessage(e));
          throw e;
        }
      },
      me: async () => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        const consents = await this.svc.getActiveConsents(row.id as ProviderId);
        return { status: 200, body: this.svc.toProviderMe(row, consents) };
      },
      update: async ({ body }) => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        try {
          const updated = await this.svc.update(userId, row.id as ProviderId, body);
          const consents = await this.svc.getActiveConsents(updated.id as ProviderId);
          return { status: 200, body: this.svc.toProviderMe(updated, consents) };
        } catch (e: unknown) {
          if (isNestException(e, 403)) return problem(404, 'forbidden', 'Access denied');
          throw e;
        }
      },
      phoneStart: async ({ body }) => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        const result = await this.svc.startPhoneVerification(userId, row.id as ProviderId, body.phone, body.locale);
        return { status: 202, body: { verificationId: result.verificationId, expiresAt: result.expiresAt.toISOString() } };
      },
      phoneConfirm: async ({ body }) => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        const updated = await this.svc.confirmPhoneVerification(userId, row.id as ProviderId, body.verificationId, body.code);
        const consents = await this.svc.getActiveConsents(updated.id as ProviderId);
        return { status: 200, body: this.svc.toProviderMe(updated, consents) };
      },
      claim: async ({ body }) => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        try {
          const updated = await this.svc.claimPlace(userId, row.id as ProviderId, body.placeId as PlaceId);
          return providerMeResponse(updated);
        } catch (e: unknown) {
          if (isNestException(e, 409)) return problem(409, getCode(e), getMessage(e));
          throw e;
        }
      },
      submit: async () => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        try {
          const updated = await this.svc.submit(userId, row.id as ProviderId);
          return providerMeResponse(updated);
        } catch (e: unknown) {
          if (isNestException(e, 409)) return problem(409, getCode(e), getMessage(e));
          throw e;
        }
      },
      consents: async () => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        const ledger = await this.svc.getConsentLedger(row.id as ProviderId);
        return { status: 200, body: ledger };
      },
      setConsent: async ({ params, body }) => {
        const row = await this.svc.getByUserId(userId);
        if (!row) return problem(404, 'provider_not_found', 'Provider not found');
        if (body.granted) {
          await this.svc.grantConsent(userId, row.id as ProviderId, params.scope, body.evidence);
        } else {
          await this.svc.revokeConsent(userId, row.id as ProviderId, params.scope);
        }
        const ledger = await this.svc.getConsentLedger(row.id as ProviderId);
        return { status: 200, body: ledger };
      },
    });
  }
}

@Controller()
export class AdminProvidersController {
  constructor(private readonly svc: ProvidersService) {}

  @TsRestHandler(adminProvidersContract)
  adminProviders(@Req() req: AuthedRequest) {
    const roles = req.principal?.roles ?? [];
    if (!roles.includes('admin') && !roles.includes('moderator')) {
      return tsRestHandler(adminProvidersContract, {
        queue: async () => problem(403, 'forbidden', 'Admin role required'),
        verify: async () => problem(403, 'forbidden', 'Admin role required'),
        suspend: async () => problem(403, 'forbidden', 'Admin role required'),
        reject: async () => problem(403, 'forbidden', 'Admin role required'),
        auditLog: async () => problem(403, 'forbidden', 'Admin role required'),
      });
    }

    const adminUserId = req.principal!.userId;
    const getProviderOrProblem = async (id: string) => {
      const view = await this.svc.adminGetProvider(id as ProviderId);
      if (!view) return { ok: false as const, prob: problem(404, 'provider_not_found', 'Provider not found') };
      return { ok: true as const, view };
    };

    /** Run an admin action, map 404/409 to problem responses, then return the updated view. */
    const withView = async (fn: () => Promise<unknown>, id: string, opts = { conflict: false }) => {
      try {
        await fn();
      } catch (e: unknown) {
        if (isNestException(e, 404)) return problem(404, getCode(e), getMessage(e));
        if (opts.conflict && isNestException(e, 409)) return problem(409, getCode(e), getMessage(e));
        throw e;
      }
      const r = await getProviderOrProblem(id);
      return r.ok ? { status: 200 as const, body: r.view } : r.prob;
    };

    return tsRestHandler(adminProvidersContract, {
      queue: async ({ query }) => {
        const result = await this.svc.adminListQueue(query.status, query.cursor);
        return { status: 200, body: result };
      },
      verify: async ({ params }) =>
        withView(() => this.svc.adminVerify(adminUserId, params.id), params.id, { conflict: true }),
      suspend: async ({ params, body }) => {
        try {
          await this.svc.adminSuspend(adminUserId, params.id, body.reason);
        } catch (e: unknown) {
          if (isNestException(e, 404)) return problem(404, getCode(e), getMessage(e));
          throw e;
        }
        const r = await getProviderOrProblem(params.id);
        return r.ok ? { status: 200 as const, body: r.view } : r.prob;
      },
      reject: async ({ params, body }) =>
        withView(() => this.svc.adminReject(adminUserId, params.id, body.reason), params.id, { conflict: true }),
      auditLog: async () => {
        const rows = await this.svc.adminAuditLog(100);
        const body = rows.map((r) => ({
          id: r.id,
          action: r.action,
          providerNameAr: r.providerName,
          adminUser: r.actorUserId,
          timestamp: r.at,
        }));
        return { status: 200, body };
      },
    });
  }
}

function isNestException(e: unknown, status: number): boolean {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === status;
}

function getCode(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const resp = (e as { response: unknown }).response;
    if (typeof resp === 'object' && resp !== null && 'code' in resp) return String((resp as { code: string }).code);
  }
  return 'error';
}

function getMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: string }).message);
  return 'Error';
}
