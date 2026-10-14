import { type AssistantResponseType } from '@iraq-maps/contracts';
import { useState, useCallback } from 'react';
import { useAssistantClient } from '../client.js';
import { t } from '../strings.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UseAssistantChatResult {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  isLoading: boolean;
  composeParams?: AssistantResponseType['composeParams'];
  error?: string;
}

export function useAssistantChat(sessionId: string): UseAssistantChatResult {
  const client = useAssistantClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [composeParams, setComposeParams] = useState<AssistantResponseType['composeParams']>(undefined);
  const [error, setError] = useState<string | undefined>();

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = { role: 'user', content: text.trim() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setIsLoading(true);
      setComposeParams(undefined);
      setError(undefined);

      try {
        const res = await client.chat({
          body: {
            sessionId: sessionId as `${string}-${string}-${string}-${string}-${string}`,
            messages: nextMessages,
          },
        });

        if (res.status === 200) {
          const { reply, composeParams: cp } = res.body;
          setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
          if (cp) setComposeParams(cp);
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

  return { messages, send, isLoading, composeParams, error };
}
