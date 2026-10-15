/**
 * DiscoverController unit tests — focused on auth guard behaviour.
 * The controller delegates all business logic to DiscoverService, so these
 * tests only verify the 401/403/404 short-circuits when principal is absent,
 * plus the happy-path delegation shape for a representative handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserId, PostIdType } from '@iraq-maps/contracts';
import { DiscoverController, AdminDiscoverController } from './discover.controller';
import type { DiscoverService } from './discover.service';

type HandlerFn = (arg: unknown) => Promise<{ status: number }>;
type HandlerMap = Record<string, HandlerFn>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handler(ctrl: any, req: unknown): HandlerMap {
  return (ctrl as { handle: (req: unknown) => HandlerMap }).handle(req);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adminHandler(ctrl: any, req: unknown): HandlerMap {
  return (ctrl as { adminHandle: (req: unknown) => HandlerMap }).adminHandle(req);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeService(): DiscoverService {
  return {
    listFeed: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    getPost: vi.fn().mockResolvedValue({ id: 'post-1', body: 'test' }),
    createPost: vi.fn().mockResolvedValue({ id: 'post-new', body: 'new' }),
    likePost: vi.fn().mockResolvedValue({ liked: true }),
    unlikePost: vi.fn().mockResolvedValue({ liked: false }),
    deletePost: vi.fn().mockResolvedValue(true),
    updatePost: vi.fn().mockResolvedValue({ id: 'post-1', body: 'updated' }),
    listComments: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    createComment: vi.fn().mockResolvedValue({ id: 'comment-1', body: 'ok' }),
    deleteComment: vi.fn().mockResolvedValue(true),
    reportPost: vi.fn().mockResolvedValue(undefined),
    userPosts: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    trending: vi.fn().mockResolvedValue({ items: [] }),
    searchPosts: vi.fn().mockResolvedValue({ items: [], nextCursor: undefined }),
    adminListReported: vi.fn().mockResolvedValue([]),
    adminApprovePost: vi.fn().mockResolvedValue(undefined),
    adminRemovePost: vi.fn().mockResolvedValue(undefined),
  } as unknown as DiscoverService;
}

const USER_ID = 'user-test-001' as UserId;
const POST_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' as PostIdType;

// ─── DiscoverController ───────────────────────────────────────────────────────

describe('DiscoverController', () => {
  let svc: DiscoverService;
  let ctrl: DiscoverController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new DiscoverController(svc, null, null, null);
  });

  it('listFeed returns 401 when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['listFeed']!({ query: {} });
    expect(result.status).toBe(401);
    expect(svc.listFeed).not.toHaveBeenCalled();
  });

  it('listFeed calls service and returns 200 when authenticated', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['listFeed']!({ query: {} });
    expect(result.status).toBe(200);
    expect(svc.listFeed).toHaveBeenCalledWith(USER_ID, undefined, undefined, undefined);
  });

  it('createPost returns 400 when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['createPost']!({ body: { type: 'tip', body: 'x', mediaAssetIds: [] } });
    expect(result.status).toBe(400);
  });

  it('deletePost returns 404 when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['deletePost']!({ params: { postId: POST_ID } });
    expect(result.status).toBe(404);
  });

  it('deletePost returns 403 when service returns false (not author)', async () => {
    (svc.deletePost as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['deletePost']!({ params: { postId: POST_ID } });
    expect(result.status).toBe(403);
  });

  it('deletePost returns 204 when service returns true', async () => {
    const h = handler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['deletePost']!({ params: { postId: POST_ID } });
    expect(result.status).toBe(204);
  });

  it('searchPosts returns 401 when no principal', async () => {
    const h = handler(ctrl, { principal: undefined });
    const result = await h['searchPosts']!({ query: { q: '#test' } });
    expect(result.status).toBe(401);
  });
});

// ─── AdminDiscoverController ──────────────────────────────────────────────────

describe('AdminDiscoverController', () => {
  let svc: DiscoverService;
  let ctrl: AdminDiscoverController;

  beforeEach(() => {
    svc = makeService();
    ctrl = new AdminDiscoverController(svc);
  });

  it('returns 403 when principal has no admin/moderator role', async () => {
    const h = adminHandler(ctrl, { principal: { userId: USER_ID, roles: ['user'] } });
    const result = await h['reportedPosts']!({});
    expect(result.status).toBe(403);
  });

  it('returns reported posts when principal is admin', async () => {
    (svc.adminListReported as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'post-1' }]);
    const h = adminHandler(ctrl, { principal: { userId: USER_ID, roles: ['admin'] } });
    const result = await h['reportedPosts']!({});
    expect(result.status).toBe(200);
  });

  it('returns reported posts when principal is moderator', async () => {
    const h = adminHandler(ctrl, { principal: { userId: USER_ID, roles: ['moderator'] } });
    const result = await h['reportedPosts']!({});
    expect(result.status).toBe(200);
  });
});
