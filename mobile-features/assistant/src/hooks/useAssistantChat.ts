import { type AssistantResponseType } from '@iraq-maps/contracts';
import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAssistantClient } from '../client';
import { t } from '../strings';

const SESSION_KEY = '@assistant_session_id';
const MESSAGES_KEY = '@assistant_chat_history';
const MAX_PERSISTED_MESSAGES = 40;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface UseAssistantChatResult {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  isLoading: boolean;
  /** True once the persisted history has been loaded (or confirmed absent). */
  historyLoaded: boolean;
  composeParams?: AssistantResponseType['composeParams'];
  focusPlaceId?: AssistantResponseType['focusPlaceId'];
  focusPlaceIds?: AssistantResponseType['focusPlaceIds'];
  focusPlaceNames?: AssistantResponseType['focusPlaceNames'];
  error?: string;
}

export function useAssistantChat(
  sessionId: string,
  onSessionReady?: (id: string) => void,
): UseAssistantChatResult {
  const client = useAssistantClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [composeParams, setComposeParams] = useState<AssistantResponseType['composeParams']>(undefined);
  const [focusPlaceId, setFocusPlaceId] = useState<AssistantResponseType['focusPlaceId']>(undefined);
  const [focusPlaceIds, setFocusPlaceIds] = useState<AssistantResponseType['focusPlaceIds']>(undefined);
  const [focusPlaceNames, setFocusPlaceNames] = useState<AssistantResponseType['focusPlaceNames']>(undefined);
  const [error, setError] = useState<string | undefined>();

  // Load persisted message history on mount (for the current session only)
  useEffect(() => {
    AsyncStorage.getItem(`${MESSAGES_KEY}:${sessionId}`)
      .then((raw) => {
        if (raw) {
          try {
            const loaded = JSON.parse(raw) as ChatMessage[];
            setMessages(loaded);
          } catch { /* ignore corrupt data */ }
        }
      })
      .catch(() => { /* best-effort */ })
      .finally(() => setHistoryLoaded(true));
  // Only run on mount (sessionId won't change after construction)
  }, []);

  // Persist sessionId to AsyncStorage
  useEffect(() => {
    AsyncStorage.setItem(SESSION_KEY, sessionId).catch(() => {
      // best-effort — ignore errors
    });
    onSessionReady?.(sessionId);
  }, [sessionId, onSessionReady]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: Date.now() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setIsLoading(true);
      setComposeParams(undefined);
      setFocusPlaceId(undefined);
      setFocusPlaceIds(undefined);
      setFocusPlaceNames(undefined);
      setError(undefined);

      try {
        const res = await client.chat({
          body: {
            sessionId: sessionId as `${string}-${string}-${string}-${string}-${string}`,
            messages: nextMessages,
          },
        });

        if (res.status === 200) {
          const { reply, composeParams: cp, focusPlaceId: fpid, focusPlaceIds: fpids, focusPlaceNames: fpnames } = res.body;
          const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: Date.now() };
          setMessages((prev) => {
            const updated = [...prev, assistantMsg];
            const toStore = updated.slice(-MAX_PERSISTED_MESSAGES);
            AsyncStorage.setItem(`${MESSAGES_KEY}:${sessionId}`, JSON.stringify(toStore)).catch(() => {});
            return updated;
          });
          if (cp) setComposeParams(cp);
          if (fpid) setFocusPlaceId(fpid);
          if (fpids && fpids.length > 0) setFocusPlaceIds(fpids);
          if (fpnames) setFocusPlaceNames(fpnames);
        } else if (res.status === 429) {
          setError(t('chat.dailyLimit'));
        } else {
          setError(t('chat.error'));
        }
      } catch {
        setError(t('chat.error'));
      } finally {
        setIsLoading(false);
      }
    },
    [client, messages, sessionId, isLoading],
  );

  return { messages, send, isLoading, historyLoaded, composeParams, focusPlaceId, focusPlaceIds, focusPlaceNames, error };
}

/** Load the previously saved session id from storage. Returns null if none. */
export async function loadPersistedSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Clear the persisted session id so the next mount starts a fresh session. */
export async function clearPersistedSessionId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // best-effort
  }
}

/** Clear the persisted message history for a given session. */
export async function clearPersistedHistory(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${MESSAGES_KEY}:${sessionId}`);
  } catch {
    // best-effort
  }
}
