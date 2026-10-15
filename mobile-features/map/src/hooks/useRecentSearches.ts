/**
 * M58: Persist recent searches across app sessions.
 *
 * Stores an ordered list of search terms in AsyncStorage so the search panel
 * shows previous searches even after the app is restarted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '@iraq-maps/map/recent-searches';
const MAX_ITEMS = 8;

async function load(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function persist(items: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // best-effort
  }
}

export interface RecentSearchesHook {
  /** Currently saved search terms, most recent first. */
  items: string[];
  /** Add a term (deduplicates, caps at MAX_ITEMS). */
  add: (term: string) => void;
  /** Remove all saved searches. */
  clear: () => void;
}

export function useRecentSearches(): RecentSearchesHook {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    void load().then(setItems);
  }, []);

  const add = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setItems((prev) => {
      const next = [trimmed, ...prev.filter((r) => r !== trimmed)].slice(0, MAX_ITEMS);
      void persist(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    void persist([]);
  }, []);

  return { items, add, clear };
}
