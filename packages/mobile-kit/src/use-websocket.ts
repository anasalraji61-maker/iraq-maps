/**
 * useWebSocket: connects to the iraq-maps WS endpoint, handles
 * reconnection with exponential backoff, and dispatches received events.
 *
 * Usage:
 *   const { status, send } = useWebSocket({ token, onEvent });
 *
 * Connection indicator: `status` is 'connected' | 'connecting' | 'disconnected'
 */
import { useEffect, useRef, useCallback, useState } from 'react';

export type WsStatus = 'connected' | 'connecting' | 'disconnected';

export interface WsIncomingEvent {
  type: string;
  payload?: unknown;
  userId?: string;
}

export interface UseWebSocketOptions {
  /** WebSocket URL, e.g. wss://api.example.com/ws */
  url: string;
  /** JWT token for authentication (passed as ?token= query param) */
  token: string | null;
  /** Called for each incoming event */
  onEvent?: (event: WsIncomingEvent) => void;
  /** Disable auto-connect (useful in tests or when logged out) */
  disabled?: boolean;
  /** Initial backoff in ms (default 1000) */
  initialBackoffMs?: number;
  /** Maximum backoff in ms (default 30000) */
  maxBackoffMs?: number;
}

export interface UseWebSocketReturn {
  status: WsStatus;
  send: (data: unknown) => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebSocket({
  url,
  token,
  onEvent,
  disabled = false,
  initialBackoffMs = 1_000,
  maxBackoffMs = 30_000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wsRef = useRef<any>(null);
  const attemptsRef = useRef(0);
  const backoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!token || disabled) return;
    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;
    setStatus('connecting');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ws: any;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      setStatus('disconnected');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      attemptsRef.current = 0;
      setStatus('connected');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.onmessage = (e: any) => {
      if (typeof e.data !== 'string') return;
      try {
        const event = JSON.parse(e.data) as WsIncomingEvent;
        onEventRef.current?.(event);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      if (disabled) return;
      const attempt = attemptsRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) return;
      attemptsRef.current = attempt + 1;
      const backoff = Math.min(initialBackoffMs * 2 ** attempt, maxBackoffMs);
      backoffTimerRef.current = setTimeout(connect, backoff);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, token, disabled, initialBackoffMs, maxBackoffMs]);

  useEffect(() => {
    if (disabled || !token) {
      setStatus('disconnected');
      return;
    }
    connect();
    return () => {
      if (backoffTimerRef.current) clearTimeout(backoffTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, token, disabled]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send };
}
