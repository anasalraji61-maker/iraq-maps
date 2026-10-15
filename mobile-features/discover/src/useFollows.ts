/**
 * useFollows — client-side follow store backed by AsyncStorage.
 * Follows are keyed by user ID. The follow state is stored so
 * the feed can filter posts by followed users offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'discover:follows:v1';

type FollowSet = string[]; // array of followed user IDs

async function readStorage(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? new Set<string>(JSON.parse(raw) as FollowSet) : new Set();
  } catch {
    return new Set();
  }
}

async function writeStorage(s: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
  } catch {
    // best-effort
  }
}

export interface UseFollows {
  followedIds: ReadonlySet<string>;
  isFollowing: (userId: string) => boolean;
  toggleFollow: (userId: string) => Promise<void>;
  loading: boolean;
}

export function useFollows(): UseFollows {
  const [set, setSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    readStorage().then((s) => {
      if (!cancelled) {
        setSet(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isFollowing = useCallback((userId: string) => set.has(userId), [set]);

  const toggleFollow = useCallback(async (userId: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      writeStorage(next);
      return next;
    });
  }, []);

  return { followedIds: set, isFollowing, toggleFollow, loading };
}
