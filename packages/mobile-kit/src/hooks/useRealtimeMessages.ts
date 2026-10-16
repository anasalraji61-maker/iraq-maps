/**
 * useRealtimeMessages – subscribe to real-time message events for a conversation.
 *
 * Provides:
 *   messages        – ordered array, newest at the end
 *   sendMessage     – optimistically adds then sends via WS (queued if offline)
 *   typing          – userIds currently typing in this conversation
 *   startTyping     – notify the other participant you started typing
 *   stopTyping      – notify the other participant you stopped typing
 *   status          – current WS connection state
 *
 * Falls back gracefully when the WebSocket is disconnected:
 *   - messages received before disconnect remain visible
 *   - sendMessage queues the message; it is delivered on reconnect
 *   - typing indicators are silenced
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeManager, type ConnectionState } from '../websocket/RealtimeManager';

// ── Shared types ─────────────────────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageType = 'text' | 'image' | 'location' | 'document' | 'voice';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId?: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  location?: { latitude: number; longitude: number; label?: string };
  document?: { filename: string; sizeBytes: number; mimeType: string };
  voiceUrl?: string;
  status: MessageStatus;
  createdAt: string;
  readAt?: string | null;
  replyTo?: {
    messageId: string;
    senderName: string;
    snippet: string;
  } | null;
  deletedForMe?: boolean;
  deletedForEveryone?: boolean;
}

// Server-pushed message.new payload
interface MessageNewPayload {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId?: string;
  type: MessageType;
  text?: string;
  imageUrl?: string;
  location?: Message['location'];
  document?: Message['document'];
  voiceUrl?: string;
  createdAt: string;
  replyTo?: Message['replyTo'];
}

// Server-pushed message.read payload
interface MessageReadPayload {
  conversationId: string;
  /** IDs of messages that were marked as read */
  messageIds: string[];
  readAt: string;
  readByUserId: string;
}

// Server-pushed typing payload
interface TypingPayload {
  conversationId: string;
  userId: string;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface UseRealtimeMessagesOptions {
  conversationId: string;
  /** The current user's ID (for optimistic updates) */
  currentUserId: string;
  /** The other participant's ID (for sending typing events) */
  recipientId: string;
  /** Initial messages (e.g. from an HTTP page load) */
  initialMessages?: Message[];
  /** Called when we should persist a sent message to the server (HTTP fallback). */
  onSendHttp?: (message: Pick<Message, 'conversationId' | 'type' | 'text' | 'replyTo'>) => Promise<Message>;
  /** Typing silence timeout in ms (default 3000) */
  typingSilenceMs?: number;
}

// ── Return type ────────────────────────────────────────────────────────────────

export interface UseRealtimeMessagesReturn {
  messages: Message[];
  sendMessage: (content: string, type?: MessageType, replyTo?: Message['replyTo']) => void;
  /** UserIds currently typing in this conversation (excluding currentUser) */
  typing: string[];
  startTyping: () => void;
  stopTyping: () => void;
  /** WS connection state */
  status: ConnectionState;
  /** True while sending is in progress */
  isSending: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPING_SILENCE_MS = 3_000;

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useRealtimeMessages({
  conversationId,
  currentUserId,
  recipientId,
  initialMessages = [],
  onSendHttp,
  typingSilenceMs = TYPING_SILENCE_MS,
}: UseRealtimeMessagesOptions): UseRealtimeMessagesReturn {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [typing, setTyping] = useState<string[]>([]);
  const [status, setStatus] = useState<ConnectionState>('disconnected');
  const [isSending, setIsSending] = useState(false);

  // Typing timers: userId → timer that auto-removes after silence
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // My own typing debounce timer
  const myTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether I'm currently broadcasting as "typing"
  const amTyping = useRef(false);

  // Get the singleton; may not be configured yet (no crash, just disconnected)
  const getManager = useCallback((): RealtimeManager | null => {
    try {
      return RealtimeManager.getInstance();
    } catch {
      return null;
    }
  }, []);

  // ── Subscribe to state changes ────────────────────────────────────────────
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;
    const unsub = manager.onStateChange(setStatus);
    setStatus(manager.getState());
    return unsub;
  }, [getManager]);

  // ── Subscribe to message.new ──────────────────────────────────────────────
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;

    const unsub = manager.on<MessageNewPayload>('message.new', (event) => {
      const p = event.payload;
      if (!p || p.conversationId !== conversationId) return;
      // Ignore echoes of our own messages (already added optimistically)
      if (p.senderId === currentUserId) return;

      const newMsg: Message = {
        id: p.id,
        conversationId: p.conversationId,
        senderId: p.senderId,
        recipientId: p.recipientId,
        type: p.type,
        text: p.text,
        imageUrl: p.imageUrl,
        location: p.location,
        document: p.document,
        voiceUrl: p.voiceUrl,
        status: 'delivered',
        createdAt: p.createdAt,
        replyTo: p.replyTo ?? null,
      };

      setMessages((prev) => {
        // De-duplicate by id
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      // Clear typing indicator for sender
      _clearTypingTimer(p.senderId);
      setTyping((prev) => prev.filter((uid) => uid !== p.senderId));
    });

    return unsub;
  }, [conversationId, currentUserId, getManager]);

  // ── Subscribe to message.read ─────────────────────────────────────────────
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;

