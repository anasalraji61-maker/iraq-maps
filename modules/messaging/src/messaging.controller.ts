import { type AuthPrincipal, type InquiryId, messagingContract } from '@iraq-maps/contracts';
import { Controller, Inject } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { MessagingService } from './messaging.service';

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank', title, status, code } as const,
});

export const AUTH_PRINCIPAL = 'AUTH_PRINCIPAL';
const WHATSAPP_VERIFY_TOKEN = process.env['WHATSAPP_VERIFY_TOKEN'] ?? '';

@Controller()
export class MessagingController {
  constructor(private readonly svc: MessagingService) {}

  @TsRestHandler(messagingContract)
  handle(@Inject(AUTH_PRINCIPAL) principal: AuthPrincipal | null) {
    const userId = principal?.userId;
    const isProvider = principal?.roles.includes('provider') ?? false;

    return tsRestHandler(messagingContract, {
      createInquiry: async ({ body, headers }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required');
        const idempotencyKey = headers['idempotency-key'];
        try {
          const inquiry = await this.svc.createInquiry(userId, body.text, body.placeIds, idempotencyKey);
          return { status: 201, body: inquiry };
        } catch (e: unknown) {
          if (isHttpException(e, 429)) return { status: 429, body: { code: 'daily_limit_exceeded' as const } };
          if (isHttpException(e, 400)) return { status: 400, body: { code: getCode(e) } };
          throw e;
        }
      },

      listInquiries: async ({ query }) => {
        if (!userId) return problem(401, 'unauthorized', 'Authentication required') as never;
        const result = await this.svc.listInquiries(userId, query.cursor);
        return { status: 200, body: { items: result.items, nextCursor: result.nextCursor } };
      },

      getInquiry: async ({ params }) => {
        if (!userId) return problem(404, 'not_found', 'Not found') as never;
        try {
          const inquiry = await this.svc.getInquiry(params.id as InquiryId, userId);
          return { status: 200, body: inquiry };
        } catch {
          return { status: 404, body: { code: 'not_found' as const } };
        }
      },

      listProviderInquiries: async ({ query }) => {
        if (!userId || !isProvider) return problem(403, 'forbidden', 'Provider role required') as never;
        const result = await this.svc.listProviderInbox(userId, query.cursor);
        return { status: 200, body: { items: result.items as never[], nextCursor: result.nextCursor } };
      },

      replyToInquiry: async ({ params, body }) => {
        if (!userId || !isProvider) return { status: 404, body: { code: 'not_found' as const } };
        try {
          await this.svc.providerReply(userId, params.id as InquiryId, body.text);
          return { status: 200, body: { ok: true as const } };
        } catch {
          return { status: 404, body: { code: 'not_found' as const } };
        }
      },

      optOut: async () => {
        if (!userId || !isProvider) return { status: 200, body: { ok: true as const } };
        await this.svc.providerOptOut(userId);
        return { status: 200, body: { ok: true as const } };
      },

      whatsappVerify: async ({ query }) => {
        if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN) {
          return { status: 200, body: query['hub.challenge'] };
        }
        return { status: 200, body: 'forbidden' };
      },

      whatsappInbound: async ({ body }) => {
        await this.svc.handleInbound(body, {});
        return { status: 200, body: { ok: true as const } };
      },
    });
  }
}

function isHttpException(e: unknown, status: number): boolean {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === status;
}

function getCode(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'response' in e) {
    const r = (e as { response: unknown }).response;
    if (typeof r === 'object' && r !== null && 'code' in r) return String((r as { code: string }).code);
  }
  return 'error';
}
