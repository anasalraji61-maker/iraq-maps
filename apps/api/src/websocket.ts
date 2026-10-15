/**
 * WebSocket support for iraq-maps API.
 *
 * Endpoint: GET /ws?token=<JWT>
 * Authentication: JWT passed as `token` query param (same JWT as Authorization Bearer).
 * Events pushed to the client: post.liked, comment.added, user.followed, notification.new
 *
 * Connection lifecycle:
 * 1. Client connects with JWT in `?token=` query param.
 * 2. Server validates the JWT and associates the socket with a userId.
 * 3. Client receives events scoped to that userId.
 * 4. Server pings every 30s; client must pong within 10s or gets disconnected.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket as WSSocket } from '@fastify/websocket';
import type { EventBus } from '@iraq-maps/contracts';
import type { Logger } from '@iraq-maps/observability';

export type WsEventType = 'post.liked' | 'comment.added' | 'user.followed' | 'notification.new';

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
}

/** Per-connection state. */
interface WsClient {
  userId: string;
  socket: WSSocket;
  pingTimer?: ReturnType<typeof setInterval>;
}

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

/**
 * Registers the /ws WebSocket route on the Fastify instance.
 * @param fastify - the Fastify app (already has @fastify/websocket registered)
 * @param verifyToken - verify a JWT and return userId, or throw
 * @param bus - domain event bus to subscribe to
 * @param log - optional logger
 */
export function registerWebSocketRoute(
  fastify: FastifyInstance,
  verifyToken: (token: string) => string | Promise<string>,
  bus: EventBus,
  log?: Logger,
) {
  const clients = new Map<string, WsClient[]>();

  /** Push an event to all sockets belonging to userId. */
  const pushTo = (userId: string, event: WsEvent) => {
    const sockets = clients.get(userId) ?? [];
    const msg = JSON.stringify(event);
    for (const client of sockets) {
      try {
        client.socket.send(msg);
      } catch {
        // socket closed; will be removed on 'close' event
      }
    }
  };

  // Subscribe to domain events and fan-out to relevant sockets
  bus.subscribe('discover.post.liked.v1', (e) => {
    pushTo(e.payload.postAuthorId, { type: 'post.liked', payload: e.payload });
  });
  bus.subscribe('discover.post.commented.v1', (e) => {
    pushTo(e.payload.postAuthorId, { type: 'comment.added', payload: e.payload });
  });
  bus.subscribe('discover.user.followed.v1', (e) => {
    pushTo(e.payload.followeeId, { type: 'user.followed', payload: e.payload });
  });

  fastify.get(
    '/ws',
    { websocket: true } as Parameters<typeof fastify.get>[1],
    async (socket: WSSocket, req: FastifyRequest) => {
      const token = (req.query as Record<string, string | undefined>)['token'];
      if (!token) {
        socket.close(4001, 'missing token');
        return;
      }

      let userId: string;
      try {
        userId = await verifyToken(token);
      } catch {
        socket.close(4003, 'invalid token');
        return;
      }

      // Register client
      const client: WsClient = { userId, socket };
      clients.set(userId, [...(clients.get(userId) ?? []), client]);
      log?.info({ userId }, 'ws client connected');

      // Ping/pong keepalive
      let pongReceived = true;
      client.pingTimer = setInterval(() => {
        if (!pongReceived) {
          socket.close(1001, 'pong timeout');
          return;
        }
        pongReceived = false;
        try {
          socket.ping();
        } catch {
          /* already closed */
        }
        setTimeout(() => {
          if (!pongReceived) {
            try { socket.close(1001, 'pong timeout'); } catch { /* already closed */ }
          }
        }, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);

      socket.on('pong', () => { pongReceived = true; });

      socket.on('close', () => {
        if (client.pingTimer) clearInterval(client.pingTimer);
        const remaining = (clients.get(userId) ?? []).filter((c) => c !== client);
        if (remaining.length === 0) {
          clients.delete(userId);
        } else {
          clients.set(userId, remaining);
        }
        log?.info({ userId }, 'ws client disconnected');
      });

      // Send a welcome frame so the client knows the connection is ready
      socket.send(JSON.stringify({ type: 'connected', userId }));
    },
  );

  /** For testing: push a notification.new event to a user. */
  return {
    pushNotification: (userId: string, payload: unknown) => pushTo(userId, { type: 'notification.new', payload }),
    clientCount: () => [...clients.values()].reduce((acc, arr) => acc + arr.length, 0),
  };
}
