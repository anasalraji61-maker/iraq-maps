import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useCallback } from 'react';

const POSTS_KEY = '@iraq-maps/rating/postCount';
const MESSAGES_KEY = '@iraq-maps/rating/messageCount';
const PROMPTED_KEY = '@iraq-maps/rating/hasPrompted';
const THRESHOLD = 3;

async function increment(key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key);
  const next = (parseInt(raw ?? '0', 10) || 0) + 1;
  await AsyncStorage.setItem(key, String(next));
  return next;
}

async function maybePrompt(): Promise<void> {
  const prompted = await AsyncStorage.getItem(PROMPTED_KEY);
  if (prompted) return;
  const available = await StoreReview.isAvailableAsync();
  if (!available) return;
  await StoreReview.requestReview();
  await AsyncStorage.setItem(PROMPTED_KEY, '1');
}

/**
 * Returns callbacks that features call when the user creates a post or sends a message.
 * After THRESHOLD cumulative actions across both types, requests a store review once.
 */
export function useAppRating() {
  const onPostCreated = useCallback(async () => {
    try {
      const posts = await increment(POSTS_KEY);
      const msgRaw = await AsyncStorage.getItem(MESSAGES_KEY);
      const msgs = parseInt(msgRaw ?? '0', 10) || 0;
      if (posts + msgs >= THRESHOLD) await maybePrompt();
    } catch { /* never block the user action */ }
  }, []);

  const onMessageSent = useCallback(async () => {
    try {
      const msgs = await increment(MESSAGES_KEY);
      const postRaw = await AsyncStorage.getItem(POSTS_KEY);
      const posts = parseInt(postRaw ?? '0', 10) || 0;
      if (posts + msgs >= THRESHOLD) await maybePrompt();
    } catch { /* never block the user action */ }
  }, []);

  return { onPostCreated, onMessageSent };
}
