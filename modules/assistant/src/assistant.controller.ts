import { assistantContract } from '@iraq-maps/contracts';
import { Controller } from '@nestjs/common';
import { TsRestHandler, tsRestHandler } from '@ts-rest/nest';
import { AssistantService } from './assistant.service.js';

// TODO: replace with real auth principal injection (M6+)
const PLACEHOLDER_USER_ID = '00000000-0000-0000-0000-000000000000';

const problem = <S extends number>(status: S, code: string, title: string) => ({
  status,
  body: { type: 'about:blank' as const, title, status, code },
});

@Controller()
export class AssistantController {
  constructor(private readonly svc: AssistantService) {}

  @TsRestHandler(assistantContract)
  handle() {
    const userId = PLACEHOLDER_USER_ID;

    return tsRestHandler(assistantContract, {
      chat: async ({ body }) => {
        try {
          const result = await this.svc.chat(userId, body);
          return { status: 200 as const, body: result };
        } catch (e: unknown) {
          if (isHttpException(e, 429)) {
            return {
              status: 429 as const,
              body: { type: 'about:blank' as const, title: 'Too many requests', status: 429 as const, code: 'daily_limit_exceeded' },
            };
          }
          throw e;
        }
      },

      getSession: async ({ params }) => {
        const session = await this.svc.getSession(userId, params.sessionId);
        if (!session) {
          return problem(404, 'not_found', 'Session not found') as never;
        }
        return {
          status: 200 as const,
          body: {
            sessionId: session.sessionId as typeof params.sessionId,
            messages: session.messages as Array<{ role: 'user' | 'assistant'; content: string }>,
            createdAt: session.createdAt,
          },
        };
      },

      deleteSession: async ({ params }) => {
        const deleted = await this.svc.deleteSession(userId, params.sessionId);
        if (!deleted) {
          return problem(404, 'not_found', 'Session not found') as never;
        }
        return { status: 204 as const, body: undefined };
      },
    });
  }
}

function isHttpException(e: unknown, status: number): boolean {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === status;
}
