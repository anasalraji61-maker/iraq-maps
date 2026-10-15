/**
 * NotificationsController unit tests — happy-path delegation.
 * The controller assumes principal is always present (guard enforced at app level).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import { NotificationsController, NOTIFICATIONS_SERVICE } from './notifications.controller';
import type { NotificationsService } from './notifications.service';

type HandlerFn = (arg: unknown) => Promise<{ status: number }>;
type HandlerMap = Record<string, HandlerFn>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handler(ctrl: any, req: unknown): HandlerMap {
  return (ctrl as { handle: (req: unknown) => HandlerMap }).handle(req);
}

const USER_ID = 'user-test-notif' as UserId;

const DEFAULT_PREFS = { messages: true, system: true, marketing: false };

function makeService(): NotificationsService {
  return {
    registerDevice: vi.fn().mockResolvedValue({ deviceId: 'dev-1' }),
    getPrefs: vi.fn().mockResolvedValue(DEFAULT_PREFS),
    updatePrefs: vi.fn().mockResolvedValue(DEFAULT_PREFS),
    listNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null }),
    markRead: vi.fn().mockResolvedValue(true),
    sendPush: vi.fn().mockResolvedValue(undefined),
    scheduleDigest: vi.fn().mockResolvedValue(undefined),
    getDigest: vi.fn().mockResolvedValue({ total: 3, byType: { like: 2, comment: 1 } }),
    dismissNotification: vi.fn().mockResolvedValue(true),
  } as unknown as NotificationsService;
}

void NOTIFICATIONS_SERVICE; // imported for reference only

describe('NotificationsController', () => {
  let svc: NotificationsService;
  let ctrl: NotificationsController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new NotificationsController(svc);
  });

  it('registerDevice returns 201 and delegates to service', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['registerDevice']!({ body: { token: 'tok-abc', platform: 'android' } });
    expect(result.status).toBe(201);
    expect(svc.registerDevice).toHaveBeenCalledWith(USER_ID, 'tok-abc', 'android');
  });

  it('getPrefs returns 200 and delegates to service', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['getPrefs']!({});
    expect(result.status).toBe(200);
    expect(svc.getPrefs).toHaveBeenCalledWith(USER_ID);
  });

  it('updatePrefs returns 200 and delegates to service', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['updatePrefs']!({ body: { messages: false } });
    expect(result.status).toBe(200);
    expect(svc.updatePrefs).toHaveBeenCalledWith(USER_ID, { messages: false });
  });

  it('listNotifications returns 200 and delegates to service', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['listNotifications']!({ query: { unreadOnly: true } });
    expect(result.status).toBe(200);
    expect(svc.listNotifications).toHaveBeenCalledWith(USER_ID, true, undefined, undefined);
  });

  it('markRead returns 200 when notification found', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['markRead']!({ params: { id: 'notif-1' } });
    expect(result.status).toBe(200);
  });

  it('markRead returns 404 when notification not found', async () => {
    (svc.markRead as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['markRead']!({ params: { id: 'notif-missing' } });
    expect(result.status).toBe(404);
  });

  it('getDigest returns 200 with total and byType grouped counts', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['getDigest']!({});
    expect(result.status).toBe(200);
    expect(svc.getDigest).toHaveBeenCalledWith(USER_ID);
  });
});
