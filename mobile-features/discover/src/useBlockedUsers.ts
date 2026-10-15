/**
 * useBlockedUsers — client-side block list stored in AsyncStorage.
 * Blocked users' posts are filtered out of every feed view.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'discover:blockedUsers:v1';

export function useBlockedUsers(): {
  blockedIds: ReadonlySet<string>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  isBlocked: (userId: string) => boolean;
} {
  const [blockedIds, setBlockedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) setBlockedIds(new Set(ids));
      } catch {
        // corrupt data — start fresh
      }
    });
  }, []);

  const persist = useCallback((next: Set<string>) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...next])).catch(() => {/* silent */});
  }, []);

  const blockUser = useCallback(async (userId: string) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      persist(next);
      return next;
    });
  }, [persist]);

  const unblockUser = useCallback(async (userId: string) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      next.delete(userId);
      persist(next);
      return next;
    });
  }, [persist]);

  const isBlocked = useCallback((userId: string) => blockedIds.has(userId), [blockedIds]);

  return { blockedIds, blockUser, unblockUser, isBlocked };
}
