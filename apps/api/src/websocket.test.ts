import { describe, it, expect, vi } from 'vitest';
import type { EventBus } from '@iraq-maps/contracts';
import { registerWebSocketRoute, type WsEvent } from './websocket.js';

// Minimal mock for Fastify/WebSocket test (no real server needed)
function makeMockBus() {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const bus = {
    subscribe: vi.fn((name: string, cb: (e: unknown) => void) => {
      listeners[name] = [...(listeners[name] ?? []), cb];
      return () => undefined;
    }),
    publish: vi.fn().mockResolvedValue(undefined),
    emit: (name: string, payload: unknown) => {
      for (const cb of listeners[name] ?? []) cb({ payload });
    },
  };
  return bus as unknown as EventBus & { emit: (name: string, payload: unknown) => void };
}

function makeMockSocket() {
  const sent: string[] = [];
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    send: vi.fn((msg: string) => sent.push(msg)),
    ping: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = [...(listeners[event] ?? []), cb];
    }),
    trigger: (event: string, ...args: unknown[]) => {
      for (const cb of listeners[event] ?? []) cb(...args);
    },
    sent,
  };
}

function makeMockFastify() {
  const routes: { path: string; opts: unknown; handler: (socket: unknown, req: unknown) => Promise<void> }[] = [];
  return {
    get: vi.fn((path: string, opts: unknown, handler: (socket: unknown, req: unknown) => Promise<void>) => {
      routes.push({ path, opts, handler });
    }),
    routes,
  };
}

describe('registerWebSocketRoute', () => {
  it('registers a /ws route', () => {
    const fastify = makeMockFastify();
    const bus = makeMockBus();
    registerWebSocketRoute(fastify as unknown as import('fastify').FastifyInstance, () => 'user-1', bus);
    expect(fastify.get).toHaveBeenCalledWith('/ws', expect.anything(), expect.any(Function));
  });

  it('closes with 4001 when no token provided', async () => {
    const fastify = makeMockFastify();
    const bus = makeMockBus();
    registerWebSocketRoute(fastify as unknown as import('fastify').FastifyInstance, () => 'user-1', bus);
    const socket = makeMockSocket();
    const req = { query: {} };
    await fastify.routes[0]!.handler(socket, req);
    expect(socket.close).toHaveBeenCalledWith(4001, 'missing token');
  });

  it('closes with 4003 when token is invalid', async () => {
    const fastify = makeMockFastify();
    const bus = makeMockBus();
    const verifyToken = vi.fn().mockRejectedValue(new Error('bad token'));
    registerWebSocketRoute(fastify as unknown as import('fastify').FastifyInstance, verifyToken, bus);
    const socket = makeMockSocket();
    const req = { query: { token: 'bad' } };
    await fastify.routes[0]!.handler(socket, req);
    expect(socket.close).toHaveBeenCalledWith(4003, 'invalid token');
  });

  it('sends connected frame on valid auth', async () => {
    const fastify = makeMockFastify();
    const bus = makeMockBus();
    registerWebSocketRoute(fastify as unknown as import('fastify').FastifyInstance, () => 'user-42', bus);
    const socket = makeMockSocket();
    const req = { query: { token: 'valid' } };
    await fastify.routes[0]!.handler(socket, req);
    expect(socket.sent[0]).toContain('connected');
    expect(socket.sent[0]).toContain('user-42');
  });

  it('pushes post.liked events to the right user', async () => {
    const fastify = makeMockFastify();
    const bus = makeMockBus();
    const { pushNotification } = registerWebSocketRoute(
      fastify as unknown as import('fastify').FastifyInstance,
      () => 'user-5',
      bus,
    );
    void pushNotification; // used in emit check below
    const socket = makeMockSocket();
    const req = { query: { token: 'valid' } };
    await fastify.routes[0]!.handler(socket, req);
    // Emit domain event
    bus.emit('discover.post.liked.v1', { postAuthorId: 'user-5', postId: 'p1', likedByUserId: 'user-6' });
    const events = socket.sent.slice(1).map((s) => JSON.parse(s) as WsEvent);
    expect(events.some((e) => e.type === 'post.liked')).toBe(true);
  });

  it('clientCount tracks connected clients', async () => {
    const fastify = makeMockFastify();
    const bus = makeMockBus();
    const { clientCount } = registerWebSocketRoute(
      fastify as unknown as import('fastify').FastifyInstance,
      () => 'user-99',
      bus,
    );
    expect(clientCount()).toBe(0);
    const socket = makeMockSocket();
    const req = { query: { token: 'valid' } };
    await fastify.routes[0]!.handler(socket, req);
    expect(clientCount()).toBe(1);
    // Simulate close
    (socket as ReturnType<typeof makeMockSocket>).trigger('close');
    expect(clientCount()).toBe(0);
  });
});