    const unsub = manager.on<MessageReadPayload>('message.read', (event) => {
      const p = event.payload;
      if (!p || p.conversationId !== conversationId) return;
      const ids = new Set(p.messageIds);
      setMessages((prev) =>
        prev.map((m) =>
          ids.has(m.id) ? { ...m, status: 'read' as MessageStatus, readAt: p.readAt } : m,
        ),
      );
    });

    return unsub;
  }, [conversationId, getManager]);

  // ── Subscribe to typing events ────────────────────────────────────────────
  useEffect(() => {
    const manager = getManager();
    if (!manager) return;

    const handleTypingStart = (event: { payload?: TypingPayload }) => {
      const p = event.payload;
      if (!p || p.conversationId !== conversationId) return;
      if (p.userId === currentUserId) return;
      _clearTypingTimer(p.userId);
      setTyping((prev) => (prev.includes(p.userId) ? prev : [...prev, p.userId]));
      // Auto-remove after silence timeout (in case stop event is missed)
      const timer = setTimeout(() => {
        setTyping((prev) => prev.filter((uid) => uid !== p.userId));
        typingTimers.current.delete(p.userId);
      }, typingSilenceMs + 1_000);
      typingTimers.current.set(p.userId, timer);
    };

    const handleTypingStop = (event: { payload?: TypingPayload }) => {
      const p = event.payload;
      if (!p || p.conversationId !== conversationId) return;
      if (p.userId === currentUserId) return;
      _clearTypingTimer(p.userId);
      setTyping((prev) => prev.filter((uid) => uid !== p.userId));
    };

    const u1 = manager.on<TypingPayload>('user.typing.start', handleTypingStart);
    const u2 = manager.on<TypingPayload>('user.typing.stop', handleTypingStop);
    return () => { u1(); u2(); };
  }, [conversationId, currentUserId, typingSilenceMs, getManager]);

  // ── Cleanup typing timers on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      for (const timer of typingTimers.current.values()) clearTimeout(timer);
      typingTimers.current.clear();
      if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _clearTypingTimer(userId: string) {
    const t = typingTimers.current.get(userId);
    if (t) { clearTimeout(t); typingTimers.current.delete(userId); }
  }

  const _sendTypingEvent = useCallback((start: boolean) => {
    const manager = getManager();
    if (!manager || !manager.isConnected()) return;
    manager.send({
      type: start ? 'user.typing.start' : 'user.typing.stop',
      payload: { conversationId, recipientId, userId: currentUserId },
    });
  }, [getManager, conversationId, recipientId, currentUserId]);

  // ── sendMessage ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (content: string, type: MessageType = 'text', replyTo?: Message['replyTo']) => {
      if (!content.trim() && type === 'text') return;

      const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: Message = {
        id: optimisticId,
        conversationId,
        senderId: currentUserId,
        recipientId,
        type,
        text: type === 'text' ? content : undefined,
        status: 'sending',
        createdAt: new Date().toISOString(),
        replyTo: replyTo ?? null,
      };

      setMessages((prev) => [...prev, optimistic]);
      setIsSending(true);

      // Stop typing broadcast when a message is sent
      stopTyping();

      const manager = getManager();

      if (manager?.isConnected()) {
        // Send via WebSocket
        manager.send({
          type: 'message.send',
          payload: {
            conversationId,
            recipientId,
            type,
            text: content,
            replyTo,
            clientId: optimisticId,
          },
        });
        // Transition optimistic message to 'sent' after a short delay
        // (server will push message.new with the real id; until then, mark sent)
        setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId ? { ...m, status: 'sent' as MessageStatus } : m,
            ),
          );
          setIsSending(false);
        }, 400);
      } else if (onSendHttp) {
        // HTTP fallback when WS disconnected
        onSendHttp({ conversationId, type, text: content, replyTo })
          .then((confirmed) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === optimisticId ? { ...confirmed, status: 'sent' } : m)),
            );
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticId ? { ...m, status: 'failed' as MessageStatus } : m,
              ),
            );
          })
          .finally(() => setIsSending(false));
      } else {
        // No connection, no HTTP fallback – queue in manager if available
        if (manager) {
          manager.send({
            type: 'message.send',
            payload: { conversationId, recipientId, type, text: content, replyTo, clientId: optimisticId },
          });
        }
        // Mark as failed for now; will be retried when WS reconnects
        setTimeout(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId ? { ...m, status: 'failed' as MessageStatus } : m,
            ),
          );
          setIsSending(false);
        }, 300);
      }
    },
    [conversationId, currentUserId, recipientId, getManager, onSendHttp],
  );

  // ── startTyping ───────────────────────────────────────────────────────────

  const startTyping = useCallback(() => {
    if (!amTyping.current) {
      amTyping.current = true;
      _sendTypingEvent(true);
    }
    // Reset the auto-stop timer on each keystroke
    if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    myTypingTimer.current = setTimeout(() => {
      stopTyping();
    }, typingSilenceMs);
  }, [_sendTypingEvent, typingSilenceMs]);

  // ── stopTyping ────────────────────────────────────────────────────────────

  const stopTyping = useCallback(() => {
    if (myTypingTimer.current) { clearTimeout(myTypingTimer.current); myTypingTimer.current = null; }
    if (amTyping.current) {
      amTyping.current = false;
      _sendTypingEvent(false);
    }
  }, [_sendTypingEvent]);

  return {
    messages,
    sendMessage,
    typing,
    startTyping,
    stopTyping,
    status,
    isSending,
  };
}
