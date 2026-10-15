/**
 * ProvidersController unit tests — focused on auth guard behaviour.
 * The controller returns 401 for every endpoint when no principal is present.
 * We also verify happy-path delegation for `me` and `create`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import { ProvidersController } from './providers.controller';
import type { ProvidersService } from './providers.service';

type HandlerFn = (arg: unknown) => Promise<{ status: number }>;
type HandlerMap = Record<string, HandlerFn>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handler(ctrl: any, req: unknown): HandlerMap {
  return (ctrl as { providers: (req: unknown) => HandlerMap }).providers(req);
}

const USER_ID = 'user-test-providers' as UserId;

function makeRow() {
  return { id: 'prov-1', userId: USER_ID, name: 'Test', status: 'pending', category: 'food' };
}

function makeService(): ProvidersService {
  return {
    getByUserId: vi.fn().mockResolvedValue(makeRow()),
    register: vi.fn().mockResolvedValue(makeRow()),
    update: vi.fn().mockResolvedValue(makeRow()),
    getActiveConsents: vi.fn().mockResolvedValue([]),
    toProviderMe: vi.fn().mockReturnValue({ id: 'prov-1', name: 'Test' }),
    startPhoneVerification: vi.fn(),
    confirmPhoneVerification: vi.fn(),
    submitForReview: vi.fn(),
    setConsent: vi.fn(),
    getConsents: vi.fn().mockResolvedValue([]),
    getAdminList: vi.fn().mockResolvedValue([]),
    adminApprove: vi.fn(),
    adminReject: vi.fn(),
    claim: vi.fn().mockResolvedValue(makeRow()),
  } as unknown as ProvidersService;
}

describe('ProvidersController', () => {
  let svc: ProvidersService;
  let ctrl: ProvidersController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new ProvidersController(svc);
  });

  it('returns 401 for all endpoints when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const endpoints = ['create', 'me', 'update', 'phoneStart', 'phoneConfirm', 'submit', 'consents', 'setConsent', 'claim'];
    for (const ep of endpoints) {
      const result = await h[ep]!({ body: {}, params: {}, query: {} });
      expect(result.status, `${ep} should be 401`).toBe(401);
    }
  });

  it('me returns 200 when provider exists', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['provider'] } });
    const result = await h['me']!({});
    expect(result.status).toBe(200);
    expect(svc.getByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it('me returns 404 when provider not found', async () => {
    (svc.getByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['me']!({});
    expect(result.status).toBe(404);
  });

  it('create delegates to service and returns 201', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['create']!({ body: { name: 'Test Biz', category: 'food', phone: '+9647001234567', locale: 'ar' } });
    expect(result.status).toBe(201);
    expect(svc.register).toHaveBeenCalled();
  });
});
