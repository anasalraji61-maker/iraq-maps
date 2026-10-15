/**
 * Client-side emoji reactions for messages.
 * Stored in AsyncStorage keyed by inquiryId.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const REACTIONS_KEY = '@iraq-maps/messages/reactions';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

type ReactionsStore = Record<string, ReactionEmoji | undefined>;

async function loadReactions(): Promise<ReactionsStore> {
  try {
    const raw = await AsyncStorage.getItem(REACTIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ReactionsStore;
  } catch {
    return {};
  }
}

async function saveReactions(store: ReactionsStore): Promise<void> {
  try {
    await AsyncStorage.setItem(REACTIONS_KEY, JSON.stringify(store));
  } catch {
    // Best-effort
  }
}

/** Returns the current reaction for an inquiry and a setter. */
export function useReaction(inquiryId: string): {
  reaction: ReactionEmoji | undefined;
  setReaction: (emoji: ReactionEmoji | undefined) => Promise<void>;
} {
  const [reaction, setReactionState] = useState<ReactionEmoji | undefined>();

  useEffect(() => {
    void loadReactions().then((store) => setReactionState(store[inquiryId]));
  }, [inquiryId]);

  const setReaction = useCallback(
    async (emoji: ReactionEmoji | undefined) => {
      const store = await loadReactions();
      if (emoji === undefined) {
        delete store[inquiryId];
      } else {
        store[inquiryId] = emoji;
      }
      await saveReactions(store);
      setReactionState(emoji);
    },
    [inquiryId],
  );

  return { reaction, setReaction };
}
