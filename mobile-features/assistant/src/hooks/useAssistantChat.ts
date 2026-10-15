import { type AssistantResponseType } from '@iraq-maps/contracts';
import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAssistantClient } from '../client';
import { t } from '../strings';

const SESSION_KEY = '@assistant_session_id';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface UseAssistantChatResult {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  isLoading: boolean;
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
  const [isLoading, setIsLoading] = useState(false);
  const [composeParams, setComposeParams] = useState<AssistantResponseType['composeParams']>(undefined);
  const [focusPlaceId, setFocusPlaceId] = useState<AssistantResponseType['focusPlaceId']>(undefined);
  const [focusPlaceIds, setFocusPlaceIds] = useState<AssistantResponseType['focusPlaceIds']>(undefined);
  const [focusPlaceNames, setFocusPlaceNames] = useState<AssistantResponseType['focusPlaceNames']>(undefined);
  const [error, setError] = useState<string | undefined>();

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
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: reply, timestamp: Date.now() },
          ]);
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

  return { messages, send, isLoading, composeParams, focusPlaceId, focusPlaceIds, focusPlaceNames, error };
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
