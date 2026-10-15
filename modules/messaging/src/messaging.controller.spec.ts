/**
 * MessagingController unit tests — focused on auth guard behaviour.
 * The controller returns 401/403/404 for every protected endpoint when no
 * principal is present, and delegates to service on the happy path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserId } from '@iraq-maps/contracts';
import { MessagingController } from './messaging.controller';
import type { MessagingService } from './messaging.service';

type HandlerFn = (arg: unknown) => Promise<{ status: number }>;
type HandlerMap = Record<string, HandlerFn>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handler(ctrl: any, req: unknown): HandlerMap {
  return (ctrl as { handle: (req: unknown) => HandlerMap }).handle(req);
}

const USER_ID = 'user-test-messaging' as UserId;

function makeService(): MessagingService {
  return {
    createInquiry: vi.fn().mockResolvedValue({ id: 'inq-1', text: 'hi' }),
    listInquiries: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    getInquiry: vi.fn().mockResolvedValue({ id: 'inq-1', text: 'hi' }),
    markInquiryRead: vi.fn().mockResolvedValue(undefined),
    listProviderInbox: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    providerReply: vi.fn().mockResolvedValue(undefined),
    providerOptOut: vi.fn().mockResolvedValue(undefined),
    handleInbound: vi.fn().mockResolvedValue(undefined),
  } as unknown as MessagingService;
}

describe('MessagingController', () => {
  let svc: MessagingService;
  let ctrl: MessagingController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new MessagingController(svc);
  });

  it('returns 401 for createInquiry when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['createInquiry']!({ body: { text: 'test', placeIds: [] }, headers: {} });
    expect(result.status).toBe(401);
    expect(svc.createInquiry).not.toHaveBeenCalled();
  });

  it('returns 401 for listInquiries when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['listInquiries']!({ query: {} });
    expect(result.status).toBe(401);
  });

  it('returns 404 for getInquiry when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['getInquiry']!({ params: { id: 'inq-1' } });
    expect(result.status).toBe(404);
  });

  it('returns 404 for markInquiryRead when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['markInquiryRead']!({ params: { id: 'inq-1' } });
    expect(result.status).toBe(404);
  });

  it('returns 403 for listProviderInquiries when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['listProviderInquiries']!({ query: {} });
    expect(result.status).toBe(403);
  });

  it('returns 403 for listProviderInquiries when user has no provider role', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['listProviderInquiries']!({ query: {} });
    expect(result.status).toBe(403);
  });

  it('returns 404 for replyToInquiry when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['replyToInquiry']!({ params: { id: 'inq-1' }, body: { text: 'ok' } });
    expect(result.status).toBe(404);
  });

  it('returns 404 for replyToInquiry when user has no provider role', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['replyToInquiry']!({ params: { id: 'inq-1' }, body: { text: 'ok' } });
    expect(result.status).toBe(404);
  });

  it('listInquiries returns 200 when authenticated', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['listInquiries']!({ query: {} });
    expect(result.status).toBe(200);
    expect(svc.listInquiries).toHaveBeenCalledWith(USER_ID, undefined);
  });

  it('listProviderInquiries returns 200 when principal has provider role', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['provider'] } });
    const result = await h['listProviderInquiries']!({ query: {} });
    expect(result.status).toBe(200);
    expect(svc.listProviderInbox).toHaveBeenCalledWith(USER_ID, undefined);
  });

  it('createInquiry returns 201 when authenticated', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['createInquiry']!({ body: { text: 'hello', placeIds: ['place-1'] }, headers: {} });
    expect(result.status).toBe(201);
    expect(svc.createInquiry).toHaveBeenCalled();
  });
});
