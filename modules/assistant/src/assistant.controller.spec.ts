/**
 * AssistantController unit tests — auth guard and happy-path behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import { AssistantController } from './assistant.controller.js';
import type { AssistantService } from './assistant.service.js';

type HandlerFn = (arg: unknown) => Promise<{ status: number }>;
type HandlerMap = Record<string, HandlerFn>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handler(ctrl: any, req: unknown): HandlerMap {
  // AssistantController.handle() needs a second arg (reply) for header setting
  return (ctrl as { handle: (req: unknown, reply: unknown) => HandlerMap }).handle(req, { header: vi.fn() });
}

const USER_ID = 'user-test-assistant' as UserId;

function makeService(): AssistantService {
  return {
    chat: vi.fn().mockResolvedValue({
      reply: 'مرحباً',
      sessionId: 'sess-1',
      rateLimitRemaining: 9,
      rateLimitReset: '2024-01-01T00:00:00Z',
    }),
    getSession: vi.fn().mockResolvedValue({
      sessionId: 'sess-1',
      messages: [],
      createdAt: '2024-01-01T00:00:00Z',
    }),
    deleteSession: vi.fn().mockResolvedValue(true),
    getUsageLast30Days: vi.fn().mockResolvedValue([]),
  } as unknown as AssistantService;
}

describe('AssistantController', () => {
  let svc: AssistantService;
  let ctrl: AssistantController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new AssistantController(svc);
  });

  it('returns 401 for chat when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['chat']!({ body: { text: 'hello', sessionId: undefined } });
    expect(result.status).toBe(401);
    expect(svc.chat).not.toHaveBeenCalled();
  });

  it('returns 401 for getSession when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['getSession']!({ params: { sessionId: 'sess-1' } });
    expect(result.status).toBe(401);
  });

  it('returns 401 for deleteSession when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['deleteSession']!({ params: { sessionId: 'sess-1' } });
    expect(result.status).toBe(401);
  });

  it('chat returns 200 when authenticated', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['chat']!({ body: { text: 'hello', sessionId: undefined } });
    expect(result.status).toBe(200);
    expect(svc.chat).toHaveBeenCalledWith(USER_ID, { text: 'hello', sessionId: undefined });
  });

  it('getSession returns 404 when session not found', async () => {
    (svc.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['getSession']!({ params: { sessionId: 'sess-missing' } });
    expect(result.status).toBe(404);
  });

  it('deleteSession returns 204 when session deleted', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['deleteSession']!({ params: { sessionId: 'sess-1' } });
    expect(result.status).toBe(204);
  });

  it('deleteSession returns 404 when session not found', async () => {
    (svc.deleteSession as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['deleteSession']!({ params: { sessionId: 'sess-missing' } });
    expect(result.status).toBe(404);
  });
});
